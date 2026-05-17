# News Flask Server — 서울 교통 뉴스 수집 서버

서울 교통 뉴스를 수집·분석하여 Oracle Cloud DB에 저장하는 별도 Flask 서버입니다.  
메인 Spring Boot 서버(포트 8080)와 독립적으로 **포트 5001**에서 실행됩니다.

---

## 디렉토리 구조

```
News_flask_server/
├── app.py                  # Flask 서버 진입점 (포트 5001)
├── news_common.py          # 공통 클래스 (BERT, Groq, DB, 파이프라인)
├── run_all.py              # 서버 없이 직접 수집 실행 (테스트용)
├── test_db.py              # DB 연결 테스트
├── model.pt                # BERT 기사 유형 분류 모델
├── clickbait_model.joblib  # 과장성 분류 모델 (TF-IDF + 로지스틱 회귀)
├── tfidf_vectorizer.joblib # TF-IDF 벡터라이저
├── .env                    # API 키 설정 (Git 제외)
├── venv/                   # Python 가상환경
└── wallet/                 # Oracle Cloud 지갑 파일 (Git 제외)
```

---

## 최초 설정 (처음 clone한 팀원)

### 1. wallet 폴더 확인

`wallet/` 폴더 안에 아래 파일들이 있어야 합니다.  
없으면 팀장(희윤)에게 공유 받으세요. **절대 수정하지 마세요.**

```
wallet/
├── cwallet.sso
├── ewallet.p12
├── ewallet.pem
├── tnsnames.ora
├── sqlnet.ora
└── ojdbc.properties
```

### 2. .env 파일 생성

`News_flask_server/` 안에 `.env` 파일을 직접 만들어야 합니다.  
아래 내용을 복사하고 Groq API 키를 채워 넣으세요.

```env
GROQ_API_KEY_1=발급받은_키_입력
GROQ_API_KEY_2=
GROQ_API_KEY_3=
NAVER_CLIENT_ID=TCLuxVcNx6zjZJVMdYVo
NAVER_CLIENT_SECRET=034NoLFx5o
```

> **Groq API 키 발급**: https://console.groq.com → API Keys → Create API Key  
> 무료 티어 사용 가능 (카드 등록 불필요). 키 1개만 있어도 동작합니다.

---

## 가상환경 설치 (처음 1회만)

`venv/` 폴더가 없는 경우에만 실행합니다.

```powershell
# News_flask_server 폴더로 이동
cd backend/News_flask_server

# 가상환경 생성
python -m venv venv

# 패키지 설치
venv/Scripts/pip install flask flask-cors python-dotenv aiohttp beautifulsoup4 `
    oracledb openai scikit-learn joblib konlpy `
    torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu `
    transformers
```

> `venv/` 폴더가 이미 있으면 이 단계는 건너뜁니다.

---

## 서버 실행

### 1. 가상환경 활성화

**cmd:**
```cmd
cd backend\News_flask_server
venv\Scripts\activate
```

**PowerShell:**
```powershell
cd backend/News_flask_server
venv/Scripts/Activate.ps1
```

활성화되면 프롬프트 앞에 `(venv)` 가 붙습니다:
```
(venv) C:\gitFinal\traffic-sync\backend\News_flask_server>
```

### 2. 서버 시작

```cmd
python app.py
```

정상 실행 시 아래와 같이 출력됩니다:

```
장치: cpu
로지스틱 회귀 모델 로딩 중...
✅ 로지스틱 회귀 로딩 완료!
✅ BERT 로딩 완료!
 * Running on http://0.0.0.0:5001
```

> BERT 모델 로딩에 30초~1분 정도 소요될 수 있습니다.

### 3. 뉴스 수집 요청

서버가 실행 중인 상태에서 **새 터미널**을 열고 실행합니다.

**cmd:**
```cmd
curl -X POST http://127.0.0.1:5001/news/fetch
```

**PowerShell:**
```powershell
Invoke-WebRequest -Method POST -Uri http://127.0.0.1:5001/news/fetch -UseBasicParsing
```

정상 응답:
```json
{"status": "started"}
```

수집이 시작되면 서버 터미널에 아래와 같이 출력됩니다:
```
✅ DB 연결 성공! (테이블: traffic_news)
📡 교통사고 (100개 후보)
📡 도로혼잡 (100개 후보)
...
✅ [2026-05-13 14:00] 서울 강남구 교통사고...
   감성: 혼잡악화 | 유형: 사실형(87.3%) | 과장성: 12.1%
   요약: 강남구 교차로에서 차량 충돌 사고로 도로가 통제되고 있다.
