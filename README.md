<div align="center">

# 🚦 Syncro

### 서울 실시간 V2X 기반 AI 교통 관제 시스템

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
![Vercel](https://img.shields.io/badge/Frontend-Vercel-000000?logo=vercel&logoColor=white)
![GCP](https://img.shields.io/badge/Backend-GCP%20Seoul-4285F4?logo=googlecloud&logoColor=white)

</div>

---

## 🎬 시연 영상

<div align="center">

[![Syncro 시연 영상](https://img.youtube.com/vi/L0Nj8BDrokU/maxresdefault.jpg)](https://youtu.be/L0Nj8BDrokU)

**▶️ 영상 보기 :** https://youtu.be/L0Nj8BDrokU

<sub>클릭하면 유튜브에서 전체 시연 영상이 재생됩니다.</sub>

</div>

---

## 📑 목차

- [개발 배경](#-개발-배경)
- [팀 소개 & 역할 분담](#-팀-소개--역할-분담)
- [개발 기간](#-개발-기간)
- [핵심 특징](#-핵심-특징)
- [시스템 아키텍처](#-시스템-아키텍처)
- [서비스 구성 & 포트](#-서비스-구성--포트)
- [주요 기능](#-주요-기능)
- [기술 스택](#-기술-스택)
- [연동 API](#-연동-api-공공민간-19개)
- [AI 모델 & 알고리즘](#-ai-모델--알고리즘)
- [데이터 흐름](#-데이터-흐름)
- [배포 구조](#-배포-구조)
- [프로젝트 구조](#-프로젝트-구조)
- [시작하기](#-시작하기)
- [기대효과](#-기대효과)

---

## 🎯 개발 배경

> **"흩어진 교통 데이터를 통합해 AI 분석과 실시간 관제를 제공하기 위해 Syncro를 개발했습니다."**

현재 도시 교차로의 다수는 여전히 **고정형 또는 시간대 기반(TOD) 신호 운영**에 의존합니다.
실시간 교통 변화에 능동적으로 대응하기 어렵고, 공공·민간에 흩어진 교통 데이터를 한 화면에서 보기 어렵습니다.

Syncro는 **실시간 신호 정보와 교통 흐름 데이터를 통합**하여, 교통 상황 변화에 능동적으로 대응할 수 있는
**데이터 기반 교통 관제 방식**을 제안합니다.

| 데이터 통합 | AI 분석 | 시뮬레이션 지원 |
|---|---|---|
| 흩어진 공공 데이터를 WebSocket으로 실시간 한 화면에 정리<br/>**19개 공공/민간 API 연동** | 로컬 LLM(Ollama)으로 외부 의존 없이 자연어 분석<br/>**qwen2.5:14b + exaone3.5:2.4b** | 관제사가 신호 최적화 결과를 직접 확인하고 결정<br/>**서울시 25개 구** 대상 |

---

## 👥 팀 소개 & 역할 분담

> **TEAM FINAL** — 산업공학 · AI · 풀스택을 결합한 4인 팀

| 팀원 | 역할 | 주요 담당 |
|:---:|:---:|---|
| **박하윤** 🧭<br/>(팀장) | **AI 에이전트** | • ReAct 에이전트 + MCP 도구<br/>• 멀티에이전트 신호 최적화<br/>• 실시간 데이터 수집 파이프라인<br/>• 실시간 캐싱 · WebSocket 브로드캐스트<br/>• 실시간 뉴스 파이프라인 구축 |
| **장수아** 🎨 | **프론트엔드 · 데이터 시각화** | • 프론트엔드 화면 구현 및 데이터 시각화<br/>• 지도 기반 교차로 선택 및 상세 정보 구현<br/>• VWorld 3D 지도 연동 및 주행 뷰 시각화<br/>• 신호 운영계획 모델링 / DB 구축<br/>• PPT 제작 및 발표자료 구성 |
| **설석현** ⚙️ | **백엔드 · 교통 데이터 · API** | • 데이터 가공·통합 (TrafficStatus)<br/>• 외부 공공 API 연동 (TOPIS·구간속도·기상청)<br/>• 도로교차 위험도 / 서울시 교통량·방향별<br/>• 예방 알고리즘 · 단위 테스트 작성<br/>• 시연 영상 제작 |
| **진민경** 📊 | **교통량 예측 · 데이터 분석** | • 교통량 예측 모델 개발 및 성능 평가<br/>• 예측 결과 프론트엔드 연동 및 시각화<br/>• 신호 시뮬레이션에 예측 데이터 연동 및 경로 분석<br/>• PPT 제작 및 발표자료 구성 |

---

## 📅 개발 기간

**2025.05.04 ~ 2025.06** · 약 6주 (메타빌드 최종 프로젝트)

```
05.04~          05.11~           05.18~          05.25~           06.12~
  계획            요구 분석          설계            구현          시험 & 피드백
─────────       ──────────       ─────────       ─────────       ────────────
목표 정의        현행 방식 조사     시스템 구조 설계   기능 구현        시험 및 테스트
기술 스택 선정    요구사항 분석      UI/UX 설계      서버·DB 구축      매뉴얼 작성
계획서 작성       기능 정의         설계서 작성       기능 통합        최종 발표자료 작성
계획서 검토 회의   구현 가능성 검토   발표자료 초안
```

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
| **교통량 예측 서버 (Flask)** | `5002` | XGBoost 교통량 예측 모델 서빙 |
| **민원 분류 서버 (Flask)** | `8002` | Gemini Vision 기반 민원 이미지 분류 |
| **뉴스 서버 (Flask)** | `5001` | 교통 뉴스 수집·분류·요약 |
| **AnythingLLM** | `3001` | 프로젝트 문서 RAG |
| **Ollama 메인** | `11434` | `qwen2.5:14b` — 메인 추론 |
| **Ollama 워커 ×4** | `11435~11438` | `exaone3.5:2.4b` — 경량 병렬 추론 |
| **Oracle Autonomous DB** | Cloud | 영속 저장소 (Wallet 인증) |

> 전체 서비스는 [`start-all.sh`](start-all.sh)로 일괄 기동됩니다.

---

## 🚀 주요 기능

### 📊 통합 대시보드
실시간 교차로 통합 모니터링 — 위험 교차로 우선 탐지, 구(區) 단위 교통 현황, 시간대별 교통량 예측, 메일 서비스, 음성 챗봇, 민원 알림.

### 🗺️ 실시간 지도
선택한 지역의 **교차로·신호 상태·위험도·민원·CCTV 정보를 통합 확인**. 병목·위험 교차로 목록, CCTV·로드뷰 연계, 시간대별 교통량 예측, 멀티에이전트 분석.

### 🚦 신호 시뮬레이션
병목 구간의 신호체계를 분석해 **신호 조정 전후의 교통 흐름 변화를 비교**.
VWorld 3D 경로 시뮬레이션 · 실시간 병목 탐지 · AI 신호 조정 시뮬레이션 · 신호 조정 이메일 발송 · 3D 주행뷰.

### 🤖 AI 교통 에이전트 (MCP 도구)
| 도구 그룹 | 설명 |
|---|---|
| **교차로 데이터 조회** | 교차로 단건 조회, 신호·속도·날씨·위험도 통합 정보, 이름 검색 |
| **병목 및 구역 분석** | 속도 기반 병목 TOP10, 구별 혼잡 분석 |
| **이메일 및 신호계획** | 이메일 발송, 신호계획 조회, 현시/사이클 데이터 반환 |
| **문서 검색** | AnythingLLM 호출, 프로젝트 문서·매뉴얼 RAG 검색 |

- **지도 챗봇**: 자유 질의 기반 교통 분석 (`POST /api/agent/chat`)
- **구 단위 리포트**: 메인 대시보드 자동 브리핑 (`POST /api/agent/district-report`)

### 📷 CCTV
UTIC CCTV 실시간 영상 스트림 연동.

### 📰 교통 뉴스
NAVER 뉴스 API로 교통 키워드 크롤링 → **BERT 기사 유형 분류 · 과장성 점수 · Groq LLM 요약/분석**.

### 📋 민원접수 시스템
**AI 민원 자동 분류** — 민원 접수 → AI 이미지 분류(Gemini Vision) → 부서 자동 배정 → AI 답변 이메일.

### 🔐 사용자 권한 관리
관리자 · 사용자 · 민원인 3단계 권한 분리.

---

## 🛠 기술 스택

**Frontend** · React 19 · Vite 8 · React Router 7 · Bootstrap 5 · Axios · hls.js · VWorld(Cesium) · Kakao Map SDK

**Backend** · Spring Boot 3.5 · Spring WebFlux · WebSocket · JPA · Thymeleaf · proj4j(좌표변환) · POI · Jsoup · Actuator/Prometheus

**AI / Agent** · Python · FastAPI · LangGraph(ReAct) · LangChain · MCP(Model Context Protocol) · Ollama(`qwen2.5:14b`, `exaone3.5:2.4b`) · AnythingLLM(RAG)

**ML / Modeling** · Flask · XGBoost(교통량 예측) · BERT(`kykim/bert-kor-base`) · Logistic Regression · KoNLPy(Okt) · BeautifulSoup · Groq LLM · Gemini Vision

**Data / Infra** · Oracle Autonomous DB(Wallet) · Vercel · GCP Compute Engine(서울 리전) · Caddy · ngrok

**Dev Tools** · IntelliJ · VS Code · Git · Maven · Apache Tomcat

---

## 🔗 연동 API (공공/민간 19개)

| 기관 | 제공 API |
|---|---|
| **국가교통정보 (7)** | V2X 교차로 기본정보·실시간 신호·정보 조회, 신호 현시 구성·운영계획 조회, 기상청 초단기실황, 도로위험도 |
| **서울시 오픈 API (4)** | TrafficInfo 실시간 도로 속도, LinkVerInfo 링크 버텍스, RoadDivInfo 도로 구분, RoadInfo 도로축 정보 |
| **민간/상용 (8)** | Kakao Map SDK, VWorld 3D WebGL, UTIC CCTV, Naver News Search API, Groq API, Gemini Vision API, Google Cloud TTS, Gmail SMTP |

---

## 🧠 AI 모델 & 알고리즘

### 신호 최적화 — Webster 공식
영국 도로연구소 F.V. Webster(1958)가 제안한, 교차로 평균 차량 지체를 최소화하는 신호 주기 산정 공식.

```
        1.5 L + 5
Co  =  ───────────          ( Co: 최적 신호 주기 / L: 주기당 총 손실시간 / ΣY: 현시 Y 합 )
        1 − ΣY
```

속도 구간으로 혼잡등급(ΣY)을 추정: `u<15 심각(0.85)` · `15≤u<25 정체(0.75)` · `25≤u<30 서행(0.65)` · `u≥30 원활(0.50)`.

### 교통 뉴스 분석 파이프라인
```
Naver 검색 API → 수집기 → 전처리(BeautifulSoup · KoNLPy/Okt)
        ├── Logistic Regression (clickbait_model.joblib) → 제목 과장도
        ├── BERT (news_model.pt · kykim/bert-kor-base)    → 기사 신뢰도 (사실형/주관형/예측형)
        └── Groq LLM (llama-3.1-8b)                        → 뉴스 한 문장 요약 · 교통 개선
```

### 멀티에이전트 신호 분석 (메인 챗봇)
- **일반 챗봇**: LangGraph ReAct(Observe→Think→Act) → MCP 도구 호출 → Ollama 응답 (SSE 스트림)
- **다중 교차로 분석**: 교차로 선택 → Worker(×4) 병렬 분석 → 신호 최적화 논의(속도별 페널티 적용) → 최적 신호 체계 수립

### 교통량 예측
XGBoost 기반 시간대별 교통량 예측 모델 → 대시보드·지도·시뮬레이션에 연동.

---

## 🔄 데이터 흐름

```
V2X / TOPIS API
   │  (TrafficScheduler · 30초 주기)
   ▼
V2xApiService / TopisApiService
   │
   ▼
TrafficCacheService  ──(인메모리 캐시 갱신 · 락 기반 동시성 제어)──┐
   │                                                            │
   ▼                                                            ▼
TrafficWebSocketHandler.broadcast()                Spring REST /api/signals
   │  (WebSocket push)                                          │  (pull)
   ▼                                                            ▼
useWebSocket 훅 → React state                          AI 에이전트 MCP 도구
   │
   ▼
대시보드 · 지도 렌더
```

**수집 주기** — 신호 30초 · 교통속도 1분 · 위험도 5분 · 날씨 10분 · 도로정보 24시간
(`TrafficScheduler` + `SupplementalDataScheduler` 병렬 운영)

- **읽기 전용 데이터**: 날씨, 차량 평균속도 (수집값)
- **조정 가능 변수**: 신호 주기/현시 시간 (관제사만 변경, 시뮬레이션으로 사전 검증)

---

## ☁️ 배포 구조

> **프론트는 Vercel, 백엔드는 GCP 서울 리전, AI 모델은 로컬에서 ngrok으로 연결 → 역할에 맞게 나눠 하나의 서비스로 통합**

```
                          사용자 브라우저
                                │ HTTPS
                    ┌───────────┴───────────┐
                    │  Vercel (프론트엔드)   │  React + Vite + CDN
                    └───────────┬───────────┘
            HTTPS REST/WSS ┌─────┴─────┐ HTTPS (AI 패밀리)
                           ▼           ▼
        ┌──── GCP Compute Engine (서울) ────┐   ┌──── 로컬 (ngrok 터널 :443) ────┐
        │  Caddy (SSL :80/:443)            │   │  FastAPI AI Agent :8001        │
        │  Spring Boot :8080 (WebSocket)   │   │   (LangGraph 멀티에이전트)      │
        │  Oracle Autonomous DB            │   │  Ollama 워커 ×4 (exaone3.5:2.4b)│
        │  Flask 민원 :8002 (Gemini)       │   │  Ollama 메인 :11434 (qwen2.5:14b)│
        │  Flask 예측 :5002 (XGBoost)      │   └────────────────────────────────┘
        │  Flask 뉴스 :5001                │
        └──────────────────────────────────┘
```

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
│   ├── flask_server/         # 교통량 예측 서버 (5002, XGBoost)
│   ├── civil_flask_server/   # 민원 분류 서버 (8002, Gemini Vision)
│   └── News_flask_server/    # 뉴스 서버 (5001, BERT·Groq)
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

## 🌟 기대효과

| 교통 관제센터 | 현행 문제 해결 | 교통 인프라 개선 | 친환경적 요소 |
|---|---|---|---|
| **관제 의사결정 속도 향상**<br/>실시간 신호 현황·교통량·위험도를 한 화면에서 확인해 병목 구간을 빠르게 파악 | **정체 완화 및 통행시간 단축**<br/>AI 분석과 교통량 예측으로 정체 심화 전 선제 대응, 불필요한 신호 대기 단축 | **스마트 교통 인프라**<br/>향후 자율주행·V2X·스마트 모빌리티 기반 지능형 교통 관리 체계로 확장 가능 | **친환경 교통 관리 기여**<br/>차량 공회전과 반복 정체를 줄여 연료 소비와 탄소 배출량 감소에 기여 |

---

<div align="center">

**Syncro** · 서울 실시간 V2X 기반 AI 교통 관제 시스템<br/>
<sub>TEAM FINAL · 박하윤 · 장수아 · 설석현 · 진민경</sub><br/>
<sub>© 2025 · 완전 로컬 LLM · MCP 멀티에이전트 · Human-in-the-loop</sub>

</div>
