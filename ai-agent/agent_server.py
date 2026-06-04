"""
AI 에이전트 서버 — FastAPI + LangGraph ReAct + Ollama (qwen3:30b-a3b) + MCP
포트: 8000

엔드포인트:
  POST /api/agent/chat          → 자유 챗봇 (지도 페이지)
  POST /api/agent/district-report → 구 단위 리포트 (메인 대시보드)
  GET  /health                  → 서버 상태 확인
"""

import sys
import os
import asyncio
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import httpx
from ollama import AsyncClient as OllamaAsyncClient
from langchain_ollama import ChatOllama
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_core.messages import AIMessage
from langgraph.prebuilt import create_react_agent

# ── 설정 ────────────────────────────────────────────────────────────────────────

OLLAMA_URL  = "http://localhost:11434"
OLLAMA_MODEL = "qwen3:30b-a3b"
MCP_SERVER_PATH = os.path.join(os.path.dirname(__file__), "mcp_server.py")
PYTHON_BIN  = sys.executable

# ── Ollama httpx 클라이언트 (stop 시 직접 닫기 위해 공유) ──────────────────────────

_ollama_client = OllamaAsyncClient(host=OLLAMA_URL)

# ── LLM & 에이전트 초기화 ────────────────────────────────────────────────────────

llm = ChatOllama(
    model=OLLAMA_MODEL,
    async_client=_ollama_client,
    base_url=OLLAMA_URL,
    temperature=0.3,
    num_predict=4096,
    num_ctx=8192,
)

# 시뮬레이션 전용 LLM — think 모드 비활성화 + 출력 토큰 제한
sim_llm = ChatOllama(
    model=OLLAMA_MODEL,
    base_url=OLLAMA_URL,
    temperature=0.3,
    num_predict=16384,
    num_ctx=16384,
    think=False,
)

# 에이전트는 앱 시작 시 한 번만 생성 (MCP 클라이언트 포함)
agent = None
mcp_client = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global agent, mcp_client

    mcp_client = MultiServerMCPClient({
        "traffic": {
            "command": PYTHON_BIN,
            "args": [MCP_SERVER_PATH],
            "transport": "stdio",
        }
    })

    tools = await mcp_client.get_tools()
    agent = create_react_agent(llm, tools)
    print(f"[에이전트] MCP 도구 {len(tools)}개 로드 완료", flush=True)

    yield


app = FastAPI(title="Traffic AI Agent", lifespan=lifespan)


async def agent_stream_with_cancel(request: Request, prompt: str):
    """에이전트 스트리밍 — 클라이언트 disconnect 시 aclose()로 Ollama 연결까지 완전 차단"""
    queue: asyncio.Queue = asyncio.Queue()

    async def _run():
        # generator를 변수에 담아 취소 시 aclose() 명시 호출 가능하게
        gen = agent.astream_events(
            {"messages": [{"role": "user", "content": prompt}]},
            version="v2",
            config={"recursion_limit": 10},
        )
        try:
            async for event in gen:
                await queue.put(("event", event))
        except asyncio.CancelledError:
            # aclose() 명시 호출 → httpx → Ollama 소켓 강제 종료
            await gen.aclose()
        except Exception as e:
            await queue.put(("error", e))
        finally:
            await queue.put(("done", None))

    task = asyncio.create_task(_run())
    try:
        while True:
            if await request.is_disconnected():
                print("[DISCONNECT] 클라이언트 연결 끊김 — 에이전트 취소", flush=True)
                task.cancel()
                # task가 완전히 끝날 때까지 대기 (aclose 포함)
                try:
                    await asyncio.wait_for(task, timeout=3.0)
                except (asyncio.CancelledError, asyncio.TimeoutError):
                    pass
                print("[DISCONNECT] 에이전트 취소 완료", flush=True)
                return
            try:
                kind, value = await asyncio.wait_for(queue.get(), timeout=0.3)
            except asyncio.TimeoutError:
                continue
            if kind == "done":
                break
            yield kind, value
    finally:
        if not task.done():
            task.cancel()
            try:
                await asyncio.wait_for(task, timeout=3.0)
            except (asyncio.CancelledError, asyncio.TimeoutError):
                pass


app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8080"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 요청/응답 모델 ───────────────────────────────────────────────────────────────

class NavIntentRequest(BaseModel):
    text: str

class ChatRequest(BaseModel):
    question: str
    crsrdId: str | None = None       # 선택된 교차로 ID (없으면 에이전트가 검색)
    userEmail: str | None = None     # 요청한 유저 이메일 (메일 발송 시 사용)

