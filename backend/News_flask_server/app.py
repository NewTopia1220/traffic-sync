import os
import asyncio
import threading
from flask import Flask, jsonify, request
from flask_cors import CORS
from dotenv import load_dotenv
from news_common import ModelManager, DatabaseManager

load_dotenv()

app = Flask(__name__)
CORS(app)

# BERT 모델 시작 시 한 번만 로드
mm = ModelManager()

_fetch_lock = threading.Lock()
_fetch_running = False


def _run_pipeline(table: str, config: dict, verify_fn, groq_keys: list):
    global _fetch_running
    try:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        from news_common import run_pipeline_async
        loop.run_until_complete(run_pipeline_async(
            sector_config=config,
            verify_fn=verify_fn,
            db_table=table,
            max_per_sector=5,
            groq_api_keys=groq_keys,
        ))
    except Exception as e:
        import traceback
        print(f"[pipeline 오류] {e}")
        traceback.print_exc()
    finally:
        try:
            loop.close()
        except Exception:
            pass
        _fetch_running = False


# ── 교통 뉴스 수집 설정 ───────────────────────────────────────────
TRAFFIC_CONFIG = {
    "서울교통": {
        "search_query": "서울 교통 혼잡",
        "keywords": ["교통", "혼잡", "신호", "교차로", "잠실", "강남", "도로", "정체"]
    },
    "교통사고": {
        "search_query": "서울 교통사고 도로",
        "keywords": ["사고", "충돌", "도로통제", "우회", "부상", "사망"]
    },
    "대중교통": {
        "search_query": "서울 지하철 버스 지연",
        "keywords": ["지하철", "버스", "지연", "파업", "운행중단", "결행"]
    }
}

TRAFFIC_GROQ_SYSTEM_PROMPT = (
    "너는 서울 교통 뉴스 분석 전문가다.\n"
    "1. 반드시 유효한 JSON 형식으로만 응답한다.\n"
    "2. 'sentiment'는 [혼잡악화, 교통개선, 중립] 중 하나로만 선택한다.\n"
    "   - 혼잡악화: 사고, 통제, 정체 심화, 파업, 도로 차단 등\n"
    "   - 교통개선: 신호 최적화, 도로 개통, 혼잡 해소, 교통 대책 등\n"
    "   - 중립: 단순 사실 전달, 영향 미미 등\n"
    "3. 'summary'는 1문장으로 핵심만 요약한다.\n"
    "4. 키는 'summary'와 'sentiment'만 사용한다."
)


def verify_traffic_fn(proc, title, text, info):
    return proc.verify_sector(title, text, info["keywords"])


# ── 엔드포인트 ───────────────────────────────────────────────────

@app.route('/health', methods=['GET'])
def health():
    return jsonify({"status": "ok", "model_loaded": mm.bert_model is not None})


@app.route('/news/fetch', methods=['POST'])
def fetch_news():
    """뉴스 수집 + Oracle DB 저장 (백그라운드 실행)"""
    global _fetch_running
    with _fetch_lock:
        if _fetch_running:
            return jsonify({"status": "already_running"}), 409
        _fetch_running = True

    groq_keys = [
        os.getenv("GROQ_API_KEY_1"),
        os.getenv("GROQ_API_KEY_2"),
        os.getenv("GROQ_API_KEY_3"),
    ]

    # GroqAnalyzer 시스템 프롬프트 교통용으로 교체
    from news_common import GroqAnalyzer
    GroqAnalyzer._system_prompt_override = TRAFFIC_GROQ_SYSTEM_PROMPT

    t = threading.Thread(
        target=_run_pipeline,
        args=("traffic_news", TRAFFIC_CONFIG, verify_traffic_fn, groq_keys),
        daemon=True
    )
    t.start()
    return jsonify({"status": "started"})


@app.route('/news/latest', methods=['GET'])
def latest_news():
    """Oracle DB에서 최근 교통 뉴스 조회"""
    limit = request.args.get('limit', 20, type=int)
    category = request.args.get('category', None)

    db = DatabaseManager()
    try:
        conn = db.connect()
        cursor = conn.cursor()

        if category:
            cursor.execute("""
                SELECT link, category, title, summary, sentiment,
                       pub_date, clickbait_prob, article_type, type_prob
                FROM traffic_news
                WHERE category = :1
                ORDER BY pub_date DESC
                FETCH FIRST :2 ROWS ONLY
            """, [category, limit])
        else:
            cursor.execute("""
                SELECT link, category, title, summary, sentiment,
                       pub_date, clickbait_prob, article_type, type_prob
                FROM traffic_news
                ORDER BY pub_date DESC
                FETCH FIRST :1 ROWS ONLY
            """, [limit])

        rows = cursor.fetchall()
        cols = ["link", "category", "title", "summary",
                "sentiment", "pub_date", "clickbait_prob", "article_type", "type_prob"]
        result = [dict(zip(cols, row)) for row in rows]
        cursor.close()
        conn.close()
        return jsonify({"status": "ok", "count": len(result), "news": result})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == '__main__':
    app.run(debug=False, host='0.0.0.0', port=5001)
