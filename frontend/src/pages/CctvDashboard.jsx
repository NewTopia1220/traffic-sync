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

// CCTV 썸네일 카드 (그리드용) — 정보 카드형으로 풍성하게
function CctvThumb({ cctv, onClick }) {
  const hasStream = !!cctv.streamId;
  return (
    <div
      onClick={onClick}
      style={{
        background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 4,
        cursor: "pointer", overflow: "hidden", transition: "border-color .15s, transform .15s",
        display: "flex", flexDirection: "column",
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = V.blu; e.currentTarget.style.transform = "translateY(-2px)"; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = V.line; e.currentTarget.style.transform = "none"; }}
    >
      {/* 썸네일 영역 — 스캔라인 효과 + 카메라 SVG */}
      <div style={{ height: 110, background: "linear-gradient(160deg,#0a0f1a 0%,#060a12 100%)", position: "relative", display: "flex", alignItems: "center", justifyContent: "center", overflow: "hidden" }}>
        {/* 스캔라인 배경 */}
        <div style={{ position: "absolute", inset: 0, backgroundImage: "repeating-linear-gradient(0deg,transparent,transparent 3px,rgba(78,166,255,0.03) 3px,rgba(78,166,255,0.03) 4px)", pointerEvents: "none" }}/>
        {/* 모서리 브라켓 */}
        {[["0,0","tl"],["calc(100% - 14px),0","tr"],["0,calc(100% - 14px)","bl"],["calc(100% - 14px),calc(100% - 14px)","br"]].map(([pos,k])=>(
          <svg key={k} width="14" height="14" style={{ position:"absolute", left: pos.split(",")[0], top: pos.split(",")[1], opacity: 0.5 }}>
            {k==="tl" && <><line x1="0" y1="0" x2="14" y2="0" stroke={V.blu} strokeWidth="1.5"/><line x1="0" y1="0" x2="0" y2="14" stroke={V.blu} strokeWidth="1.5"/></>}
            {k==="tr" && <><line x1="0" y1="0" x2="14" y2="0" stroke={V.blu} strokeWidth="1.5"/><line x1="14" y1="0" x2="14" y2="14" stroke={V.blu} strokeWidth="1.5"/></>}
            {k==="bl" && <><line x1="0" y1="14" x2="14" y2="14" stroke={V.blu} strokeWidth="1.5"/><line x1="0" y1="0" x2="0" y2="14" stroke={V.blu} strokeWidth="1.5"/></>}
            {k==="br" && <><line x1="0" y1="14" x2="14" y2="14" stroke={V.blu} strokeWidth="1.5"/><line x1="14" y1="0" x2="14" y2="14" stroke={V.blu} strokeWidth="1.5"/></>}
          </svg>
        ))}
        {/* 카메라 SVG */}
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:6 }}>
          <svg width="52" height="40" viewBox="0 0 38 30" xmlns="http://www.w3.org/2000/svg" opacity={hasStream ? 0.85 : 0.35}>
            <rect x="2" y="6" width="24" height="18" rx="3" fill={hasStream ? V.blu : V.ink2}/>
            <polygon points="26,11 34,8 34,22 26,19" fill={hasStream ? V.blu : V.ink2}/>
            <circle cx="14" cy="15" r="6" fill="#000" opacity="0.5"/>
            <circle cx="14" cy="15" r="3.5" fill={hasStream ? "#0a1a2e" : "#111"}/>
            <circle cx="12.5" cy="13.5" r="1.2" fill="#fff" opacity={hasStream ? 0.7 : 0.3}/>
            <rect x="8" y="3" width="7" height="3" rx="1" fill={hasStream ? V.blu : V.ink2}/>
            <rect x="20" y="9" width="3" height="3" rx="0.5" fill={hasStream ? "#7ec8ff" : V.ink3}/>
          </svg>
          <div style={{ fontSize: 10, color: hasStream ? V.blu : V.ink3, fontFamily: V.mono, letterSpacing: 1 }}>
            {hasStream ? "▶ STREAM READY" : "NO STREAM"}
          </div>
        </div>
        {/* LIVE / OFFLINE 배지 */}
        <div style={{ position:"absolute", top:6, right:6, display:"flex", alignItems:"center", gap:3, background:"rgba(0,0,0,0.75)", borderRadius:2, padding:"2px 7px", border:`1px solid ${hasStream ? V.grn+"44" : V.ink3+"44"}` }}>
          <span style={{ width:5, height:5, borderRadius:"50%", background: hasStream ? V.grn : V.ink3, display:"inline-block", boxShadow: hasStream ? `0 0 4px ${V.grn}` : "none" }}/>
          <span style={{ fontSize:9, color: hasStream ? V.grn : V.ink3, fontFamily: V.mono, fontWeight:700 }}>{hasStream ? "LIVE" : "OFFLINE"}</span>
        </div>
        {/* 채널 번호 */}
        {cctv.cctvCh && (
          <div style={{ position:"absolute", bottom:6, left:6, background:"rgba(0,0,0,0.7)", borderRadius:2, padding:"1px 6px", fontSize:9, color:V.ink2, fontFamily:V.mono }}>CH {cctv.cctvCh}</div>
        )}
      </div>

      {/* 카드 하단 정보 */}
      <div style={{ padding:"10px 11px", display:"flex", flexDirection:"column", gap:5, flex:1 }}>
        <div style={{ fontSize:13, fontWeight:700, color:V.ink0, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
          {cctv.cctvNm}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ fontSize:10, color:V.ink3, fontFamily:V.mono }}>ID</span>
          <span style={{ fontSize:10, color:V.ink2, fontFamily:V.mono }}>{cctv.cctvId}</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:4, fontSize:10, color:V.ink3, fontFamily:V.mono }}>
          <span>📍</span>
          <span>{cctv.lat?.toFixed(4)}, {cctv.lon?.toFixed(4)}</span>
        </div>
      </div>
    </div>
  );
}

