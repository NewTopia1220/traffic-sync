"""
run_all.py — 서울 교통 뉴스 수집 실행
  - 교통사고 / 도로혼잡 / 대중교통 / 교통정책 / 스마트교통 → traffic_news
"""

import os
import asyncio
from dotenv import load_dotenv
from news_common import ArticleProcessor, run_pipeline_async

load_dotenv()


# ================================================================
# [서울 교통 뉴스 섹터 설정]
# ================================================================
TRAFFIC_CONFIG = {
    "교통사고": {
        "search_query": "서울 교통사고",
        "keywords": ["교통사고", "충돌", "추돌", "사망", "부상", "도로통제", "우회",
                     "차량전복", "보행자", "신호위반", "음주운전", "역주행"]
    },
    "도로혼잡": {
        "search_query": "서울 도로 정체 혼잡",
        "keywords": ["정체", "혼잡", "교통체증", "막힘", "지체", "서행", "교차로",
                     "강남", "잠실", "여의도", "올림픽대로", "강변북로", "내부순환"]
    },
    "대중교통": {
        "search_query": "서울 지하철 버스 운행",
        "keywords": ["지하철", "버스", "지연", "파업", "운행중단", "결행", "연착",
                     "서울교통공사", "노선", "개통", "폐선", "환승"]
    },
    "교통정책": {
        "search_query": "서울시 교통 정책 대책",
        "keywords": ["교통정책", "신호", "교통대책", "도로개선", "교통사업",
                     "서울시", "국토부", "도로공사", "공사구간", "차선", "제한속도"]
    },
    "스마트교통": {
        "search_query": "스마트 교통 자율주행 V2X",
        "keywords": ["스마트교통", "자율주행", "V2X", "신호최적화", "교통관제",
                     "ITS", "C-ITS", "AI교통", "교통데이터", "신호등", "교통시스템"]
    }
}


# ================================================================
# [필터 함수]
# ================================================================
def verify_traffic_fn(proc: ArticleProcessor, title: str, text: str, info: dict) -> bool:
    return proc.verify_sector(title, text, info["keywords"])


# ================================================================
# [실행]
# ================================================================
async def main():
    if not os.getenv("NAVER_CLIENT_ID") or not os.getenv("NAVER_CLIENT_SECRET"):
        print("네이버 API 키 없음.")
        return
    if not os.getenv("GROQ_API_KEY_1"):
        print("Groq API 키 없음.")
        return

    print("=" * 60)
    print("  서울 교통 뉴스 수집 시작")
    print("=" * 60)

    count = await run_pipeline_async(
        sector_config=TRAFFIC_CONFIG,
        verify_fn=verify_traffic_fn,
        db_table="traffic_news",
        max_per_sector=5,
        groq_api_keys=[
            os.getenv("GROQ_API_KEY_1"),
            os.getenv("GROQ_API_KEY_2"),
            os.getenv("GROQ_API_KEY_3"),
        ],
    )

    print("=" * 60)
    print(f"  최종 완료 — traffic_news: {count}건")
    print("=" * 60)


if __name__ == "__main__":
    asyncio.run(main())