class SimulationChatRequest(BaseModel):
    question: str
    context: dict | None = None         # 단일 신호계획 (기존 수동 챗봇용)
    contexts: list | None = None        # 다중 병목 교차로 신호계획 [{ intNo, intNm, phases, ... }]
    simulation: list | None = None      # 관제사 조정값 [{ no, sec, dirs }]
    routeTraffic: list | None = None    # 경로 구간별 실시간 속도 [{ fromIntNo, toIntNo, axisName, speedKph, congestion }]
    userEmail: str | None = None        # 요청한 유저 이메일 (메일 발송 시 사용)

class DistrictRequest(BaseModel):
    district: str
    userEmail: str | None = None  # 로그인한 유저 이메일 (없으면 발송 안 함)

class ChatResponse(BaseModel):
    answer: str
    adjustment: dict | None = None       # 단일 (하위 호환)
    adjustments: list | None = None      # 다중 병목 조정값

class ReportResponse(BaseModel):
    report: str
    district: str

# ── 헬퍼 ────────────────────────────────────────────────────────────────────────

def extract_adjustments(text: str):
    """AI 응답에서 JSON 파싱 → adjustments 리스트 반환
    지원 형식:
      ```json { "adjustments": [...] } ```  ← 백틱 형식
      {"adjustments": [...]} 텍스트         ← 백틱 없는 raw JSON
      { "intNo": "...", "phases": [...] }   ← 단일 (하위 호환)
    """
    import re as _re
    import json as _j

    def _parse(data):
        if isinstance(data, dict) and "adjustments" in data:
            items = data["adjustments"]
            valid = [a for a in items if isinstance(a, dict) and "intNo" in a and "phases" in a]
            return valid if valid else None
        if isinstance(data, dict) and "intNo" in data and "phases" in data:
            return [data]
        return None

    # 1. ```json...``` 형식
    match = _re.search(r"```json\s*(.*?)\s*```", text, _re.DOTALL)
    if match:
        try:
            return _parse(_j.loads(match.group(1)))
        except Exception:
            pass

    # 2. 백틱 없이 { 로 시작하는 raw JSON
    start = text.find('{"adjustments"')
    if start == -1:
        start = text.find('{"intNo"')
    if start != -1:
        try:
            decoder = _j.JSONDecoder()
            data, _ = decoder.raw_decode(text[start:])
            return _parse(data)
        except Exception:
            pass

    return None


def strip_json_block(text: str) -> str:
    """AI 응답에서 JSON 블록 제거 — 사용자 표시용 텍스트 정리"""
    import re as _re
    import json as _j
    # ```json...``` 제거
    cleaned = _re.sub(r"```json.*?```", "", text, flags=_re.DOTALL).strip()
    # 앞에 붙은 raw JSON 제거
    if cleaned.startswith('{"adjustments"') or cleaned.startswith('{"intNo"'):
        try:
            decoder = _j.JSONDecoder()
            _, end_idx = decoder.raw_decode(cleaned)
            cleaned = cleaned[end_idx:].strip()
        except Exception:
            pass
    return cleaned


def extract_answer(result: dict) -> str:
    """LangGraph ReAct 결과에서 최종 텍스트 추출"""
    messages = result.get("messages", [])
    for msg in reversed(messages):
        if not isinstance(msg, AIMessage):
            continue
        raw = msg.content
        if isinstance(raw, list):
            content = " ".join(
                item.get("text", "") if isinstance(item, dict) else str(item)
                for item in raw
            ).strip()
        else:
            content = raw or ""
        if not content:
            continue
        # <think> 태그 제거 — 태그 밖에 내용이 없으면 태그 안 내용 사용
        if "<think>" in content:
            after = content.split("</think>")[-1].strip()
            if after:
                return after
            # </think> 뒤가 비어있으면 think 블록 내용 자체를 반환
            inside = content.split("<think>", 1)[-1].split("</think>")[0].strip()
            if inside:
                return inside
            continue
        return content
    return "응답을 생성할 수 없습니다."

# ── 엔드포인트 ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "model": OLLAMA_MODEL, "mcp": "connected"}


