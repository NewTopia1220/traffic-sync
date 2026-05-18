import { useState, useEffect, useCallback } from "react";

const NEWS_API = "http://localhost:5001";

const V = {
  bg0: "#000", bg1: "#0a0a0a", bg2: "#111", line: "#1a1a1a",
  ink0: "#e7ecf5", ink1: "#aab4c8", ink2: "#7a7a7a", ink3: "#3a3a3a",
  grn: "#2ee07a", red: "#ff5566", org: "#ffaa33", blu: "#4ea6ff",
  mono: "'IBM Plex Mono',ui-monospace,Menlo,monospace",
  sans: "'Pretendard','Noto Sans KR','Malgun Gothic',system-ui,sans-serif",
};

const SENTIMENT_META = {
  "혼잡악화": { color: V.red,  label: "혼잡악화" },
  "교통개선": { color: V.grn,  label: "교통개선" },
  "중립":     { color: V.ink2, label: "중립"     },
};

const CATEGORIES = [
  { key: "",       label: "전체" },
  { key: "서울교통", label: "서울교통" },
  { key: "교통사고", label: "교통사고" },
  { key: "대중교통", label: "대중교통" },
];

const DUMMY_NEWS = [
  { link: "#", category: "교통사고", title: "강남 교차로 사고로 도로 통제", summary: "강남구 교차로에서 차량 충돌 사고로 도로가 통제되고 있다.", sentiment: "혼잡악화", pub_date: "2026-05-16 09:00", clickbait_prob: "19.2", article_type: "사실형", type_prob: "96.1" },
  { link: "#", category: "서울교통", title: "잠실역 일대 교통 정체 심화", summary: "출퇴근 시간대 잠실역 주변 교통 체증이 심화되고 있다.", sentiment: "혼잡악화", pub_date: "2026-05-16 08:30", clickbait_prob: "22.5", article_type: "사실형", type_prob: "91.0" },
  { link: "#", category: "대중교통", title: "지하철 9호선 운행 정상화", summary: "지연 운행 중이던 9호선이 정상 운행으로 복귀했다.", sentiment: "교통개선", pub_date: "2026-05-16 08:00", clickbait_prob: "8.1", article_type: "사실형", type_prob: "94.3" },
  { link: "#", category: "서울교통", title: "올림픽대로 도로 공사 안내", summary: "올림픽대로 일부 구간이 야간 도로 보수 공사로 통제된다.", sentiment: "중립", pub_date: "2026-05-15 22:00", clickbait_prob: "5.3", article_type: "예측형", type_prob: "88.7" },
  { link: "#", category: "교통사고", title: "강변북로 추돌사고 발생", summary: "강변북로 상행선에서 차량 추돌사고가 발생해 일부 차선이 통제됐다.", sentiment: "혼잡악화", pub_date: "2026-05-15 18:45", clickbait_prob: "31.0", article_type: "사실형", type_prob: "97.2" },
  { link: "#", category: "대중교통", title: "버스 파업 철회, 정상 운행", summary: "예고됐던 시내버스 파업이 철회되어 정상 운행이 유지된다.", sentiment: "교통개선", pub_date: "2026-05-15 17:00", clickbait_prob: "11.4", article_type: "사실형", type_prob: "93.5" },
  { link: "#", category: "서울교통", title: "강남대로 신호 최적화 완료", summary: "강남대로 주요 교차로 신호 최적화가 완료되어 통행 속도가 개선됐다.", sentiment: "교통개선", pub_date: "2026-05-15 14:00", clickbait_prob: "6.8", article_type: "사실형", type_prob: "92.4" },
  { link: "#", category: "교통사고", title: "여의도 진입로 접촉사고", summary: "여의도 진입로에서 경미한 접촉사고가 발생했으나 빠르게 처리됐다.", sentiment: "중립", pub_date: "2026-05-15 11:20", clickbait_prob: "14.7", article_type: "사실형", type_prob: "89.0" },
];

