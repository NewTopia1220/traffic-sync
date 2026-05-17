from news_common import DatabaseManager

db = DatabaseManager()
try:
    conn = db.connect()
    cur = conn.cursor()
    cur.execute("SELECT COUNT(*) FROM traffic_news")
    print("COUNT:", cur.fetchone())
    cur.execute("INSERT INTO traffic_news (link,category,title,summary,sentiment,pub_date,clickbait_prob,article_type,type_prob) VALUES ('test123','테스트','테스트기사','요약','중립','2026-05-13','0','사실형','0')")
    conn.commit()
    print("INSERT OK")
    cur.execute("SELECT COUNT(*) FROM traffic_news")
    print("COUNT after:", cur.fetchone())
    cur.close()
    conn.close()
except Exception as e:
    print("ERROR:", e)