@app.post("/api/nav/intent")
async def nav_intent(req: NavIntentRequest):
    """음성 명령 의도 분류 — 데이터 조회 없이 텍스트만 파싱해서 JSON 반환"""
    import json as _json

    SEOUL_GU = [
        "종로구","중구","용산구","성동구","광진구","동대문구","중랑구","성북구",
        "강북구","도봉구","노원구","은평구","서대문구","마포구","양천구","강서구",
        "구로구","금천구","영등포구","동작구","관악구","서초구","강남구","송파구","강동구",
    ]

    prompt = f"""너는 교통 관제 시스템의 음성 명령 분류기야.
아래 사용자 명령을 분석해서 반드시 JSON 한 줄만 출력해. 다른 말은 절대 하지 마.

분류 규칙:
1. 페이지 이동 명령 → {{"action":"navigate","page":"map|simulation|cctv|news"}}
   - 지도/맵/실시간 지도 → map
   - 시뮬레이션/신호/신호등 → simulation
   - CCTV/씨씨티비/카메라 → cctv
   - 뉴스/감성 → news
2. 구 선택 명령 → {{"action":"select_gu","gu":"구이름"}}
   - 서울 25개 구 중 하나가 포함되면: {', '.join(SEOUL_GU)}
3. 마이페이지 → {{"action":"mypage"}}
   - 마이페이지/내 정보/프로필/설정
4. 로그아웃 → {{"action":"logout"}}
   - 로그아웃/나가기/종료
5. 위 어디에도 해당 없으면 → {{"action":"unknown"}}

명령: {req.text}
JSON:"""

    try:
        response = await llm.ainvoke(prompt)
        raw = response.content if hasattr(response, "content") else str(response)
        # <think> 블록 제거
        if "<think>" in raw:
            raw = raw.split("</think>")[-1].strip()
        # JSON 추출 (중괄호만)
        start, end = raw.find("{"), raw.rfind("}") + 1
        if start == -1 or end == 0:
            return {"action": "unknown"}
        return _json.loads(raw[start:end])
    except Exception:
        return {"action": "unknown"}


@app.post("/api/agent/stop")
async def stop_agent():
    """진행 중인 Ollama 요청 즉시 차단 — httpx 소켓 강제 종료 후 재생성"""
    global _ollama_client
    try:
        await _ollama_client._client.aclose()
        print("[STOP] Ollama 연결 강제 종료", flush=True)
    except Exception as e:
        print(f"[STOP] 오류: {e}", flush=True)
    # 다음 요청을 위해 새 httpx 클라이언트로 교체
    _ollama_client._client = httpx.AsyncClient(
        base_url=OLLAMA_URL,
        timeout=httpx.Timeout(None),
    )
    return {"status": "stopped"}


@app.post("/api/agent/chat", response_model=ChatResponse)
async def free_chat(req: ChatRequest):
    """지도 페이지 자유 챗봇 — 에이전트가 교차로 검색 후 분석"""

    email_ctx = (
        f"\n[요청 유저 이메일: {req.userEmail}]"
        f"\n메일 발송 요청이 있으면 send_email_report 도구를 호출하고 to 필드에 위 이메일을 반드시 사용할 것."
    ) if req.userEmail else ""

    if req.crsrdId:
        prompt = (
            f"/no_think\n"
            f"교차로 ID {req.crsrdId}의 실시간 교통 데이터를 조회하고, "
            f"다음 질문에 한국어로 답해줘: {req.question}"
            f"{email_ctx}"
        )
    else:
        prompt = (
            f"/no_think\n"
            f"서울 교통 관제 시스템이야. 반드시 한국어로 답해줘.\n"
            f"필요하면 MCP 도구로 데이터를 조회해서 답해줘.\n"
            f"질문: {req.question}"
            f"{email_ctx}"
        )

    result = await agent.ainvoke({"messages": [{"role": "user", "content": prompt}]})
    return ChatResponse(answer=extract_answer(result))


TOOL_LABELS = {
    "get_traffic_data":        "교차로 실시간 데이터 조회",
    "get_bottleneck_list":     "전체 병목 목록 조회",
    "search_crossroad_by_name":"교차로 이름 검색",
    "get_district_traffic":    "자치구 교통 현황 조회",
    "set_signal_timing":       "신호 타이밍 조정",
    "send_alert":              "관제사 알림 전송",
    "send_email_report":       "이메일 리포트 전송",
    "get_simulation_context":  "신호계획 조회",
    "search_project_docs":     "도메인 지식 검색",
}