// ── 도넛 차트 ──────────────────────────────────────────────────────────
function DonutChart({ data, total }) {
  const r = 70, sw = 16, circ = 2 * Math.PI * r;
  let offset = 0;
  const slices = data.filter(d => d.count > 0).map(d => {
    const pct = total > 0 ? d.count / total : 0;
    const dash = pct * circ;
    const slice = { ...d, pct, dash, offset };
    offset += dash;
    return slice;
  });

  return (
    <div style={{ position: "relative", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <svg width="180" height="180" viewBox="0 0 180 180">
        {/* 배경 트랙 */}
        <circle cx="90" cy="90" r={r} fill="none" stroke="#141414" strokeWidth={sw} />
        {/* 슬라이스 */}
        {slices.map((s, i) => (
          <circle key={i} cx="90" cy="90" r={r} fill="none"
            stroke={s.color} strokeWidth={sw}
            strokeDasharray={`${s.dash} ${circ - s.dash}`}
            strokeDashoffset={-s.offset}
            transform="rotate(-90 90 90)"
            strokeLinecap="butt"
          />
        ))}
      </svg>
      {/* 중앙 텍스트 */}
      <div style={{ position: "absolute", textAlign: "center", pointerEvents: "none" }}>
        <div style={{ fontFamily: V.mono, fontSize: 32, fontWeight: 700, color: "#fff", lineHeight: 1 }}>{total}</div>
        <div style={{ fontSize: 12, color: V.ink2, marginTop: 4 }}>전체 기사</div>
      </div>
    </div>
  );
}

// ── 감성 바 ────────────────────────────────────────────────────────────
function SentimentBar({ label, count, total, color }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, display: "inline-block" }} />
          <span style={{ fontSize: 14, color: V.ink1 }}>{label}</span>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontFamily: V.mono, fontSize: 13, color }}>
            {pct}%
          </span>
          <span style={{ fontFamily: V.mono, fontSize: 13, color: V.ink2 }}>
            {count}건
          </span>
        </div>
      </div>
      {/* 프로그레스 바 */}
      <div style={{ height: 6, background: "#141414", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 3, transition: "width 0.6s ease" }} />
      </div>
    </div>
  );
}

// ── 과장성 바 ──────────────────────────────────────────────────────────
function ClickbaitBar({ value }) {
  const pct = Math.min(parseFloat(value) || 0, 100);
  const color = pct >= 50 ? V.org : pct >= 30 ? "#fbbf24" : V.grn;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ flex: 1, height: 4, background: "#141414", borderRadius: 2, overflow: "hidden" }}>
        <div style={{ width: `${pct}%`, height: "100%", background: color, borderRadius: 2 }} />
      </div>
      <span style={{ fontFamily: V.mono, fontSize: 11, color, minWidth: 36, textAlign: "right" }}>{pct.toFixed(0)}%</span>
    </div>
  );
}

