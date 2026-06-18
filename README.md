<div align="center">

# 🚦 Syncro

### 실시간 V2X 기반 AI 교통 관제 시스템

폐쇄망(망분리) 환경에서 동작하는 **완전 로컬 LLM 멀티에이전트** 교통 관제 플랫폼<br/>
V2X·TOPIS 공공 데이터를 실시간 수집하고, AI 에이전트가 교차로 혼잡을 분석해 **신호 조정안을 권고**합니다.<br/>
최종 적용은 관제사 승인을 거치는 **Human-in-the-loop** 구조입니다.

<br/>

![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)
![Spring Boot](https://img.shields.io/badge/Spring%20Boot-3.5-6DB33F?logo=springboot&logoColor=white)
![Java](https://img.shields.io/badge/Java-17-007396?logo=openjdk&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-0.1-009688?logo=fastapi&logoColor=white)
![LangGraph](https://img.shields.io/badge/LangGraph-ReAct-1C3C3C?logo=langchain&logoColor=white)
![Ollama](https://img.shields.io/badge/Ollama-qwen2.5%3A14b-000000?logo=ollama&logoColor=white)
![MCP](https://img.shields.io/badge/MCP-Model%20Context%20Protocol-FF6F00)
![Oracle](https://img.shields.io/badge/Oracle-Autonomous%20DB-F80000?logo=oracle&logoColor=white)

</div>

---

## 📑 목차

- [핵심 특징](#-핵심-특징)
- [시스템 아키텍처](#-시스템-아키텍처)
- [서비스 구성 & 포트](#-서비스-구성--포트)
- [주요 기능](#-주요-기능)
- [기술 스택](#-기술-스택)
- [데이터 흐름](#-데이터-흐름)
- [프로젝트 구조](#-프로젝트-구조)
- [시작하기](#-시작하기)

---

## ✨ 핵심 특징

| | |
|---|---|
| 🔒 **완전 로컬 AI** | 외부 LLM API 의존 0 — Ollama 기반 로컬 추론으로 **데이터 유출 0, 비용 0, 호출 제한 없음**. 공기업·관제망의 망분리(폐쇄망) 환경에 대응. |
| 🤖 **MCP 멀티에이전트** | 표준 **Model Context Protocol** + **LangGraph ReAct** 에이전트. 메인 모델(`qwen2.5:14b`)과 경량 워커(`exaone3.5:2.4b` ×4)로 속도/정확도 균형. |
| 🧑‍✈️ **Human-in-the-loop** | AI는 신호 조정안을 **"권고"만** 하고, 실제 신호 적용은 관제사가 검토·승인. 교통 인프라의 AI 자동제어 리스크 차단. |
| 📡 **실시간 관제** | `TrafficScheduler` 30초 주기 폴링 → 인메모리 캐시 → **WebSocket push**로 대시보드 실시간 갱신. |
| 🏙️ **도메인 융합** | 산업공학(교통/Webster 신호 이론) + AI + 풀스택을 결합한 실증형 교통 관제 도메인. |

---

## 🏗 시스템 아키텍처

4-tier 구조로 각 계층의 책임을 분리했습니다. Spring은 LLM을 직접 호출하지 않고 Python 에이전트로 프록시합니다.

```
                          ┌─────────────────────────────┐
                          │     React + Vite (5173)      │  ← 시각화 · 상호작용
                          │  대시보드 · 지도 · 시뮬레이션 │
                          └──────────────┬──────────────┘
                       WebSocket(push) / REST(pull) │ HTTP
                          ┌──────────────┴──────────────┐
                          │   Spring Boot 백엔드 (8080)  │  ← 수집 · 영속 · 실시간 전송
                          │  Scheduler · Cache · WS · API │
                          └───┬───────────────────┬──────┘
              ┌───────────────┘                   └─────────────┐
   V2X · TOPIS · 기상 · 뉴스 · 민원                AI 에이전트 프록시
   ┌──────────┴──────────┐              ┌──────────────┴──────────────┐
   │  Oracle Autonomous  │              │  Python FastAPI 에이전트(8001) │  ← LLM 추론 · 도구 오케스트레이션
   │        DB (Cloud)   │              │   LangGraph ReAct + MCP Tools  │
   └─────────────────────┘              └───┬──────────────────────┬───┘
                                     MCP 도구 호출            로컬 inference
                          ┌──────────────────┘          ┌─────────┴─────────┐
                          │ Spring REST(/api) │          │  Ollama (11434~8) │  ← qwen2.5:14b + exaone3.5:2.4b ×4
                          └───────────────────┘          │  AnythingLLM(3001)│  ← 문서 RAG
                                                         └───────────────────┘
```

---

## 🔌 서비스 구성 & 포트

| 서비스 | 포트 | 역할 |
|---|---|---|
| **React 프론트엔드** | `5173` | 관제 대시보드·지도·시뮬레이션 UI (Vite dev server) |
| **Spring Boot 백엔드** | `8080` | 공공데이터 폴링·캐시·WebSocket·REST API |
| **AI 에이전트 (FastAPI)** | `8001` | LangGraph ReAct 에이전트 · MCP 도구 오케스트레이션 |
| **교통량 예측 서버 (Flask)** | `5002` | 교통량 예측 모델 서빙 |
| **민원 분류 서버 (Flask)** | `8002` | 민원 텍스트 분류 |
| **뉴스 서버 (Flask)** | `5001` | 교통 뉴스 수집·제공 |
| **AnythingLLM** | `3001` | 프로젝트 문서 RAG |
| **Ollama 메인** | `11434` | `qwen2.5:14b` — 메인 추론 |
| **Ollama 워커 ×4** | `11435~11438` | `exaone3.5:2.4b` — 경량 병렬 추론 |
| **Oracle Autonomous DB** | Cloud | 영속 저장소 (Wallet 인증) |

> 전체 서비스는 [`start-all.sh`](start-all.sh)로 일괄 기동됩니다.

---

## 🚀 주요 기능

### 실시간 교통 관제
- V2X·TOPIS 데이터 30초 주기 수집, WebSocket으로 지도·대시보드 실시간 반영
- 교차로/링크별 혼잡도 색상 시각화, 병목 구간 자동 탐지

### AI 교통 에이전트 (MCP 도구)
| 도구 | 설명 |
|---|---|
| `get_traffic_data` | 실시간 교통 데이터 조회 |
| `get_bottleneck_list` | 병목 구간 목록 |
| `search_crossroad_by_name` | 교차로 이름 검색 |
| `get_district_traffic` | 구(區) 단위 교통 현황 |
| `set_signal_timing` | 신호 주기/현시 조정안 적용(권고) |
| `send_alert` / `send_email_report` | 경보·이메일 리포트 발송 |
| `get_simulation_context` | 시뮬레이션 컨텍스트 |
| `search_project_docs` | 프로젝트 문서 RAG 검색 |

- **지도 챗봇**: 자유 질의 기반 교통 분석 (`POST /api/agent/chat`)
- **구 단위 리포트**: 메인 대시보드 자동 브리핑 (`POST /api/agent/district-report`)

### 신호 시뮬레이션
- VWorld(Cesium) 3D 뷰어 기반 신호 주기 조정 시뮬레이션
- 관제사가 신호 변수를 바꿨을 때의 결과를 사전 예측 (Webster 이론 기반)

### 부가 모듈
- 📰 교통 뉴스 수집 · 📋 시민 민원 접수/분류 · 🌦️ 기상 연동 · 📷 CCTV 대시보드 · ✉️ 이메일 리포트

---

## 🛠 기술 스택

**Frontend** · React 19 · Vite 8 · React Router 7 · Bootstrap 5 · Axios · hls.js · VWorld(Cesium)

**Backend** · Spring Boot 3.5 · Spring WebFlux · WebSocket · JPA · Thymeleaf · proj4j(좌표변환) · POI · Jsoup · Actuator/Prometheus

**AI / Agent** · Python · FastAPI · LangGraph(ReAct) · LangChain · MCP(Model Context Protocol) · Ollama(`qwen2.5:14b`, `exaone3.5:2.4b`) · AnythingLLM(RAG)

**Data / Infra** · Oracle Autonomous DB(Wallet) · Flask 마이크로서비스 ×3 · 공공데이터(V2X·TOPIS·기상청·뉴스)

---

## 🔄 데이터 흐름

```
V2X / TOPIS API
   │  (TrafficScheduler · 30초 주기)
   ▼
V2xApiService / TopisApiService
   │
   ▼
TrafficCacheService  ──(인메모리 캐시 갱신)──┐
   │                                        │
   ▼                                        ▼
TrafficWebSocketHandler.broadcast()    Spring REST /api/signals
   │  (WebSocket push)                      │  (pull)
   ▼                                        ▼
useWebSocket 훅 → React state          AI 에이전트 MCP 도구
   │
   ▼
대시보드 · 지도 렌더
```

- **읽기 전용 데이터**: 날씨, 차량 평균속도 (수집값)
- **조정 가능 변수**: 신호 주기/현시 시간 (관제사만 변경, 시뮬레이션으로 사전 검증)

---

## 📂 프로젝트 구조

```
traffic-sync/
├── backend/                  # Spring Boot 백엔드 (8080)
│   ├── src/main/java/com/example/demo/
│   │   ├── controller/       # Cctv·Chat·Civil·Complaint·Forecast·Map·News·Signal·User ...
│   │   ├── service/          # V2x·Topis·TrafficCache·Signal·Forecast·Email·Weather ...
│   │   ├── entity/           # Crossroad·Signal·TopisLink·Cctv·Complaint·User ...
│   │   ├── scheduler/        # TrafficScheduler · SupplementalDataScheduler
│   │   └── websocket/        # TrafficWebSocketHandler
│   ├── flask_server/         # 교통량 예측 서버 (5002)
│   ├── civil_flask_server/   # 민원 분류 서버 (8002)
│   └── News_flask_server/    # 뉴스 서버 (5001)
├── ai-agent/                 # Python AI 에이전트 (8001)
│   ├── agent_server.py       # FastAPI + LangGraph ReAct
│   └── mcp_server.py         # MCP 도구 서버
├── frontend/                 # React + Vite (5173)
│   └── src/
│       ├── pages/            # Main·Map·Simulation·Cctv·News·Complaint·Login ...
│       ├── components/       # map · dashboard · charts · sidebar · simulation · assistant
│       └── hooks/            # useWebSocket 등
├── docs/                     # 프로젝트 문서
└── start-all.sh              # 전체 서비스 일괄 기동
```

---

## ⚡ 시작하기

### 사전 요구사항
- **Java 17+**, **Node.js 18+**, **Python 3.10+**
- **Ollama** 설치 및 모델 pull: `ollama pull qwen2.5:14b` / `ollama pull exaone3.5:2.4b`
- Oracle Autonomous DB Wallet, 공공데이터 API 키 (`application-secret.properties`, 프론트 `.env`의 `VITE_*`)

### 1. 전체 일괄 실행 (macOS / zsh)
```bash
./start-all.sh
```

### 2. 개별 실행
```bash
# Backend (Spring Boot)
cd backend && ./mvnw spring-boot:run

# AI 에이전트 (FastAPI)
cd ai-agent && uvicorn agent_server:app --host 0.0.0.0 --port 8001 --reload

# Frontend (React + Vite)
cd frontend && npm install && npm run dev
```

접속: **http://localhost:5173**

> 🔐 민감 정보(API 키·DB 자격증명·Oracle Wallet)는 `.gitignore`로 분리 관리되며 저장소에 포함되지 않습니다.

---

<div align="center">

**Syncro** · 실시간 V2X 기반 AI 교통 관제 시스템<br/>
<sub>© 2026 · 완전 로컬 LLM · MCP 멀티에이전트 · Human-in-the-loop</sub>

</div>