@app.post("/api/agent/chat/stream")
async def free_chat_stream(req: ChatRequest, request: Request):
    """ReAct 루프 단계별 SSE 스트리밍 — 프론트 팝업 시각화용"""
    import json as _json

    email_ctx = (
        f"\n[요청 유저 이메일: {req.userEmail}]"
        f"\n메일 발송 요청이 있으면 send_email_report 도구를 호출하고 to 필드에 위 이메일을 반드시 사용할 것."
    ) if req.userEmail else ""

    if req.crsrdId:
        prompt = (
            f"/no_think\n"
            f"교차로 ID {req.crsrdId}의 실시간 교통 데이터를 조회하고, "
            f"다음 질문에 한국어로 답해줘: {req.question}{email_ctx}"
        )
    else:
        prompt = (
            f"/no_think\n"
            f"서울 교통 관제 시스템이야. 반드시 한국어로 답해줘.\n"
            f"필요하면 MCP 도구로 데이터를 조회해서 답해줘.\n"
            f"질문: {req.question}{email_ctx}"
        )

    async def generate():
        try:
            async for msg_kind, event in agent_stream_with_cancel(request, prompt):
                if msg_kind == "error":
                    yield f"data: {_json.dumps({'type': 'error', 'content': str(event)}, ensure_ascii=False)}\n\n"
                    return
                kind = event["event"]
                name = event.get("name", "")

                # ── 도구 호출 시작 ──────────────────────────────────────────
                if kind == "on_tool_start":
                    args = event["data"].get("input", {})
                    args_str = ", ".join(f"{k}={v}" for k, v in args.items()) if args else ""
                    data = {
                        "type": "action",
                        "tool": name,
                        "label": TOOL_LABELS.get(name, name),
                        "args": args_str,
                    }
                    yield f"data: {_json.dumps(data, ensure_ascii=False)}\n\n"

                # ── 도구 결과 수신 ──────────────────────────────────────────
                elif kind == "on_tool_end":
                    output = event["data"].get("output")
                    obs = ""
                    if output is not None:
                        raw = str(output.content) if hasattr(output, "content") else str(output)
                        try:
                            parsed = _json.loads(raw)
                            if isinstance(parsed, dict):
                                keys = list(parsed.keys())[:4]
                                obs = "{ " + ", ".join(keys) + (" ..." if len(parsed) > 4 else "") + " }"
                            elif isinstance(parsed, list):
                                obs = f"[{len(parsed)}개 항목 반환]"
                            else:
                                obs = raw[:150]
                        except Exception:
                            obs = raw[:150]
                    yield f"data: {_json.dumps({'type': 'observation', 'content': obs}, ensure_ascii=False)}\n\n"

                # ── LLM 응답 완료 ───────────────────────────────────────────
                elif kind == "on_chat_model_end":
                    output = event["data"].get("output")
                    if not output:
                        continue
                    has_tool_calls = bool(getattr(output, "tool_calls", None))
                    content = output.content if hasattr(output, "content") else ""
                    if isinstance(content, list):
                        content = " ".join(
                            item.get("text", "") if isinstance(item, dict) else str(item)
                            for item in content
                        ).strip()

                    # <think> 블록 → Thought 이벤트로 전송
                    if content and "<think>" in content:
                        inside = content.split("<think>", 1)[-1].split("</think>")[0].strip()
                        if inside:
                            yield f"data: {_json.dumps({'type': 'thought', 'content': inside[:200]}, ensure_ascii=False)}\n\n"

                    # 도구 호출 없는 마지막 응답 = 최종 답변
                    if not has_tool_calls and content:
                        if "<think>" in content:
                            after = content.split("</think>")[-1].strip()
                            content = after if after else content
                        if content:
                            yield f"data: {_json.dumps({'type': 'answer', 'content': content}, ensure_ascii=False)}\n\n"

        except Exception as e:
            yield f"data: {_json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

        yield 'data: {"type":"done"}\n\n'

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/agent/simulation-chat", response_model=ChatResponse)
async def simulation_chat(req: SimulationChatRequest):
    """시뮬레이션 페이지 챗봇 — Spring이 조립한 컨텍스트를 프롬프트에 직접 삽입"""
    import json

    # 단일 context (수동 챗봇)
    ctx_block = ""
    if req.context and not req.contexts:
        c = req.context
        phases = c.get("phases", [])
        phase_str = ", ".join(
            f"현시{p.get('no')}:{p.get('sec')}s({'/'.join(p.get('dirs', []))})"
            for p in phases
        )
        ctx_block = f"\n\n[신호계획 - {c.get('intNm') or c.get('intNo')} (intNo:{c.get('intNo')})] cycleVal={c.get('cycleVal')}s | {phase_str}"

    # 다중 contexts (병목 자동 분석) — 토큰 절약을 위해 요약 형식
    if req.contexts:
        parts = []
        for c in req.contexts:
            name = c.get("intNm") or c.get("intNo") or "?"
            phases = c.get("phases", [])
            phase_str = ", ".join(
                f"현시{p.get('no')}:{p.get('sec')}s({'/'.join(p.get('dirs', []))})"
                for p in phases
            )
            parts.append(f"[신호계획 - {name} (intNo:{c.get('intNo')})] cycleVal={c.get('cycleVal')}s | {phase_str}")
        ctx_block = "\n\n" + "\n".join(parts)

    sim_block = ""
    if req.simulation:
        sim_block = (
            f"\n\n[관제사 조정값]\n"
            f"{json.dumps(req.simulation, ensure_ascii=False, indent=2)}\n"
            f"원래 신호계획과 비교해서 어떤 현시가 얼마나 바뀌었는지 분석해줘."
        )

    traffic_block = ""
    if req.routeTraffic:
        lines = []
        for seg in req.routeTraffic:
            spd = seg.get("speedKph")
            cng = seg.get("congestion", "")
            spd_str = f"{spd}km/h" if spd is not None else "미수집"
            bottleneck_mark = " ★병목" if spd is not None and spd < 15 else ""
            lines.append(
                f"  {seg.get('fromIntNo','?')}→{seg.get('toIntNo','?')}"
                f" ({seg.get('axisName','')}) | {spd_str} | {cng}{bottleneck_mark}"
            )
        traffic_block = (
            "\n\n[경로 구간별 실시간 속도 — 15km/h 이하가 병목]\n" + "\n".join(lines)
        )

    # Webster 공식 기반 JSON 출력 지시
    json_instruction = (
        "\n\n[신호 최적화 방법 — Webster 공식 적용]\n"
        "Co = (1.5 × L + 5) / (1 - Y)\n"
        "  L = 현시 수 × 4초 (손실 시간)\n"
        "  Y = 포화도 합계 (속도 기반: 15km/h 미만=0.85, 15~25=0.65, 25초과=0.4)\n"
        "계산된 Co를 각 현시 중요도 비율로 배분해 조정초(sec)를 결정해.\n"
        "직진 방향이 막히면 직진 현시 비중을 높이고, 보행자 현시는 최소 20초 유지.\n\n"
        "반드시 아래 JSON 블록을 답변 맨 앞에 먼저 출력하고 그 뒤 1~2문장 설명을 붙여:\n"
        "```json\n"
        "{\"adjustments\": [{\"intNo\": \"47\", \"phases\": [{\"no\": 1, \"sec\": 80}, {\"no\": 2, \"sec\": 60}]}]}\n"
        "```\n"
        "위 예시처럼 intNo에는 신호계획 괄호 안의 실제 숫자를 그대로 쓸 것. 교차로 이름 절대 금지.\n"
        "phases는 위 신호계획의 기존 현시만 사용. 전체 합계가 cycleVal을 초과하지 말 것."
    )

    prompt = (
        f"서울 신호 시뮬레이션 시스템이야. 반드시 한국어로 답해줘."
        f"{ctx_block}"
        f"{sim_block}"
        f"{traffic_block}"
        f"{json_instruction}\n\n"
        f"질문: {req.question}"
    )

    # 시뮬레이션 챗은 도구 호출 불필요 → sim_llm 직접 호출 (think=False)
    print(f"\n[SIM-CHAT PROMPT — 총 {len(prompt)}자]\n{prompt}\n", flush=True)
    response = await sim_llm.ainvoke(prompt)
    raw = response.content if hasattr(response, "content") else str(response)
    print(f"\n[SIM-CHAT RAW]\n{raw[:600]}\n", flush=True)
    if isinstance(raw, list):
        raw = " ".join(item.get("text", "") if isinstance(item, dict) else str(item) for item in raw).strip()
    if "<think>" in raw:
        after = raw.split("</think>")[-1].strip()
        raw = after if after else raw.split("<think>", 1)[-1].split("</think>")[0].strip()

    adjustments = extract_adjustments(raw)
    clean_answer = strip_json_block(raw).strip() if adjustments else raw.strip()

    # JSON만 반환하고 설명이 없으면 기본 메시지 생성
    if not clean_answer and adjustments:
        names = ", ".join(a.get("intNo", "") for a in adjustments)
        clean_answer = f"Webster 공식 기반으로 교차로 {names}의 신호를 최적화했습니다."
    elif not clean_answer:
        clean_answer = "신호계획을 분석했습니다. 현재 구간의 속도 데이터를 확인하세요."

    return ChatResponse(
        answer=clean_answer,
        adjustment=adjustments[0] if adjustments and len(adjustments) == 1 else None,
        adjustments=adjustments,
    )


