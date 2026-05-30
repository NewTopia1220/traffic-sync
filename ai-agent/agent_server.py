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
    async_client=_ollama_client,   # 우리가 만든 클라이언트 주입
    base_url=OLLAMA_URL,
    temperature=0.3,
    num_predict=4096,
    num_ctx=8192,       # 도구 결과 누적되는 컨텍스트 창 확장
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

class ChatRequest(BaseModel):
    question: str
    crsrdId: str | None = None       # 선택된 교차로 ID (없으면 에이전트가 검색)
    userEmail: str | None = None     # 요청한 유저 이메일 (메일 발송 시 사용)

class SimulationChatRequest(BaseModel):
    question: str
    context: dict | None = None       # Spring이 조립한 신호계획 컨텍스트
    simulation: list | None = None    # 관제사 조정값 [{ no, sec, dirs }]
    userEmail: str | None = None      # 요청한 유저 이메일 (메일 발송 시 사용)

class DistrictRequest(BaseModel):
    district: str
    userEmail: str | None = None  # 로그인한 유저 이메일 (없으면 발송 안 함)

class ChatResponse(BaseModel):
    answer: str

class ReportResponse(BaseModel):
    report: str
    district: str

# ── 헬퍼 ────────────────────────────────────────────────────────────────────────

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

    ctx_block = ""
    if req.context:
        ctx_block = f"\n\n[신호계획 컨텍스트]\n{json.dumps(req.context, ensure_ascii=False, indent=2)}"

    sim_block = ""
    if req.simulation:
        sim_block = (
            f"\n\n[관제사 조정값]\n"
            f"{json.dumps(req.simulation, ensure_ascii=False, indent=2)}\n"
            f"위 조정값은 관제사가 슬라이더로 변경한 현시별 초(sec)야. "
            f"원래 신호계획과 비교해서 어떤 현시가 얼마나 바뀌었는지도 분석해줘."
        )

    email_ctx = (
        f"\n[요청 유저 이메일: {req.userEmail}]"
        f"\n메일 발송 요청이 있으면 send_email_report 도구를 호출하고 to 필드에 위 이메일을 반드시 사용할 것."
    ) if req.userEmail else ""

    prompt = (
        f"/no_think\n"
        f"서울 신호 시뮬레이션 시스템이야. 반드시 한국어로 답해줘."
        f"{ctx_block}"
        f"{sim_block}\n\n"
        f"질문: {req.question}"
        f"{email_ctx}"
    )

    result = await agent.ainvoke({"messages": [{"role": "user", "content": prompt}]})
    return ChatResponse(answer=extract_answer(result))


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