```

---

## API 엔드포인트

| 메서드 | 경로 | 설명 |
|--------|------|------|
| GET | `/health` | 서버 상태 및 모델 로딩 여부 확인 |
| POST | `/news/fetch` | 뉴스 수집 시작 (백그라운드 실행) |
| GET | `/news/latest?limit=20&category=교통사고` | DB에서 최근 뉴스 조회 |

### 응답 JSON 구조

```json
{
  "status": "ok",
  "count": 20,
  "news": [
    {
      "link":           "https://n.news.naver.com/...",
      "category":       "교통사고",
      "title":          "강남 교차로 사고로 도로 통제",
      "summary":        "강남구 교차로에서 차량 충돌 사고로 도로가 통제되고 있다.",
      "sentiment":      "혼잡악화",
      "pub_date":       "2026-05-13 14:00",
      "clickbait_prob": "19.2",
      "article_type":   "사실형",
      "type_prob":      "96.1"
    }
  ]
}
```

### 필드 설명

| 필드 | 타입 | 설명 |
|------|------|------|
| `link` | string | 네이버 뉴스 원문 URL |
| `category` | string | `교통사고` / `도로혼잡` / `대중교통` / `교통정책` / `스마트교통` |
| `title` | string | 기사 제목 |
| `summary` | string | Groq AI 1문장 요약 |
| `sentiment` | string | `혼잡악화` / `교통개선` / `중립` |
| `pub_date` | string | 기사 발행일시 (`YYYY-MM-DD HH:mm`) |
| `clickbait_prob` | string | 과장성 점수 (0~100, 높을수록 자극적인 기사) |
| `article_type` | string | 기사 유형: `사실형` / `예측형` / `대화형` / `추론형` |
| `type_prob` | string | 기사 유형 분류 신뢰도 (0~100) |

> 프론트에서 주로 쓸 필드: `title`, `summary`, `sentiment`, `pub_date`, `category`, `link`  
> `clickbait_prob`, `article_type`, `type_prob` 은 필요 시 활용

### 사용 예시

```cmd
# 서버 상태 확인
curl http://localhost:5001/health

# 뉴스 수집 시작
curl -X POST http://localhost:5001/news/fetch

# 최근 뉴스 20개 조회
curl http://localhost:5001/news/latest

# 특정 카테고리만 조회
curl "http://localhost:5001/news/latest?limit=10&category=교통사고"
```

---

## 수집 카테고리

| 카테고리 | 검색어 |
|----------|--------|
| 교통사고 | 서울 교통사고 |
| 도로혼잡 | 서울 도로 정체 혼잡 |
| 대중교통 | 서울 지하철 버스 운행 |
| 교통정책 | 서울시 교통 정책 대책 |
| 스마트교통 | 스마트 교통 자율주행 V2X |

---

## DB 연결 테스트

서버 실행 전에 DB 연결이 되는지 먼저 확인하려면:

```powershell
cd backend/News_flask_server
venv/Scripts/python test_db.py
```

`COUNT: (숫자,)` 와 `INSERT OK` 가 출력되면 정상입니다.

---

## 주의사항

- `wallet/` 폴더와 `.env` 파일은 `.gitignore`에 추가되어 있어 Git에 올라가지 않습니다.
- wallet 파일은 **절대 수정하지 마세요.** DB 연결이 끊깁니다.
- Groq API는 무료 티어 기준 분당 6,000 토큰 제한이 있습니다. 키 3개를 등록하면 자동으로 분산됩니다.
- IDE(VSCode)에서 빨간 밑줄이 보여도 `venv` 인터프리터가 설정되지 않아서 생기는 표시 오류입니다. 실제 실행에는 영향 없습니다.