@app.post("/api/agent/simulation-chat/stream")
async def simulation_chat_stream(req: SimulationChatRequest, request: Request):
    """시뮬레이션 챗 SSE 스트리밍 — 토큰 단위 실시간 전송"""
    import json as _json

    # 동일한 프롬프트 조립 (simulation_chat 과 동일 로직)
    ctx_block = ""
    if req.contexts:
        parts = []
        for c in req.contexts:
            name = c.get("intNm") or c.get("intNo") or "?"
            # 신호계획 요약만 (토큰 절약)
            phases = c.get("phases", [])
            phase_str = ", ".join(f"현시{p.get('no')}:{p.get('sec')}s({'/'.join(p.get('dirs',[]))})" for p in phases)
            parts.append(f"[신호계획 - {name} (intNo:{c.get('intNo')})] cycleVal={c.get('cycleVal')}s | {phase_str}")
        ctx_block = "\n\n" + "\n".join(parts)
    elif req.context:
        c = req.context
        phases = c.get("phases", [])
        phase_str = ", ".join(f"현시{p.get('no')}:{p.get('sec')}s({'/'.join(p.get('dirs',[]))})" for p in phases)
        ctx_block = f"\n\n[신호계획 - {c.get('intNm') or c.get('intNo')} (intNo:{c.get('intNo')})] cycleVal={c.get('cycleVal')}s | {phase_str}"

    sim_block = ""
    if req.simulation:
        sim_block = (
            f"\n\n[관제사 조정값]\n"
            f"{_json.dumps(req.simulation, ensure_ascii=False, indent=2)}\n"
            f"원래 신호계획과 비교해서 어떤 현시가 얼마나 바뀌었는지 분석해줘."
        )

    traffic_block = ""
    if req.routeTraffic:
        lines = []
        for seg in req.routeTraffic:
            spd = seg.get("speedKph")
            mark = " ★병목" if spd is not None and spd < 15 else ""
            lines.append(f"  {seg.get('fromIntNo')}→{seg.get('toIntNo')} | {spd}km/h{mark}")
        traffic_block = "\n\n[경로 속도 — 15km/h↓ 병목]\n" + "\n".join(lines)

    json_instruction = (
        "\n\n신호 조정이 필요하면 답변 맨 앞에 먼저 출력:\n"
        "```json\n{\"adjustments\":[{\"intNo\":\"번호\",\"phases\":[{\"no\":현시번호,\"sec\":초}]}]}\n```\n"
        "그 다음 1~2문장 설명. phases는 위 신호계획의 기존 현시만 사용."
    )

    prompt = (
        f"서울 신호 시뮬레이션이야. 한국어로 답해줘."
        f"{ctx_block}{sim_block}{traffic_block}{json_instruction}\n\n질문: {req.question}"
    )

    async def generate():
        full_text = ""
        in_think = False
        try:
            async for chunk in sim_llm.astream(prompt):
                if await request.is_disconnected():
                    return
                token = chunk.content if hasattr(chunk, "content") else str(chunk)
                if not token:
                    continue
                full_text += token

                # <think> 블록은 스트리밍 안 함
                if "<think>" in full_text and "</think>" not in full_text:
                    in_think = True
                    continue
                if in_think and "</think>" in full_text:
                    in_think = False
                    continue
                if in_think:
                    continue

                yield f"data: {_json.dumps({'type': 'token', 'content': token}, ensure_ascii=False)}\n\n"

            # 완성 후 파싱
            if "<think>" in full_text:
                full_text = full_text.split("</think>")[-1].strip() or full_text
            adjustments = extract_adjustments(full_text)
            clean = strip_json_block(full_text).strip() if adjustments else full_text.strip()
            if not clean and adjustments:
                names = ", ".join(a.get("intNo", "") for a in adjustments)
                clean = f"Webster 공식 기반으로 교차로 {names}의 신호를 최적화했습니다."
            elif not clean:
                clean = "신호계획을 분석했습니다. 현재 구간의 속도 데이터를 확인하세요."
            yield f"data: {_json.dumps({'type': 'done', 'answer': clean, 'adjustments': adjustments}, ensure_ascii=False)}\n\n"

        except Exception as e:
            yield f"data: {_json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/agent/bottleneck-email", response_model=ChatResponse)
