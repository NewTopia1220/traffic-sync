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
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from langchain_ollama import ChatOllama
from langchain_mcp_adapters.client import MultiServerMCPClient
from langchain_core.messages import AIMessage
from langgraph.prebuilt import create_react_agent

# ── 설정 ────────────────────────────────────────────────────────────────────────

OLLAMA_URL  = "http://localhost:11434"
OLLAMA_MODEL = "qwen3:30b-a3b"
MCP_SERVER_PATH = os.path.join(os.path.dirname(__file__), "mcp_server.py")
PYTHON_BIN  = sys.executable  # ai-env 가상환경 python

# ── LLM & 에이전트 초기화 ────────────────────────────────────────────────────────

llm = ChatOllama(
    model=OLLAMA_MODEL,
    base_url=OLLAMA_URL,
    temperature=0.3,
    num_predict=4096,   # 복잡한 멀티툴 요청(5단계+) 대응
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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:8080"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── 요청/응답 모델 ───────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    question: str
    crsrdId: str | None = None   # 선택된 교차로 ID (없으면 에이전트가 검색)

class SimulationChatRequest(BaseModel):
    question: str
    context: dict | None = None       # Spring이 조립한 신호계획 컨텍스트
    simulation: list | None = None    # 관제사 조정값 [{ no, sec, dirs }]

class DistrictRequest(BaseModel):
    district: str                # 예: "강남구"

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


@app.post("/api/agent/chat", response_model=ChatResponse)
async def free_chat(req: ChatRequest):
    """지도 페이지 자유 챗봇 — 에이전트가 교차로 검색 후 분석"""

    if req.crsrdId:
        prompt = (
            f"/no_think\n"
            f"교차로 ID {req.crsrdId}의 실시간 교통 데이터를 조회하고, "
            f"다음 질문에 한국어로 간결하게 답해줘: {req.question}"
        )
    else:
        prompt = (
            f"/no_think\n"
            f"서울 교통 관제 시스템이야. 반드시 한국어로 간결하게 답해줘.\n"
            f"필요하면 MCP 도구로 데이터를 조회해서 답해줘.\n"
            f"질문: {req.question}"
        )

    result = await agent.ainvoke({"messages": [{"role": "user", "content": prompt}]})
    return ChatResponse(answer=extract_answer(result))


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

    prompt = (
        f"/no_think\n"
        f"서울 신호 시뮬레이션 시스템이야. 반드시 한국어로 간결하게 답해줘."
        f"{ctx_block}"
        f"{sim_block}\n\n"
        f"질문: {req.question}"
    )

    result = await agent.ainvoke({"messages": [{"role": "user", "content": prompt}]})
    return ChatResponse(answer=extract_answer(result))


@app.post("/api/agent/bottleneck-email", response_model=ChatResponse)
async def bottleneck_email(req: DistrictRequest):
    """15km/h 이하 병목 교차로만 필터링해서 DB 등록 이메일로 직접 전송"""
    import httpx, smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    GMAIL_SENDER  = "juya0947@gmail.com"
    GMAIL_APP_PWD = "hgma peeg rfbm sboq"

    # 1. LLM에게 리포트 텍스트만 생성 요청 (메일 전송은 직접 처리)
    prompt = (
        f"/no_think\n"
        f"get_district_traffic 도구로 서울 {req.district} 교통 데이터를 조회해줘.\n"
        f"조회 결과를 바탕으로 아래 형식의 한국어 리포트 텍스트만 작성해줘. 다른 말은 하지 말고 리포트 본문만 출력해줘:\n\n"
        f"[병목 경보] 서울 {req.district} 교통 현황\n"
        f"━━━━━━━━━━━━━━━━━━━━━━━━━━\n"
        f"■ 수집 교차로: N개\n\n"
        f"■ 15km/h 이하 병목 구간 (N개)\n"
        f"  순위·교차로명·속도·위험등급 표 형식으로 작성\n\n"
        f"■ 총평 및 조치 권고\n"
        f"  혼잡 원인 추정과 신호 조정 권고를 2~3문장으로 작성\n\n"
        f"병목 교차로가 없으면 '현재 {req.district} 내 15km/h 이하 구간 없음'으로만 작성해줘."
    )
    result  = await agent.ainvoke({"messages": [{"role": "user", "content": prompt}]})
    report  = extract_answer(result)
    subject = f"[병목 경보] 서울 {req.district}"

    # 2. DB에서 알림 수신 동의 이메일 목록 조회
    recipients = []
    try:
        async with httpx.AsyncClient(timeout=5) as client:
            resp = await client.get("http://localhost:8080/api/auth/alert-emails")
            if resp.status_code == 200:
                recipients = resp.json()
    except Exception:
        pass

    to_list = recipients if recipients else [GMAIL_SENDER]

    # 3. 직접 SMTP 발송 (LLM 의존 없음)
    sent, failed = 0, 0
    for to_addr in to_list:
        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"]    = GMAIL_SENDER
            msg["To"]      = to_addr
            msg.attach(MIMEText(report, "plain", "utf-8"))
            with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
                smtp.login(GMAIL_SENDER, GMAIL_APP_PWD)
                smtp.send_message(msg)
            sent += 1
        except Exception:
            failed += 1

    return ChatResponse(answer=f"{report}\n\n[발송 결과] {sent}명 성공, {failed}명 실패")


class SimpleMailRequest(BaseModel):
    to: str
    subject: str
    body: str

@app.post("/api/agent/send-simple-mail")
async def send_simple_mail(req: SimpleMailRequest):
    """임시 비밀번호 등 단순 메일 직접 발송 (LLM 없이)"""
    import smtplib
    from email.mime.multipart import MIMEMultipart
    from email.mime.text import MIMEText

    GMAIL_SENDER  = "juya0947@gmail.com"
    GMAIL_APP_PWD = "hgma peeg rfbm sboq"

    msg = MIMEMultipart("alternative")
    msg["Subject"] = req.subject
    msg["From"]    = GMAIL_SENDER
    msg["To"]      = req.to
    msg.attach(MIMEText(req.body, "plain", "utf-8"))

    try:
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as smtp:
            smtp.login(GMAIL_SENDER, GMAIL_APP_PWD)
            smtp.send_message(msg)
        return {"success": True}
    except Exception as e:
        return {"success": False, "error": str(e)}


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
