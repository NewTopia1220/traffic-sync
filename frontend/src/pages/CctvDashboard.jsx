import { useState, useEffect, useMemo } from "react";
import { GU_LIST, calcDistKm } from "../constants/seoulGeoData";

const UTIC_KEY = import.meta.env.VITE_UTIC_KEY || "";
const API_BASE  = import.meta.env.VITE_API_URL || "http://localhost:8080";

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

// 확대 모달
function CctvModal({ cctv, onClose }) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(0,0,0,0.88)", display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div onClick={e => e.stopPropagation()} style={{ width: "85vw", maxWidth: 1100, background: V.bg0, border: `1px solid ${V.line}`, borderRadius: 2, overflow: "hidden", display: "flex", flexDirection: "column" }}>
        {/* 헤더 */}
        <div style={{ padding: "12px 18px", borderBottom: `1px solid ${V.line}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: V.ink0 }}>{cctv.cctvNm}</span>
            <span style={{ fontFamily: V.mono, fontSize: 12, color: V.ink2 }}>ID: {cctv.cctvId}</span>
            {cctv.cctvCh && <span style={{ fontFamily: V.mono, fontSize: 12, color: V.ink2 }}>CH: {cctv.cctvCh}</span>}
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: cctv.streamId ? V.grn : V.ink3, display: "inline-block" }} />
              <span style={{ fontSize: 12, color: cctv.streamId ? V.grn : V.ink3 }}>{cctv.streamId ? "스트림 연결됨" : "스트림 없음"}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, padding: "5px 14px", color: V.ink1, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>✕ 닫기</button>
        </div>
        {/* 영상 */}
        <div style={{ height: "65vh", background: "#000", position: "relative", overflow: "hidden" }}>
          {cctv.streamId ? (
            <iframe
              key={cctv.cctvId}
              src={`https://www.utic.go.kr/jsp/map/openDataCctvStream.jsp?key=${UTIC_KEY}&cctvid=${encodeURIComponent(cctv.cctvId)}&cctvName=${encodeURIComponent(encodeURIComponent(cctv.cctvNm))}&kind=Seoul&cctvip=undefined&cctvch=${cctv.cctvCh ?? 51}&id=${cctv.streamId}&cctvpasswd=undefined&cctvport=undefined`}
              style={{ border: "none", display: "block", width: "100%", height: "100%", position: "absolute", top: "50%", left: "50%", transformOrigin: "center center", transform: "translate(-50%, 59%) scale(4.0)" }}
              title={cctv.cctvNm} allow="autoplay"
            />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <div style={{ fontSize: 48, opacity: 0.08 }}>📷</div>
              <div style={{ fontSize: 14, color: V.ink3 }}>스트림 정보 없음</div>
            </div>
          )}
          <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(0,0,0,0.75)", border: `1px solid ${V.line}`, borderRadius: 2, padding: "4px 10px", fontSize: 13, color: V.ink1, pointerEvents: "none" }}>{cctv.cctvNm}</div>
          {cctv.streamId && (
            <div style={{ position: "absolute", top: 10, right: 10, display: "flex", alignItems: "center", gap: 5, background: "rgba(0,0,0,0.75)", border: `1px solid ${V.line}`, borderRadius: 2, padding: "4px 10px", pointerEvents: "none" }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: V.red, display: "inline-block" }} />
              <span style={{ fontSize: 11, color: V.red, fontWeight: 700, fontFamily: V.mono }}>LIVE</span>
            </div>
          )}
        </div>
        {/* 하단 메타 */}
        <div style={{ padding: "10px 18px", borderTop: `1px solid ${V.line}`, display: "flex", gap: 24, fontFamily: V.mono, fontSize: 12, color: V.ink2 }}>
          <span>{cctv.lat?.toFixed(5)}°N, {cctv.lon?.toFixed(5)}°E</span>
          <span>ID: {cctv.cctvId}</span>
          {cctv.cctvCh && <span>CH: {cctv.cctvCh}</span>}
        </div>
      </div>
    </div>
  );
}