// 확대 모달
function CctvModal({ cctv, onClose }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 200,
        background: "rgba(0,0,0,0.88)",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: "85vw", maxWidth: 1200, background: V.bg0,
          border: `1px solid ${V.line}`, borderRadius: 2, overflow: "hidden",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* 모달 헤더 */}
        <div style={{
          padding: "12px 18px", borderBottom: `1px solid ${V.line}`,
          display: "flex", alignItems: "center", justifyContent: "space-between",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: V.ink0 }}>{cctv.cctvNm}</span>
            <span style={{ fontFamily: V.mono, fontSize: 12, color: V.ink2 }}>ID: {cctv.cctvId}</span>
            {cctv.cctvCh && <span style={{ fontFamily: V.mono, fontSize: 12, color: V.ink2 }}>CH: {cctv.cctvCh}</span>}
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: cctv.streamId ? V.grn : V.ink3, display: "inline-block" }} />
              <span style={{ fontSize: 12, color: cctv.streamId ? V.grn : V.ink3 }}>
                {cctv.streamId ? "스트림 연결됨" : "스트림 없음"}
              </span>
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, padding: "5px 14px", color: V.ink1, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}
          >✕ 닫기</button>
        </div>

        {/* 영상 영역 */}
        <div style={{ height: "65vh", background: "#000", position: "relative", overflow: "hidden" }}>
          {cctv.streamId ? (
            <iframe
              key={cctv.cctvId}
              src={
                `https://www.utic.go.kr/jsp/map/openDataCctvStream.jsp`
                + `?key=${UTIC_KEY}`
                + `&cctvid=${encodeURIComponent(cctv.cctvId)}`
                + `&cctvName=${encodeURIComponent(encodeURIComponent(cctv.cctvNm))}`
                + `&kind=Seoul&cctvip=undefined`
                + `&cctvch=${cctv.cctvCh ?? 51}`
                + `&id=${cctv.streamId}`
                + `&cctvpasswd=undefined&cctvport=undefined`
              }
              style={{
                border: "none", display: "block", width: "100%", height: "100%",
                position: "absolute", top: "50%", left: "50%",
                transformOrigin: "center center",
                transform: "translate(-50%, 59%) scale(4.0)",
              }}
              title={cctv.cctvNm}
              allow="autoplay"
            />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 10 }}>
              <div style={{ fontSize: 48, opacity: 0.08 }}>📷</div>
              <div style={{ fontSize: 14, color: V.ink3 }}>스트림 정보 없음</div>
            </div>
          )}
          {/* 오버레이 라벨 */}
          <div style={{ position: "absolute", top: 10, left: 10, background: "rgba(0,0,0,0.75)", border: `1px solid ${V.line}`, borderRadius: 2, padding: "4px 10px", fontSize: 13, color: V.ink1, pointerEvents: "none" }}>
            {cctv.cctvNm}
          </div>
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
  const [openGu,   setOpenGu]   = useState(null); // 선택된 구 이름
  const [modal,    setModal]    = useState(null);  // 확대 모달 CCTV

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

  // 구별 그룹핑
  const guGroups = useMemo(() => {
    const map = {};
    cctvList.forEach(cctv => {
      const gu = assignGu(cctv);
      if (!map[gu]) map[gu] = [];
      map[gu].push(cctv);
    });
    return GU_LIST.filter(g => map[g.name]).map(g => ({ name: g.name, cctvs: map[g.name] }));
  }, [cctvList]);

  const currentGroup = openGu ? guGroups.find(g => g.name === openGu) : null;

  return (
    <div style={{ fontFamily: V.sans, background: V.bg0, color: V.ink0, height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* 헤더 */}
      <div style={{ background: V.bg0, borderBottom: `1px solid ${V.line}`, padding: "0 22px", height: 56, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <button onClick={onGoMain} style={{ background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, padding: "5px 13px", color: V.ink1, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>← 대시보드</button>
        <span style={{ fontSize: 18 }}>📷</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: V.blu }}>CCTV 관제</div>
          <div style={{ fontSize: 11, color: V.ink2 }}>교차로 실시간 영상 모니터링</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          {!loading && (
            <span style={{ fontFamily: V.mono, fontSize: 12, color: V.ink2 }}>총 {cctvList.length}개 CCTV</span>
          )}
          <span style={{ fontFamily: V.mono, fontSize: 13, color: V.ink2 }}>{time.toLocaleTimeString("ko-KR")}</span>
          <button onClick={onGoMap} style={{ background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, padding: "5px 13px", color: V.ink1, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>🗺️ 지도 보기</button>
        </div>
      </div>

      {/* 메인 */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>

        {/* 좌측 구 목록 */}
        <div style={{ width: 200, borderRight: `1px solid ${V.line}`, overflowY: "auto", flexShrink: 0 }}>
          <div style={{ padding: "10px 14px 6px", fontSize: 11, color: V.ink3, fontWeight: 600, letterSpacing: 1, fontFamily: V.mono }}>
            구 선택
          </div>
          {loading && <div style={{ padding: "20px 14px", fontSize: 13, color: V.ink2 }}>불러오는 중...</div>}
          {/* 전체 보기 */}
          <div
            onClick={() => setOpenGu(null)}
            style={{
              padding: "10px 14px", cursor: "pointer",
              background: !openGu ? "#0d0d0d" : "transparent",
              borderLeft: !openGu ? `2px solid ${V.blu}` : "2px solid transparent",
              display: "flex", alignItems: "center", justifyContent: "space-between",
            }}
            onMouseEnter={e => { if (openGu) e.currentTarget.style.background = "#080808"; }}
            onMouseLeave={e => { if (openGu) e.currentTarget.style.background = "transparent"; }}
          >
            <span style={{ fontSize: 14, fontWeight: !openGu ? 700 : 400, color: !openGu ? V.ink0 : V.ink1 }}>전체 보기</span>
            <span style={{ fontFamily: V.mono, fontSize: 13, color: V.blu }}>{cctvList.length}</span>
          </div>

          {guGroups.map(gu => (
            <div
              key={gu.name}
              onClick={() => setOpenGu(gu.name)}
              style={{
                padding: "10px 14px", cursor: "pointer",
                background: openGu === gu.name ? "#0d0d0d" : "transparent",
                borderLeft: openGu === gu.name ? `2px solid ${V.blu}` : "2px solid transparent",
                display: "flex", alignItems: "center", justifyContent: "space-between",
              }}
              onMouseEnter={e => { if (openGu !== gu.name) e.currentTarget.style.background = "#080808"; }}
              onMouseLeave={e => { if (openGu !== gu.name) e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ fontSize: 14, fontWeight: openGu === gu.name ? 700 : 400, color: openGu === gu.name ? V.ink0 : V.ink1 }}>
                {gu.name}
              </span>
              <span style={{ fontFamily: V.mono, fontSize: 13, color: V.blu }}>{gu.cctvs.length}</span>
            </div>
          ))}
        </div>

        {/* 우측 그리드 */}
        <div style={{ flex: 1, overflowY: "auto", padding: 16 }}>
          {loading ? (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", gap: 10, color: V.ink2 }}>
              <div style={{ width: 20, height: 20, border: `2px solid ${V.line}`, borderTop: `2px solid ${V.blu}`, borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              불러오는 중...
              <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            </div>
          ) : openGu ? (
            // ── 구 선택됨: 해당 구 CCTV 4열 그리드 ──
            <>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
                <span style={{ fontSize: 16, fontWeight: 700, color: V.ink0 }}>{openGu}</span>
                <span style={{ fontFamily: V.mono, fontSize: 13, color: V.ink2 }}>{currentGroup?.cctvs.length}개</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                {currentGroup?.cctvs.map(cctv => (
                  <CctvThumb key={cctv.cctvId} cctv={cctv} onClick={() => setModal(cctv)} />
                ))}
              </div>
            </>
          ) : (
            // ── 전체 보기: 구별로 4개씩 미리보기 ──
            <>
              <div style={{ fontSize: 13, color: V.ink2, marginBottom: 14 }}>
                구를 클릭하면 해당 구 전체 CCTV를 볼 수 있어요.
              </div>
              {guGroups.map(gu => (
                <div key={gu.name} style={{ marginBottom: 28 }}>
                  {/* 구 헤더 */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, paddingBottom: 8, borderBottom: `1px solid ${V.line}` }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: V.ink0 }}>{gu.name}</span>
                    <span style={{ fontFamily: V.mono, fontSize: 12, color: V.ink2 }}>총 {gu.cctvs.length}개</span>
                    {gu.cctvs.length > 4 && (
                      <button
                        onClick={() => setOpenGu(gu.name)}
                        style={{ marginLeft: "auto", background: "transparent", border: `1px solid ${V.line}`, borderRadius: 2, padding: "3px 10px", color: V.blu, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}
                      >
                        전체 보기 ({gu.cctvs.length}개) →
                      </button>
                    )}
                  </div>
                  {/* 4개씩 미리보기 */}
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
                    {gu.cctvs.slice(0, 4).map(cctv => (
                      <CctvThumb key={cctv.cctvId} cctv={cctv} onClick={() => setModal(cctv)} />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* 확대 모달 */}
      {modal && <CctvModal cctv={modal} onClose={() => setModal(null)} />}
    </div>
  );
}