export default function MapHeader({ onGoMain, wsStatus, lastUpdate, weather }) {
  const isConn = wsStatus === "연결됨";
  const [time, setTime] = [new Date(), null]; // rendered from parent

  return (
    <div style={{ background: "rgba(7,12,23,0.98)", borderBottom: "1px solid rgba(255,255,255,0.08)", padding: "0 22px", height: 56, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
      <button onClick={onGoMain} style={{ background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "5px 13px", color: "#94a3b8", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>← 대시보드</button>
      <span style={{ fontSize: 20 }}>🚦</span>
      <div>
        <div style={{ fontWeight: 700, fontSize: 16, color: "#60a5fa" }}>실시간 교차로 지도</div>
        <div style={{ fontSize: 11, color: "#475569" }}>V2X 신호 · 위험도 · 혼잡 현황</div>
      </div>
      <div style={{ marginLeft: 16, display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 20, border: `1px solid ${isConn ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`, background: isConn ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)" }}>
        <span style={{ width: 7, height: 7, borderRadius: "50%", background: isConn ? "#22c55e" : "#ef4444", display: "inline-block" }} />
        <span style={{ fontSize: 12, color: isConn ? "#22c55e" : "#ef4444" }}>{wsStatus}</span>
      </div>
      {isConn && <div style={{ fontSize: 12, color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)", padding: "2px 9px", borderRadius: 4, fontWeight: 600 }}>● LIVE · V2X</div>}
      <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 7, border: "1px solid rgba(255,255,255,0.06)", fontSize: 13 }}>
          <span>{weather.icon}</span>
          <span style={{ color: "#94a3b8" }}>{weather.desc}</span>
          <span style={{ fontWeight: 600 }}>{weather.temp}</span>
          <span style={{ fontSize: 12, color: "#6b7280" }}>습도 {weather.humidity}</span>
        </div>
        <div style={{ fontSize: 12, color: "#6b7280" }}>갱신: <span style={{ color: "#94a3b8" }}>{lastUpdate ? lastUpdate.toLocaleTimeString("ko-KR") : "-"}</span></div>
      </div>
    </div>
  );
}