export default function CctvDashboard({ onGoMain, onGoMap }) {
  const [time,     setTime]     = useState(new Date());
  const [cctvList, setCctvList] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [openGu,   setOpenGu]   = useState(null);
  const [modal,    setModal]    = useState(null);
  const [search,   setSearch]   = useState("");

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/cctv`)
      .then(r => r.json())
      .then(data => setCctvList(data))
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

  // 현재 표시할 CCTV 목록 (구 선택 + 검색 필터)
  const displayList = useMemo(() => {
    let list = openGu
      ? (guGroups.find(g => g.name === openGu)?.cctvs ?? [])
      : cctvList;
    if (search.trim()) {
      list = list.filter(c => c.cctvNm?.includes(search.trim()));
    }
    return list;
  }, [openGu, guGroups, cctvList, search]);

  return (
    <div style={{ fontFamily: V.sans, background: V.bg0, color: V.ink0, height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* 헤더 */}
      <div style={{ background: V.bg0, borderBottom: `1px solid ${V.line}`, padding: "0 22px", height: 56, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <button onClick={onGoMain} style={{ background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, padding: "6px 15px", color: V.ink1, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>← 대시보드</button>
        <span style={{ fontSize: 18 }}>📷</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 19, color: V.blu }}>CCTV 관제</div>
          <div style={{ fontSize: 13, color: V.ink2 }}>교차로 실시간 영상 모니터링</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          {!loading && <span style={{ fontFamily: V.mono, fontSize: 14, color: V.ink2 }}>총 {cctvList.length}개 CCTV</span>}
          <span style={{ fontFamily: V.mono, fontSize: 14, color: V.ink2 }}>{time.toLocaleTimeString("ko-KR")}</span>
          <button onClick={onGoMap} style={{ background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, padding: "6px 15px", color: V.ink1, fontSize: 14, cursor: "pointer", fontFamily: "inherit" }}>🗺️ 지도 보기</button>
        </div>
      </div>

      {/* 메인 */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

        {/* 좌측 구 목록 */}
        <div style={{ width: 180, borderRight: `1px solid ${V.line}`, overflowY: "auto", flexShrink: 0 }}>
          <div style={{ padding: "10px 14px 6px", fontSize: 12, color: V.ink3, fontWeight: 600, letterSpacing: 1, fontFamily: V.mono }}>구 선택</div>
          {/* 전체 */}
          <div
            onClick={() => setOpenGu(null)}
            style={{ padding: "9px 14px", cursor: "pointer", background: !openGu ? "#0d0d0d" : "transparent", borderLeft: !openGu ? `2px solid ${V.blu}` : "2px solid transparent", display: "flex", justifyContent: "space-between", alignItems: "center" }}
            onMouseEnter={e => { if (openGu) e.currentTarget.style.background = "#080808"; }}
            onMouseLeave={e => { if (openGu) e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ fontSize: 15, fontWeight: !openGu ? 700 : 400, color: !openGu ? V.ink0 : V.ink1 }}>전체 보기</span>
            <span style={{ fontFamily: V.mono, fontSize: 14, color: V.blu }}>{cctvList.length}</span>
          </div>
          {guGroups.map(gu => (
            <div key={gu.name}
              onClick={() => setOpenGu(gu.name)}
              style={{ padding: "9px 14px", cursor: "pointer", background: openGu === gu.name ? "#0d0d0d" : "transparent", borderLeft: openGu === gu.name ? `2px solid ${V.blu}` : "2px solid transparent", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              onMouseEnter={e => { if (openGu !== gu.name) e.currentTarget.style.background = "#080808"; }}
              onMouseLeave={e => { if (openGu !== gu.name) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ fontSize: 15, fontWeight: openGu === gu.name ? 700 : 400, color: openGu === gu.name ? V.ink0 : V.ink1 }}>{gu.name}</span>
              <span style={{ fontFamily: V.mono, fontSize: 14, color: V.blu }}>{gu.cctvs.length}</span>
            </div>
          ))}
        </div>

        {/* 우측 리스트 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", minHeight: 0 }}>

          {/* 리스트 헤더: 제목 + 검색 */}
          <div style={{ padding: "12px 20px", borderBottom: `1px solid ${V.line}`, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: V.ink0 }}>
              {openGu ?? "전체"} <span style={{ fontFamily: V.mono, fontSize: 14, color: V.ink2, fontWeight: 400 }}>{displayList.length}개</span>
            </span>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="CCTV 이름 검색..."
              style={{ marginLeft: "auto", background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, padding: "7px 14px", color: V.ink0, fontSize: 14, outline: "none", fontFamily: "inherit", width: 200 }}
            />
          </div>

          {/* 테이블 헤더 */}
          <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 90px", padding: "8px 20px", borderBottom: `1px solid ${V.line}`, flexShrink: 0 }}>
            {["CCTV 이름", "ID", "채널", "좌표", "상태"].map(h => (
              <div key={h} style={{ fontSize: 13, color: V.ink3, fontWeight: 600, fontFamily: V.mono, letterSpacing: 0.5 }}>{h}</div>
            ))}
          </div>

          {/* 리스트 바디 */}
          <div style={{ flex: 1, overflowY: "auto" }}>
            {loading ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, gap: 10, color: V.ink2 }}>
                <div style={{ width: 18, height: 18, border: `2px solid ${V.line}`, borderTop: `2px solid ${V.blu}`, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
                불러오는 중...
                <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
              </div>
            ) : displayList.length === 0 ? (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: V.ink3, fontSize: 14 }}>
                검색 결과 없음
              </div>
            ) : displayList.map((cctv, i) => (
              <div key={cctv.cctvId}
                onClick={() => setModal(cctv)}
                style={{
                  display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 90px",
                  padding: "14px 20px",
                  borderBottom: `1px solid ${V.line}`,
                  cursor: "pointer",
                  background: i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)",
                  transition: "background .1s",
                }}
                onMouseEnter={e => e.currentTarget.style.background = "rgba(78,166,255,0.06)"}
                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : "rgba(255,255,255,0.01)"}
              >
                {/* CCTV 이름 */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontSize: 15, color: V.ink0, fontWeight: 500 }}>{cctv.cctvNm}</span>
                </div>
                {/* ID */}
                <div style={{ fontSize: 14, color: V.ink2, fontFamily: V.mono, alignSelf: "center" }}>{cctv.cctvId}</div>
                {/* 채널 */}
                <div style={{ fontSize: 14, color: V.ink2, fontFamily: V.mono, alignSelf: "center" }}>
                  {cctv.cctvCh ? `CH ${cctv.cctvCh}` : "—"}
                </div>
                {/* 좌표 */}
                <div style={{ fontSize: 13, color: V.ink3, fontFamily: V.mono, alignSelf: "center" }}>
                  {cctv.lat?.toFixed(4)}, {cctv.lon?.toFixed(4)}
                </div>
                {/* 상태 */}
                <div style={{ display: "flex", alignItems: "center", gap: 5, alignSelf: "center" }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: cctv.streamId ? V.grn : V.ink3, display: "inline-block", flexShrink: 0, boxShadow: cctv.streamId ? `0 0 4px ${V.grn}` : "none" }} />
                  <span style={{ fontSize: 13, color: cctv.streamId ? V.grn : V.ink3, fontFamily: V.mono }}>
                    {cctv.streamId ? "LIVE" : "NO SRC"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 확대 모달 */}
      {modal && <CctvModal cctv={modal} onClose={() => setModal(null)} />}
    </div>
  );
}