// ── 뉴스 카드 ──────────────────────────────────────────────────────────
function NewsCard({ item }) {
  const s = SENTIMENT_META[item.sentiment] ?? SENTIMENT_META["중립"];
  const typeProb = parseFloat(item.type_prob ?? 0);

  return (
    <div style={{
      background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 6,
      padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12,
      borderLeft: `3px solid ${s.color}`,
    }}
      onMouseEnter={e => e.currentTarget.style.background = "#0d0d0d"}
      onMouseLeave={e => e.currentTarget.style.background = V.bg1}
    >
      {/* 상단 배지 행 */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <span style={{ fontSize: 12, fontFamily: V.mono, color: V.blu, padding: "2px 9px", border: `1px solid ${V.blu}33`, borderRadius: 2, background: `${V.blu}11` }}>
          {item.category}
        </span>
        <span style={{ fontSize: 12, fontFamily: V.mono, color: s.color, padding: "2px 9px", border: `1px solid ${s.color}33`, borderRadius: 2, background: `${s.color}11`, display: "flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: s.color, display: "inline-block", boxShadow: `0 0 4px ${s.color}` }} />
          {s.label}
        </span>
        <span style={{ fontSize: 12, fontFamily: V.mono, color: V.ink2, padding: "2px 9px", border: `1px solid ${V.line}`, borderRadius: 2 }}>
          {item.article_type}
        </span>
        <span style={{ fontSize: 12, fontFamily: V.mono, color: V.ink2, marginLeft: "auto" }}>
          {item.pub_date}
        </span>
      </div>

      {/* 제목 — 클릭 시 원문 */}
      <a href={item.link} target="_blank" rel="noopener noreferrer"
        style={{ fontSize: 17, fontWeight: 700, color: V.ink0, textDecoration: "none", lineHeight: 1.5, cursor: "pointer" }}
        onMouseEnter={e => { e.currentTarget.style.color = V.blu; e.currentTarget.style.textDecoration = "underline"; }}
        onMouseLeave={e => { e.currentTarget.style.color = V.ink0; e.currentTarget.style.textDecoration = "none"; }}
      >
        {item.title}
      </a>

      {/* AI 요약 */}
      <div style={{ fontSize: 14, color: V.ink1, lineHeight: 1.8, borderLeft: `2px solid ${s.color}44`, paddingLeft: 14, paddingRight: 12, paddingTop: 10, paddingBottom: 10, background: `${s.color}06`, borderRadius: "0 4px 4px 0" }}>
        <span style={{ fontSize: 11, fontFamily: V.mono, color: s.color, display: "block", marginBottom: 4, fontWeight: 600 }}>AI 요약</span>
        {item.summary}
      </div>

      {/* 하단: 과장성 바 + 신뢰도 + 원문 링크 */}
      <div style={{ display: "flex", alignItems: "center", gap: 16, borderTop: `1px solid ${V.line}`, paddingTop: 10 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 11, color: V.ink3, fontFamily: V.mono, marginBottom: 4 }}>
            과장성 점수
          </div>
          <ClickbaitBar value={item.clickbait_prob} />
        </div>
        <div style={{ textAlign: "right", minWidth: 100 }}>
          <div style={{ fontSize: 11, color: V.ink3, fontFamily: V.mono, marginBottom: 3 }}>AI 신뢰도</div>
          <div style={{ fontFamily: V.mono, fontSize: 16, fontWeight: 700, color: V.ink0 }}>{typeProb.toFixed(1)}<span style={{ fontSize: 11, color: V.ink2 }}>%</span></div>
        </div>
        <a href={item.link} target="_blank" rel="noopener noreferrer"
          style={{ fontSize: 13, color: V.blu, textDecoration: "none", padding: "6px 14px", border: `1px solid ${V.blu}44`, borderRadius: 2, fontFamily: "inherit", whiteSpace: "nowrap" }}
          onMouseEnter={e => e.currentTarget.style.background = `${V.blu}11`}
          onMouseLeave={e => e.currentTarget.style.background = "transparent"}
        >
          원문 보기 →
        </a>
      </div>
    </div>
  );
}

// ── NewsDashboard ──────────────────────────────────────────────────────
export default function NewsDashboard({ onGoMain, onGoMap }) {
  const [time,       setTime]       = useState(new Date());
  const [news,       setNews]       = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [serverOk,   setServerOk]   = useState(null);
  const [category,   setCategory]   = useState("");
  const [fetching,   setFetching]   = useState(false);
  const [fetchMsg,   setFetchMsg]   = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetch(`${NEWS_API}/health`)
      .then(r => r.json())
      .then(() => setServerOk(true))
      .catch(() => setServerOk(false));
  }, []);

  const loadNews = useCallback(async (cat = "") => {
    setLoading(true);
    try {
      const url = cat
        ? `${NEWS_API}/news/latest?limit=50&category=${encodeURIComponent(cat)}`
        : `${NEWS_API}/news/latest?limit=50`;
      const res  = await fetch(url);
      const data = await res.json();
      setNews(data.news ?? []);
      setLastUpdate(new Date());
      setServerOk(true);
    } catch {
      setServerOk(false);
      const filtered = cat ? DUMMY_NEWS.filter(n => n.category === cat) : DUMMY_NEWS;
      setNews(filtered);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadNews(category); }, [category]);

  const handleFetch = async () => {
    if (fetching) return;
    setFetching(true); setFetchMsg(null);
    try {
      const res  = await fetch(`${NEWS_API}/news/fetch`, { method: "POST" });
      const data = await res.json();
      if (data.status === "started") {
        setFetchMsg("✓ 수집 시작됨 · 30초 후 새로고침");
        setTimeout(() => { loadNews(category); setFetchMsg(null); }, 30000);
      } else if (data.status === "already_running") {
        setFetchMsg("⚠ 이미 수집 중");
      }
    } catch { setFetchMsg("✕ 서버 연결 실패"); }
    finally { setFetching(false); }
  };

  // 통계 계산
  const total = news.length;
  const stats = [
    { key: "혼잡악화", color: V.red,  count: news.filter(n => n.sentiment === "혼잡악화").length },
    { key: "교통개선", color: V.grn,  count: news.filter(n => n.sentiment === "교통개선").length },
    { key: "중립",     color: V.ink2, count: news.filter(n => n.sentiment === "중립").length },
  ];
  const avgClickbait = total > 0
    ? (news.reduce((a, n) => a + parseFloat(n.clickbait_prob ?? 0), 0) / total).toFixed(1)
    : "—";

  return (
    <div style={{ fontFamily: V.sans, background: V.bg0, color: V.ink0, height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* ── 헤더 ── */}
      <div style={{ background: V.bg0, borderBottom: `1px solid ${V.line}`, padding: "0 22px", height: 58, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <button onClick={onGoMain} style={{ background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, padding: "6px 14px", color: V.ink1, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>← 대시보드</button>
        <button onClick={onGoMap}  style={{ background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, padding: "6px 14px", color: V.ink1, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>🗺️ 지도</button>
        <span style={{ fontSize: 20 }}>📰</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 18, color: V.grn }}>실시간 교통 뉴스</div>
          <div style={{ fontSize: 12, color: V.ink2 }}>BERT 기반 AI 감성 분석 · 자동 수집</div>
        </div>
        {/* 서버 상태 */}
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", borderRadius: 2, border: `1px solid ${serverOk ? "#1a3a24" : V.line}`, background: serverOk ? "#0c1a12" : V.bg1 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: serverOk === null ? V.ink2 : serverOk ? V.grn : V.ink3, display: "inline-block" }} />
          <span style={{ fontSize: 12, fontFamily: V.mono, color: serverOk === null ? V.ink2 : serverOk ? V.grn : V.ink3 }}>
            {serverOk === null ? "확인 중..." : serverOk ? "Flask :5001 연결됨" : "Flask 미연결 · 더미 데이터"}
          </span>
        </div>
        <button onClick={handleFetch} disabled={fetching || !serverOk}
          style={{ background: fetching || !serverOk ? V.bg1 : `${V.grn}22`, border: `1px solid ${fetching || !serverOk ? V.line : V.grn}`, borderRadius: 2, padding: "6px 16px", color: fetching || !serverOk ? V.ink3 : V.grn, fontSize: 13, cursor: fetching || !serverOk ? "default" : "pointer", fontFamily: "inherit", fontWeight: 600 }}>
          {fetching ? "수집 중..." : "🔄 뉴스 수집"}
        </button>
        {fetchMsg && <span style={{ fontSize: 12, fontFamily: V.mono, color: fetchMsg.startsWith("✓") ? V.grn : V.org }}>{fetchMsg}</span>}
        <div style={{ marginLeft: "auto", fontFamily: V.mono, fontSize: 14, color: V.ink2 }}>{time.toLocaleTimeString("ko-KR")}</div>
      </div>

      {/* ── 메인 (2컬럼) ── */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "280px 1fr", minHeight: 0 }}>

        {/* ── 좌측 사이드바 ── */}
        <div style={{ borderRight: `1px solid ${V.line}`, overflowY: "auto", display: "flex", flexDirection: "column" }}>

          {/* AI 종합 분석 패널 */}
          <div style={{ padding: "20px 18px", borderBottom: `1px solid ${V.line}` }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: V.ink0, marginBottom: 16 }}>
              AI 뉴스 종합 분석
              <span style={{ fontFamily: V.mono, fontSize: 11, color: V.ink2, fontWeight: 400, marginLeft: 8 }}>총 {total}건 분석</span>
            </div>

            {/* 도넛 차트 */}
            <div style={{ display: "flex", justifyContent: "center", marginBottom: 20 }}>
              <DonutChart data={stats} total={total} />
            </div>

            {/* 감성 프로그레스 바 */}
            {stats.map(s => (
              <SentimentBar key={s.key} label={s.key} count={s.count} total={total} color={s.color} />
            ))}

            {/* 평균 과장성 */}
            <div style={{ marginTop: 16, padding: "12px 14px", background: V.bg0, border: `1px solid ${V.line}`, borderRadius: 4 }}>
              <div style={{ fontSize: 12, color: V.ink2, marginBottom: 6 }}>평균 과장성 점수</div>
              <div style={{ fontFamily: V.mono, fontSize: 28, fontWeight: 700, color: parseFloat(avgClickbait) >= 30 ? V.org : V.grn }}>
                {avgClickbait}<span style={{ fontSize: 14, color: V.ink2, marginLeft: 2 }}>%</span>
              </div>
              <div style={{ height: 5, background: "#141414", borderRadius: 3, marginTop: 8, overflow: "hidden" }}>
                <div style={{ width: `${Math.min(parseFloat(avgClickbait) || 0, 100)}%`, height: "100%", background: parseFloat(avgClickbait) >= 30 ? V.org : V.grn, borderRadius: 3, transition: "width 0.6s" }} />
              </div>
            </div>
          </div>

          {/* 카테고리 필터 */}
          <div style={{ padding: "12px 0", flex: 1 }}>
            <div style={{ padding: "0 16px 10px", fontSize: 11, color: V.ink3, fontWeight: 600, fontFamily: V.mono, letterSpacing: 1 }}>섹터 선택</div>
            {CATEGORIES.map(c => (
              <div key={c.key} onClick={() => setCategory(c.key)}
                style={{ padding: "11px 18px", cursor: "pointer", background: category === c.key ? "#0d0d0d" : "transparent", borderLeft: category === c.key ? `2px solid ${V.grn}` : "2px solid transparent", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                onMouseEnter={e => { if (category !== c.key) e.currentTarget.style.background = "#080808"; }}
                onMouseLeave={e => { if (category !== c.key) e.currentTarget.style.background = "transparent"; }}
              >
                <span style={{ fontSize: 15, fontWeight: category === c.key ? 700 : 400, color: category === c.key ? V.ink0 : V.ink1 }}>{c.label}</span>
                {category === c.key && <span style={{ fontFamily: V.mono, fontSize: 13, color: V.grn }}>{news.length}</span>}
              </div>
            ))}
          </div>

          {/* 새로고침 */}
          <div style={{ padding: "12px 16px", borderTop: `1px solid ${V.line}` }}>
            {lastUpdate && <div style={{ fontSize: 11, fontFamily: V.mono, color: V.ink3, marginBottom: 8, textAlign: "center" }}>갱신 {lastUpdate.toLocaleTimeString("ko-KR")}</div>}
            <button onClick={() => loadNews(category)}
              style={{ width: "100%", background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, padding: "8px 0", color: V.ink1, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
              ↺ 새로고침
            </button>
          </div>
        </div>

        {/* ── 우측 뉴스 리스트 ── */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0 }}>

          {/* 리스트 헤더 */}
          <div style={{ padding: "14px 22px", borderBottom: `1px solid ${V.line}`, display: "flex", alignItems: "center", gap: 12, flexShrink: 0 }}>
            <span style={{ fontSize: 17, fontWeight: 700, color: V.ink0 }}>
              {CATEGORIES.find(c => c.key === category)?.label ?? "전체"}
              <span style={{ fontFamily: V.mono, fontSize: 14, color: V.ink2, fontWeight: 400, marginLeft: 10 }}>{total}건</span>
            </span>
            {!serverOk && (
              <span style={{ fontSize: 12, fontFamily: V.mono, color: V.org, padding: "3px 10px", border: `1px solid ${V.org}44`, borderRadius: 2 }}>
                더미 데이터 · Flask 서버 실행 후 새로고침
              </span>
            )}
          </div>

          {/* 카드 목록 */}
          <div style={{ flex: 1, overflowY: "auto", padding: "16px 22px", display: "flex", flexDirection: "column", gap: 12 }}>
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, gap: 10, color: V.ink2, fontSize: 15 }}>
                <div style={{ width: 20, height: 20, border: `2px solid ${V.line}`, borderTop: `2px solid ${V.grn}`, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                불러오는 중...
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            ) : news.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: V.ink3, fontSize: 16 }}>뉴스 없음</div>
            ) : news.map((item, i) => (
              <NewsCard key={item.link + i} item={item} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}