async def bottleneck_email(req: DistrictRequest):
    """병목 리포트 텍스트만 생성 — 메일 발송은 Spring이 담당"""
    prompt = (
        f"/no_think\n"
        f"get_district_traffic 도구로 서울 {req.district} 교통 데이터를 조회해줘.\n"
        f"조회 결과를 바탕으로 아래 형식을 그대로 지켜서 리포트 본문만 출력해줘. 다른 말은 절대 하지 말고 양식 그대로만 출력.\n\n"
        f"교통관제 자동화 시스템입니다.\n"
        f"{req.district} 내 15km/h 이하 구간이 감지되어 경보를 발송합니다.\n"
        f"관제사께서는 아래 내용을 확인하시고 필요한 조치를 취해주시기 바랍니다.\n\n"
        f"[병목 구간 현황]\n"
        f"기준: 15km/h 이하 구간\n"
        f"수집 교차로: {{total_crossroads}}개\n\n"
        f"순위 | 교차로명                | 현재속도    | 위험등급\n"
        f"-----|------------------------|------------|-------\n"
        f"(병목 교차로를 위 표 형식으로 순위별로 작성. 없으면 '해당 없음' 한 줄)\n\n"
        f"[날씨 현황]\n"
        f"기온 {{temperatureC}}°C / 강수량 {{precipitationMm}}mm / 풍속 {{windSpeedMs}}m/s\n\n"
        f"[시스템 분석 및 조치 권고]\n"
        f"(혼잡 원인 추정 + 신호 조정 또는 우회 권고 2~3문장)\n\n"
        f"---\n"
        f"TrafficSync 자동 발송 | 조치 후 관제 시스템에서 확인 바랍니다.\n\n"
        f"병목 교차로가 없으면 아래 양식만 출력:\n"
        f"교통관제 자동화 시스템입니다.\n"
        f"현재 {req.district} 내 15km/h 이하 구간이 감지되지 않았습니다.\n"
        f"수집 교차로: {{total_crossroads}}개 / 현재 교통 상황 양호\n\n"
        f"---\n"
        f"TrafficSync 자동 발송"
    )
    result = await agent.ainvoke({"messages": [{"role": "user", "content": prompt}]})
    return ChatResponse(answer=extract_answer(result))


