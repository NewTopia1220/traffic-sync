import { useEffect, useState } from "react";

const V = {
  bg0: "#000", line: "#1a1a1a", ink0: "#e7ecf5", ink1: "#aab4c8", ink2: "#7a7a7a", ink3: "#3a3a3a",
  grn: "#2ee07a", org: "#ffaa33", blu: "#4ea6ff", red: "#ff5566",
  mono: "'IBM Plex Mono',ui-monospace,Menlo,monospace",
  sans: "'Pretendard','Noto Sans KR','Malgun Gothic',system-ui,sans-serif",
};

export default function AppHeader({
  activePage = "main",
  selectedGu,
  statusText,
  statusLive = false,
  onGoMain,
  onGoMap,
  onGoNews,
  onGoCctv,
  onGoSimulation,
  onGoComplaints,
  onGoMyPage,
  onLogout,
  rightExtra,
  complaintCount = 0,
}) {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  const tabs = [
    ["통합 대시보드", "main"],
    ["실시간 지도", "map"],
    ["뉴스", "news"],
    ["CCTV 관제", "cctv"],
    ["신호 시뮬레이션", "simulation"],
    ["민원 관리", "complaints"],
  ];

  const go = (tab) => {
    if (tab === "main") return onGoMain?.();
    if (tab === "map") return onGoMap?.(selectedGu);
    if (tab === "news") return onGoNews?.();
    if (tab === "cctv") return onGoCctv?.();
    if (tab === "simulation") return onGoSimulation?.();
    if (tab === "complaints") return onGoComplaints?.();
  };

  return (
    <div style={{ background: V.bg0, borderBottom: `1px solid ${V.line}`, padding: "0 12px", height: 60, display: "flex", alignItems: "center", gap: 8, flexShrink: 0, position: "sticky", top: 0, zIndex: 100, fontFamily: V.sans, overflow: "hidden", whiteSpace: "nowrap" }}>
      <button onClick={onGoMain} style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 210, flexShrink: 0, background: "transparent", border: 0, padding: 0, cursor: "pointer", textAlign: "left", fontFamily: V.sans }}>
        <div style={{ width: 24, height: 24, borderRadius: 4, display: "grid", placeItems: "center", background: "#0a0a0a", border: `1px solid ${V.line}` }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: V.grn, display: "block" }} />
        </div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: V.ink0 }}>Traffic-Sync 관제 시스템</div>
          <div style={{ fontSize: 10, color: V.ink2 }}>V2X 공공 API 기반 실시간 교통 관제 플랫폼</div>
        </div>
      </button>

      <div style={{ display: "flex", gap: 2, background: V.bg0, border: `1px solid ${V.line}`, borderRadius: 999, padding: 3, flexShrink: 0 }}>
        {tabs.map(([label, tab]) => {
          const isActive = tab === activePage;
          const isCivil  = tab === "complaints";
          const dotColor = isActive ? V.blu : isCivil ? V.org : V.ink3;
          return (
            <button key={tab} onClick={() => go(tab)}
              style={{ appearance: "none", border: 0, background: isActive ? "#141414" : "transparent", color: isActive ? V.blu : "#fff", padding: "6px 10px", borderRadius: 999, fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: isActive ? "inset 0 0 0 1px #2a2a2a" : "none", fontFamily: V.sans, position: "relative", whiteSpace: "nowrap", flexShrink: 0, lineHeight: 1.15 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: dotColor, display: "inline-block" }} />
              {label}
              {/* 미처리 민원 배지 */}
              {isCivil && complaintCount > 0 && (
                <span style={{ position: "absolute", top: 4, right: 6, minWidth: 16, height: 16, background: V.org, borderRadius: 999, fontFamily: V.mono, fontSize: 9, fontWeight: 700, color: "#000", display: "flex", alignItems: "center", justifyContent: "center", padding: "0 4px" }}>
                  {complaintCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {selectedGu && (
        <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "4px 9px", borderRadius: 2, background: "#1a1206", border: "1px solid #3a2a14", color: V.org, fontSize: 11, fontWeight: 600, whiteSpace: "nowrap", flexShrink: 0 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: V.org, display: "inline-block" }} />
          {selectedGu.name} 선택됨
        </div>
      )}

      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 8, flexShrink: 0, whiteSpace: "nowrap" }}>
        {statusText && (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px", border: `1px solid ${V.line}`, background: V.bg0, borderRadius: 2, fontFamily: V.mono, fontSize: 12, color: V.ink1, whiteSpace: "nowrap" }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: statusLive ? V.grn : V.ink3, display: "inline-block" }} />
            {statusText}
          </span>
        )}
        {rightExtra}
        <span style={{ fontFamily: V.mono, fontSize: 11, color: V.ink0, letterSpacing: ".3px" }}>
          <span style={{ color: V.ink2, marginRight: 6 }}>{time.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" })}</span>
          {time.toLocaleTimeString("ko-KR")}
        </span>
        {onGoMyPage && <button onClick={onGoMyPage} style={{ background: "transparent", border: `1px solid ${V.line}`, borderRadius: 999, padding: "6px 10px", color: "#fff", fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: V.sans, whiteSpace: "nowrap", flexShrink: 0 }}>마이페이지</button>}
        {onLogout && <button onClick={() => { localStorage.removeItem("ts_user"); onLogout(); }} style={{ background: "transparent", border: "1px solid #3a1820", borderRadius: 999, padding: "6px 10px", color: V.red, fontSize: 13, fontWeight: 500, cursor: "pointer", fontFamily: V.sans, whiteSpace: "nowrap", flexShrink: 0 }}>로그아웃</button>}
      </div>
    </div>
  );
}
