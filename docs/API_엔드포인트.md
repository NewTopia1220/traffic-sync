# API 엔드포인트

## Spring Boot REST API (포트 8080)

### 1. 신호/교차로 관련

#### `GET /api/signals`
**MapController**
- 캐시(`TrafficCacheService`)의 전체 교차로 신호 상태 반환
- WebSocket을 보완하는 디버깅용 엔드포인트
- 응답: `Collection<TrafficStatus>`

**응답 예시**
```json
[
  {
    "crsrdId": "3880",
    "crsrdNm": "여의도수정아파트",
    "lat": 37.5220555,
    "lon": 126.9307631,
    "signals": { "se": {...}, "sw": {...}, "ne": {...}, "nw": {...} },
    "totDt": "20260516160901",
    "serverTimeMs": 1778951140698
  }
]
```

#### `POST /api/fetch-area`
**MapController**
- 선택된 구역의 V2X 데이터를 즉시 수집
- 폴링 좌표 자체도 이 좌표로 변경됨

**파라미터** (Query)
- `lat: double` - 위도
- `lon: double` - 경도
- `radius: double` (기본 1.0) - 반경 km

**응답**
```json
{ "count": 90, "message": "ok" }
```

### 2. 신호 시뮬레이션

#### `GET /api/signal/crossroads`
**SignalController**
- 신호 시뮬레이션용 교차로 목록 조회 (`SignalCrossroadEntity`)

#### `GET /api/signal/crossroads/{intNo}`
**SignalController**
- 특정 교차로의 신호 페이즈/플랜 상세

### 3. AI 챗봇

#### `POST /api/chat`
**ChatController**
- Python 에이전트(8001)로 프록시

**요청 본문**
```json
{
  "question": "잠실역 어때?",
  "crsrdId": "1007"   // nullable
}
```

**응답**
```json
{ "answer": "잠실역사거리 현재 속도는..." }
```

#### `GET /api/context/{crsrdId}`
**ChatController**
- 특정 교차로의 `TrafficContext` 반환 (날씨, 속도, 위험도 등)
- AI 도구(`get_traffic_data`)에서 내부 호출

#### `POST /api/district/report`
**MapController**
- 구 단위 AI 리포트 (현재 프론트에서 제거됨, 백엔드는 유지)

**요청**
```json
{ "district": "송파구" }
```

**응답**
```json
{ "report": "## 송파구 교통 현황...", "district": "송파구" }
```

### 4. 예측

#### `GET /api/forecast/{crsrdId}`
**ForecastController**
- 특정 교차로의 24시간 상행/하행 교통량 예측

**응답**
```json
{
  "crsrdNm": "잠실역사거리",
  "up": [20, 15, 10, ..., 25],     // 24개
  "down": [22, 18, 12, ..., 28]
}
```

### 5. CCTV

#### `GET /api/cctv`
**CctvController**
- 전체 CCTV 목록 조회

#### `GET /api/cctv/area`
**CctvController**
- 좌표 기반 구역별 CCTV 조회 (Haversine 거리 사용)

**파라미터**
- `lat`, `lon`, `radius`

## WebSocket

#### `ws://localhost:8080/ws/traffic`
**TrafficWebSocketHandler**
- 30초 주기 폴링 결과를 모든 클라이언트에 broadcast
- 페이로드: `Map<crsrdId, TrafficStatus>` JSON
- 클라이언트는 자동 재연결 (`useWebSocket` 훅)

## Python AI 에이전트 API (포트 8001)

### `POST /api/agent/chat`
**agent_server.py**
- 자유 질문 처리 (LangGraph ReAct)

**요청**
```json
{
  "question": "강남구 막히는 곳은?",
  "crsrdId": null
}
```

**응답**
```json
{ "answer": "..." }
```

### `POST /api/agent/district-report`
**agent_server.py**
- 구 단위 리포트 생성

**요청**
```json
{ "district": "송파구" }
```

**응답**
```json
{ "report": "...", "district": "송파구" }
```

### `GET /health`
**agent_server.py**
- 서버 상태 + 모델/MCP 연결 확인

**응답**
```json
{ "status": "ok", "model": "qwen3:30b-a3b", "mcp": "connected" }
```

## 외부 공공 API (백엔드 내부에서만 호출)

| API | URL | 용도 |
|---|---|---|
| V2X 교차로 정보 | `apis.data.go.kr/B551982/rti/crsrd_map_info` | 교차로 메타 |
| V2X 신호 정보 | `apis.data.go.kr/B551982/rti/tl_drct_info` | 실시간 신호 |
| 신호 시뮬레이션 | `apis.data.go.kr/1320000/CrossRoadInfoService` | 신호 계획 |

API 키는 `application-secret.properties` (gitignore)에 보관.

## 관련 문서

- [[서비스_설명]] — 각 엔드포인트를 처리하는 Controller·Service 내부 로직
- [[데이터_흐름]] — 요청이 어떤 순서로 시스템을 통과하는지 전체 흐름도
- [[에이전트_구조]] — /api/agent/* 엔드포인트 구현 (agent_server.py)
- [[데이터베이스_구조]] — 엔드포인트가 의존하는 엔티티·레포지토리
