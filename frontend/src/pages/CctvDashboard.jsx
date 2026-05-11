import { useState, useEffect, useMemo } from "react";
import { GU_LIST, calcDistKm } from "../constants/seoulGeoData";

const UTIC_KEY = import.meta.env.VITE_UTIC_KEY || "";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

const V = {
  bg0: "#000", bg1: "#0a0a0a", line: "#1a1a1a",
  ink0: "#e7ecf5", ink1: "#aab4c8", ink2: "#7a7a7a", ink3: "#3a3a3a",
  grn: "#2ee07a", red: "#ff5566", org: "#ffaa33", blu: "#4ea6ff",
  mono: "'IBM Plex Mono',ui-monospace,Menlo,monospace",
  sans: "'Pretendard','Noto Sans KR','Malgun Gothic',system-ui,sans-serif",
};

function assignGu(cctv) {
  let best = null, bestDist = Infinity;
  GU_LIST.forEach(gu => {
    const d = calcDistKm(cctv.lat, cctv.lon, gu.lat, gu.lon);
    if (d < bestDist) { bestDist = d; best = gu.name; }
  });
  return best;
}

export default function CctvDashboard({ onGoMain, onGoMap }) {
  const [time, setTime] = useState(new Date());
  const [cctvList, setCctvList] = useState([]);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openGu, setOpenGu] = useState(null); // 열린 구 이름

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/cctv`)
      .then(r => r.json())
      .then(data => { setCctvList(data); })
      .catch(() => setCctvList([]))
      .finally(() => setLoading(false));
  }, []);

  const guGroups = useMemo(() => {
    const map = {};
    cctvList.forEach(cctv => {
      const gu = assignGu(cctv);
      if (!map[gu]) map[gu] = [];
      map[gu].push(cctv);
    });
    return GU_LIST.filter(g => map[g.name]).map(g => ({ name: g.name, cctvs: map[g.name] }));
  }, [cctvList]);

  const toggleGu = (guName, cctvs) => {
    if (openGu === guName) {
      setOpenGu(null);
    } else {
      setOpenGu(guName);
      if (!selected || !cctvs.some(c => c.cctvId === selected.cctvId)) {
        setSelected(cctvs[0] ?? null);
      }
    }
  };

  return (
    <div style={{ fontFamily: V.sans, background: V.bg0, color: V.ink0, height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* 헤더 */}
      <div style={{ background: V.bg0, borderBottom: `1px solid ${V.line}`, padding: "0 22px", height: 56, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <button onClick={onGoMain} style={{ background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, padding: "5px 13px", color: V.ink1, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>← 대시보드</button>
        <span style={{ fontSize: 18 }}>📷</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 15, color: V.blu }}>CCTV 관제</div>
          <div style={{ fontSize: 11, color: V.ink2 }}>교차로 실시간 영상 모니터링</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          <span style={{ fontFamily: V.mono, fontSize: 13, color: V.ink2 }}>{time.toLocaleTimeString("ko-KR")}</span>
          <button onClick={onGoMap} style={{ background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, padding: "5px 13px", color: V.ink1, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>🗺️ 지도 보기</button>
        </div>
      </div>

      {/* 메인 */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "260px 1fr", minHeight: 0 }}>

        {/* 좌측 — 구 아코디언 목록 */}
        <div style={{ borderRight: `1px solid ${V.line}`, overflowY: "auto", padding: "8px 0" }}>
          <div style={{ padding: "0 14px 8px", fontSize: 11, color: V.ink3, fontWeight: 600, letterSpacing: 1, fontFamily: V.mono }}>
            CCTV {!loading && `· 총 ${cctvList.length}개`}
          </div>

          {loading && <div style={{ padding: "20px 14px", fontSize: 13, color: V.ink2 }}>불러오는 중...</div>}

          {guGroups.map(gu => {
            const isOpen = openGu === gu.name;
            return (
              <div key={gu.name}>
                {/* 구 헤더 — 클릭하면 드롭다운 */}
                <div
                  onClick={() => toggleGu(gu.name, gu.cctvs)}
                  style={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    padding: "10px 14px", cursor: "pointer",
                    background: isOpen ? "#0d0d0d" : "transparent",
                    borderLeft: isOpen ? `2px solid ${V.blu}` : "2px solid transparent",
                  }}
                  onMouseEnter={e => { if (!isOpen) e.currentTarget.style.background = "#080808"; }}
                  onMouseLeave={e => { if (!isOpen) e.currentTarget.style.background = "transparent"; }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 16, fontWeight: isOpen ? 700 : 500, color: isOpen ? V.ink0 : V.ink1 }}>
                      {gu.name}
                    </span>
                    <span style={{ fontFamily: V.mono, fontSize: 14, fontWeight: 700, color: V.blu }}>
                      {gu.cctvs.length}
                    </span>
                  </div>
                  <span style={{ fontSize: 10, color: V.ink3, transform: isOpen ? "rotate(180deg)" : "none", transition: "transform .2s" }}>▼</span>
                </div>

                {/* CCTV 목록 — 드롭다운 */}
                {isOpen && gu.cctvs.map(cctv => (
                  <div key={cctv.cctvId} onClick={() => setSelected(cctv)}
                    style={{
                      padding: "8px 14px 8px 26px", cursor: "pointer",
                      background: selected?.cctvId === cctv.cctvId ? "#141414" : "transparent",
                      borderLeft: selected?.cctvId === cctv.cctvId ? `2px solid ${V.blu}` : "2px solid transparent",
                    }}
                    onMouseEnter={e => { if (selected?.cctvId !== cctv.cctvId) e.currentTarget.style.background = "#0a0a0a"; }}
                    onMouseLeave={e => { if (selected?.cctvId !== cctv.cctvId) e.currentTarget.style.background = "transparent"; }}
                  >
                    <div style={{ fontSize: 14, color: selected?.cctvId === cctv.cctvId ? V.blu : V.ink1, fontWeight: selected?.cctvId === cctv.cctvId ? 600 : 400 }}>
                      {cctv.cctvNm}
                    </div>
                    <div style={{ fontSize: 12, color: V.ink2, marginTop: 2, fontFamily: V.mono }}>
                      {cctv.lat?.toFixed(4)}, {cctv.lon?.toFixed(4)}
                    </div>
                    <div style={{ marginTop: 4, display: "flex", alignItems: "center", gap: 4 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: cctv.streamId ? V.grn : V.ink3, display: "inline-block" }} />
                      <span style={{ fontSize: 12, color: cctv.streamId ? V.grn : V.ink3 }}>
                        {cctv.streamId ? "스트림 연결됨" : "스트림 없음"}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            );
          })}
        </div>

        {/* 우측 — 영상 영역 */}
        <div style={{ display: "flex", flexDirection: "column", padding: 16, gap: 12, minHeight: 0 }}>
          {selected ? (
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: V.ink0 }}>{selected.cctvNm}</div>
                <div style={{ fontSize: 12, color: V.ink2, fontFamily: V.mono }}>ID: {selected.cctvId}</div>
                {selected.cctvCh && <div style={{ fontSize: 12, color: V.ink2, fontFamily: V.mono }}>CH: {selected.cctvCh}</div>}
                <div style={{ marginLeft: "auto", fontSize: 12, color: V.ink2, fontFamily: V.mono }}>
                  {selected.lat?.toFixed(5)}°N, {selected.lon?.toFixed(5)}°E
                </div>
              </div>

              <div style={{ flex: 1, background: "#000", border: `1px solid ${V.line}`, borderRadius: 2, minHeight: 0, position: "relative", overflow: "hidden" }}>
                {selected.streamId ? (
                  <iframe
                    key={selected.cctvId}
                    src={
                      `https://www.utic.go.kr/jsp/map/openDataCctvStream.jsp`
                      + `?key=${UTIC_KEY}`
                      + `&cctvid=${encodeURIComponent(selected.cctvId)}`
                      + `&cctvName=${encodeURIComponent(encodeURIComponent(selected.cctvNm))}`
                      + `&kind=Seoul`
                      + `&cctvip=undefined`
                      + `&cctvch=${selected.cctvCh ?? 51}`
                      + `&id=${selected.streamId}`
                      + `&cctvpasswd=undefined&cctvport=undefined`
                    }
                    style={{ border: "none", display: "block", width: "100%", height: "100%", position: "absolute", top: "50%", left: "50%", transformOrigin: "center center", transform: "translate(-50%, 59%) scale(4.0)" }}
                    title={selected.cctvNm}
                    allow="autoplay"
                  />
                ) : (
                  <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 8 }}>
                    <div style={{ fontSize: 40, opacity: 0.1 }}>📷</div>
                    <div style={{ fontSize: 14, color: V.ink3 }}>스트림 정보 없음</div>
                  </div>
                )}
                <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(0,0,0,0.75)", border: `1px solid ${V.line}`, borderRadius: 2, padding: "3px 8px", fontSize: 12, color: V.ink1, pointerEvents: "none" }}>
                  {selected.cctvNm}
                </div>
                {selected.streamId && (
                  <div style={{ position: "absolute", top: 10, right: 10, display: "flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,0.75)", border: `1px solid ${V.line}`, borderRadius: 2, padding: "3px 8px", pointerEvents: "none" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: V.red, display: "inline-block" }} />
                    <span style={{ fontSize: 11, color: V.red, fontWeight: 600 }}>LIVE</span>
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10 }}>
                {[
                  { label: "차량 감지", value: "—", unit: "대", icon: "🚗", color: V.blu },
                  { label: "혼잡도", value: "—", unit: "", icon: "📊", color: V.org },
                  { label: "보행자", value: "—", unit: "명", icon: "🚶", color: V.grn },
                ].map(s => (
                  <div key={s.label} style={{ background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, padding: "12px 14px", display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 20 }}>{s.icon}</span>
                    <div>
                      <div style={{ fontSize: 11, color: V.ink2 }}>{s.label}</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: s.color, fontFamily: V.mono }}>
                        {s.value}<span style={{ fontSize: 12 }}>{s.unit}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10, color: V.ink3 }}>
              <div style={{ fontSize: 36, opacity: 0.2 }}>📷</div>
              <div style={{ fontSize: 14 }}>좌측에서 구를 선택하세요</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