@app.post("/api/agent/bottleneck-email/stream")
async def bottleneck_email_stream(req: DistrictRequest, request: Request):
    """병목 이메일 SSE 스트리밍 — 리포트 생성 후 Spring으로 메일 발송"""
    import json as _json
    import httpx as _httpx

    prompt = (
        f"/no_think\n"
        f"get_district_traffic 도구로 서울 {req.district} 교통 데이터를 조회해줘.\n"
        f"조회 결과를 바탕으로 아래 형식을 그대로 지켜서 리포트 본문만 출력해줘. 다른 말은 절대 하지 말고 양식 그대로만 출력.\n\n"
        f"교통관제 자동화 시스템입니다.\n"
        f"{req.district} 내 15km/h 이하 구간이 감지되어 경보를 발송합니다.\n"
        f"관제사께서는 아래 내용을 확인하시고 필요한 조치를 취해주시기 바랍니다.\n\n"
        f"[병목 구간 현황]\n기준: 15km/h 이하 구간\n수집 교차로: {{total_crossroads}}개\n\n"
        f"순위 | 교차로명 | 현재속도 | 위험등급\n"
        f"(병목 교차로를 순위별로 작성. 없으면 '해당 없음' 한 줄)\n\n"
        f"[날씨 현황]\n기온 {{temperatureC}}°C / 강수량 {{precipitationMm}}mm / 풍속 {{windSpeedMs}}m/s\n\n"
        f"[시스템 분석 및 조치 권고]\n(혼잡 원인 추정 + 신호 조정 또는 우회 권고 2~3문장)\n\n"
        f"---\nTrafficSync 자동 발송"
    )

    async def generate():
        report_text = ""
        try:
            async for msg_kind, event in agent_stream_with_cancel(request, prompt):
                if msg_kind == "error":
                    yield f"data: {_json.dumps({'type': 'error', 'content': str(event)}, ensure_ascii=False)}\n\n"
                    return
                kind = event["event"]
                name = event.get("name", "")

                if kind == "on_tool_start":
                    args = event["data"].get("input", {})
                    args_str = ", ".join(f"{k}={v}" for k, v in args.items()) if args else ""
                    data = {"type": "action", "tool": name, "label": TOOL_LABELS.get(name, name), "args": args_str}
                    yield f"data: {_json.dumps(data, ensure_ascii=False)}\n\n"

                elif kind == "on_tool_end":
                    output = event["data"].get("output")
                    obs = ""
                    if output is not None:
                        raw = str(output.content) if hasattr(output, "content") else str(output)
                        try:
                            parsed = _json.loads(raw)
                            if isinstance(parsed, dict):
                                keys = list(parsed.keys())[:4]
                                obs = "{ " + ", ".join(keys) + (" ..." if len(parsed) > 4 else "") + " }"
                            elif isinstance(parsed, list):
                                obs = f"[{len(parsed)}개 항목 반환]"
                            else:
                                obs = raw[:150]
                        except Exception:
                            obs = raw[:150]
                    yield f"data: {_json.dumps({'type': 'observation', 'content': obs}, ensure_ascii=False)}\n\n"

                elif kind == "on_chat_model_end":
                    output = event["data"].get("output")
                    if not output:
                        continue
                    has_tool_calls = bool(getattr(output, "tool_calls", None))
                    content = output.content if hasattr(output, "content") else ""
                    if isinstance(content, list):
                        content = " ".join(
                            item.get("text", "") if isinstance(item, dict) else str(item)
                            for item in content
                        ).strip()

                    if content and "<think>" in content:
                        inside = content.split("<think>", 1)[-1].split("</think>")[0].strip()
                        if inside:
                            yield f"data: {_json.dumps({'type': 'thought', 'content': inside[:200]}, ensure_ascii=False)}\n\n"

                    if not has_tool_calls and content:
                        if "<think>" in content:
                            after = content.split("</think>")[-1].strip()
                            content = after if after else content
                        if content:
                            report_text = content
                            yield f"data: {_json.dumps({'type': 'answer', 'content': content}, ensure_ascii=False)}\n\n"

            # 리포트 완성 → Spring EmailService로 메일 발송
            if report_text and req.userEmail:
                try:
                    async with _httpx.AsyncClient(timeout=10.0) as client:
                        await client.post(
                            "http://localhost:8080/api/email/send",
                            json={"to": req.userEmail, "subject": f"[병목 경보] 서울 {req.district}", "body": report_text},
                        )
                    yield f"data: {_json.dumps({'type': 'observation', 'content': f'메일 발송 완료 → {req.userEmail}'}, ensure_ascii=False)}\n\n"
                except Exception as e:
                    yield f"data: {_json.dumps({'type': 'observation', 'content': f'메일 발송 실패: {e}'}, ensure_ascii=False)}\n\n"

        except Exception as e:
            yield f"data: {_json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

        yield 'data: {"type":"done"}\n\n'

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/agent/district-report/stream")
async def district_report_stream(req: DistrictRequest, request: Request):
    """구 단위 리포트 SSE 스트리밍 — 메인 대시보드 토스트 시각화용"""
    import json as _json

    prompt = (
        f"/no_think\n"
        f"get_district_traffic 도구로 서울 {req.district} 교통 데이터를 조회한 뒤, "
        f"반드시 한국어로 아래 형식으로 간결하게 리포트 작성해줘:\n"
        f"## {req.district} 교통 현황\n"
        f"**수집 교차로**: N개\n"
        f"**평균 속도**: X km/h\n"
        f"**15km/h 이하 병목**: 교차로명 (속도 km/h, 위험등급) 목록\n"
        f"**신호 조정 권고**: 혼잡 원인과 권고 2~3문장"
    )

    async def generate():
        try:
            async for msg_kind, event in agent_stream_with_cancel(request, prompt):
                if msg_kind == "error":
                    yield f"data: {_json.dumps({'type': 'error', 'content': str(event)}, ensure_ascii=False)}\n\n"
                    return
                kind = event["event"]
                name = event.get("name", "")

                if kind == "on_tool_start":
                    args = event["data"].get("input", {})
                    args_str = ", ".join(f"{k}={v}" for k, v in args.items()) if args else ""
                    data = {
                        "type": "action",
                        "tool": name,
                        "label": TOOL_LABELS.get(name, name),
                        "args": args_str,
                    }
                    yield f"data: {_json.dumps(data, ensure_ascii=False)}\n\n"

                elif kind == "on_tool_end":
                    output = event["data"].get("output")
                    obs = ""
                    if output is not None:
                        raw = str(output.content) if hasattr(output, "content") else str(output)
                        try:
                            parsed = _json.loads(raw)
                            if isinstance(parsed, dict):
                                keys = list(parsed.keys())[:4]
                                obs = "{ " + ", ".join(keys) + (" ..." if len(parsed) > 4 else "") + " }"
                            elif isinstance(parsed, list):
                                obs = f"[{len(parsed)}개 항목 반환]"
                            else:
                                obs = raw[:150]
                        except Exception:
                            obs = raw[:150]
                    yield f"data: {_json.dumps({'type': 'observation', 'content': obs}, ensure_ascii=False)}\n\n"

                elif kind == "on_chat_model_end":
                    output = event["data"].get("output")
                    if not output:
                        continue
                    has_tool_calls = bool(getattr(output, "tool_calls", None))
                    content = output.content if hasattr(output, "content") else ""
                    if isinstance(content, list):
                        content = " ".join(
                            item.get("text", "") if isinstance(item, dict) else str(item)
                            for item in content
                        ).strip()

                    if content and "<think>" in content:
                        inside = content.split("<think>", 1)[-1].split("</think>")[0].strip()
                        if inside:
                            yield f"data: {_json.dumps({'type': 'thought', 'content': inside[:200]}, ensure_ascii=False)}\n\n"

                    if not has_tool_calls and content:
                        if "<think>" in content:
                            after = content.split("</think>")[-1].strip()
                            content = after if after else content
                        if content:
                            yield f"data: {_json.dumps({'type': 'answer', 'content': content}, ensure_ascii=False)}\n\n"

        except Exception as e:
            yield f"data: {_json.dumps({'type': 'error', 'content': str(e)}, ensure_ascii=False)}\n\n"

        yield 'data: {"type":"done"}\n\n'

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.post("/api/agent/district-report", response_model=ReportResponse)
async def district_report(req: DistrictRequest):
    """메인 대시보드 구 단위 리포트"""

    prompt = (
        f"/no_think\n"
        f"get_district_traffic 도구로 서울 {req.district} 교통 데이터를 조회한 뒤, "
        f"반드시 한국어로 아래 형식으로 간결하게 리포트 작성해줘:\n"
        f"## {req.district} 교통 현황\n"
        f"**수집 교차로**: N개\n"
        f"**평균 속도**: X km/h\n"
        f"**20km/h 이하 병목**: 교차로명 (속도 km/h, 위험등급) 목록\n"
        f"**신호 조정 권고**: 혼잡 원인과 권고 2~3문장"
    )

    result = await agent.ainvoke({"messages": [{"role": "user", "content": prompt}]})
    return ReportResponse(report=extract_answer(result), district=req.district)


# ── 실행 ────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8001)
