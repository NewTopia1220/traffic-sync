import { useState, useEffect, useCallback } from "react";
import { useWebSocket } from "../hooks/useWebSocket";
import KakaoMapView from "../components/map/KakaoMapView";
import SignalPanel from "../components/map/SignalPanel";
import RoadViewModal from "../components/map/RoadViewModal";
import CctvModal from "../components/map/CctvModal";
import BottleneckList from "../components/sidebar/BottleneckList";
import RiskList from "../components/sidebar/RiskList";
import AIChatBot from "../components/sidebar/AIChatBot";
import CctvPanel from "../components/cctv/CctvPanel";

const WEATHER = { icon: "🌤️", temp: "21°C", desc: "맑음", humidity: "65%" };
const TABS = [
  { key: "map",  label: "🗺️ 실시간 지도" },
  { key: "cctv", label: "📷 CCTV 화면"  },
];

export default function MapDashboard({ onGoMain, onGoCctv, wsData, setWsData, initialCenter }) {
  const [time,         setTime]         = useState(new Date());
  const [selected,     setSelected]     = useState(null);
  const [activeTab,    setActiveTab]    = useState("map");   // ← 누락된 state
  const [showRoadView, setShowRoadView] = useState(false);
  const [selectedCctv, setSelectedCctv] = useState(null);

  // WebSocket 연결 관리 (wsStatus, lastUpdate는 여기서만 선언)
  const { wsStatus, lastUpdate } = useWebSocket(setWsData);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setSelected(prev => {
      if (!prev && wsData.length > 0) return wsData[0];
      if (prev) return wsData.find(c => c.crsrdId === prev.crsrdId) || prev;
      return prev;
    });
  }, [wsData]);

  const selectCr = useCallback(cr => {
    setSelected(cr);
    setActiveTab("map");
  }, []);

  const bottlenecks = [...wsData].filter(c => c.congestion !== "원활").sort((a, b) => a.speed - b.speed);
  const risks       = [...wsData].filter(c => c.riskScore >= 40).sort((a, b) => b.riskScore - a.riskScore);
  const avgSpeed    = wsData.length ? Math.round(wsData.reduce((a, c) => a + c.speed, 0) / wsData.length) : 0;
  const isConn      = wsStatus === "연결됨";

  return (
    <div style={{ fontFamily: "'Noto Sans KR','Malgun Gothic',sans-serif", background: "#12100a", color: "#e2e8f0", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* 헤더 */}
      <div style={{ background: "#12100a", borderBottom: "1px solid #2a2418", padding: "0 22px", height: 56, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <button onClick={onGoMain} style={{ background: "#1a1710", border: "1px solid #2a2418", borderRadius: 2, padding: "5px 13px", color: "#aab4c8", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>← 대시보드</button>
        <button onClick={onGoCctv} style={{ background: "#1a1710", border: "1px solid #2a2418", borderRadius: 2, padding: "5px 13px", color: "#aab4c8", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>📷 CCTV 관제</button>
        <span style={{ fontSize: 20 }}>🚦</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#60a5fa" }}>실시간 교차로 지도</div>
          <div style={{ fontSize: 11, color: "#475569" }}>V2X 신호 · 위험도 · 혼잡 현황</div>
        </div>

        {/* 탭 버튼 */}
        <div style={{ marginLeft: 16, display: "flex", gap: 4, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 8, padding: 3 }}>
          {TABS.map(({ key, label }) => (
            <button key={key} onClick={() => setActiveTab(key)}
              style={{ padding: "4px 14px", borderRadius: 6, fontSize: 12, fontWeight: 600, border: "none", cursor: "pointer", fontFamily: "inherit", transition: "all .15s", background: activeTab === key ? "#1d4ed8" : "transparent", color: activeTab === key ? "#fff" : "#64748b" }}>
              {label}
            </button>
          ))}
        </div>

        {activeTab === "cctv" && selected && (
          <div style={{ fontSize: 12, color: "#60a5fa", background: "rgba(29,78,216,0.1)", border: "1px solid rgba(59,130,246,0.2)", borderRadius: 6, padding: "3px 10px" }}>
            📍 {selected.crsrdNm} 근처 CCTV
          </div>
        )}

        {/* 연결 상태 */}
        <div style={{ marginLeft: activeTab === "cctv" && selected ? 0 : 8, display: "flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 20, border: `1px solid ${isConn ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.3)"}`, background: isConn ? "rgba(34,197,94,0.07)" : "rgba(239,68,68,0.07)" }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: isConn ? "#22c55e" : "#ef4444", display: "inline-block" }} />
          <span style={{ fontSize: 12, color: isConn ? "#22c55e" : "#ef4444" }}>{wsStatus}</span>
        </div>
        {isConn && <div style={{ fontSize: 12, color: "#22c55e", border: "1px solid rgba(34,197,94,0.3)", padding: "2px 9px", borderRadius: 4, fontWeight: 600 }}>● LIVE · V2X</div>}

        {/* 날씨 + 시간 */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "4px 12px", background: "rgba(255,255,255,0.04)", borderRadius: 7, border: "1px solid rgba(255,255,255,0.06)", fontSize: 13 }}>
            <span>{WEATHER.icon}</span>
            <span style={{ color: "#94a3b8" }}>{WEATHER.desc}</span>
            <span style={{ fontWeight: 600 }}>{WEATHER.temp}</span>
            <span style={{ fontSize: 12, color: "#6b7280" }}>습도 {WEATHER.humidity}</span>
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>갱신: <span style={{ color: "#94a3b8" }}>{lastUpdate ? lastUpdate.toLocaleTimeString("ko-KR") : "-"}</span></div>
          <div style={{ fontSize: 13, color: "#9ca3af", fontFamily: "monospace", background: "rgba(255,255,255,0.04)", padding: "3px 9px", borderRadius: 5 }}>{time.toLocaleTimeString("ko-KR")}</div>
        </div>
      </div>

      {/* 메인 */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 360px", minHeight: 0 }}>

        {/* 좌측 */}
        <div style={{ display: "flex", flexDirection: "column", padding: "10px 6px 10px 10px", minHeight: 0 }}>

          {/* 실시간 지도 탭 */}
          {activeTab === "map" && (
            <div style={{ flex: 1, position: "relative", minHeight: 0, borderRadius: 11, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
              <KakaoMapView crossroads={wsData} selected={selected} onSelect={selectCr} initialCenter={initialCenter} onCctvClick={setSelectedCctv} />
              {wsData.length === 0 && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(7,12,23,0.75)", zIndex: 30, gap: 10 }}>
                  <div style={{ fontSize: 15, color: "#94a3b8" }}>V2X 데이터 수신 대기 중...</div>
                  <div style={{ fontSize: 13, color: "#475569" }}>스프링 부트 실행 확인 (port 8080)</div>
                </div>
              )}
              {/* 좌측 하단: 신호 현황 오버레이 */}
              {selected && (
                <div style={{ position: "absolute", bottom: 14, left: 14, display: "flex", flexDirection: "column", gap: 8, zIndex: 20, width: 340, pointerEvents: "auto" }}>
                  <div style={{ background: "rgba(18,16,10,0.75)", border: "1px solid rgba(42,36,24,0.8)", borderRadius: 4, padding: 14, backdropFilter: "blur(8px)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                      <div style={{ fontSize: 13, color: "#4ea6ff", fontWeight: 700 }}>📍 {selected.crsrdNm} — 실시간 신호 현황</div>
                      <button onClick={() => setShowRoadView(true)} style={{ background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.4)", borderRadius: 6, color: "#60a5fa", fontSize: 11, cursor: "pointer", padding: "3px 9px", fontFamily: "inherit" }}>🛣️ 로드뷰</button>
                    </div>
                    <SignalPanel cr={selected} />
                  </div>
                </div>
              )}
              {/* 우측 하단: AI 챗봇 오버레이 */}
              {selected && (
                <div style={{ position: "absolute", bottom: 14, right: 14, zIndex: 20, width: 320, pointerEvents: "auto" }}>
                  <AIChatBot selected={selected} />
                </div>
              )}
            </div>
          )}

          {/* CCTV 탭 */}
          {activeTab === "cctv" && (
            <div style={{ flex: 1, minHeight: 0, borderRadius: 11, border: "1px solid rgba(255,255,255,0.08)", background: "rgba(7,12,23,0.6)", padding: 14, overflowY: "auto" }}>
              <CctvPanel selected={selected} />
            </div>
          )}
        </div>

        {/* 우측 사이드바 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 10px 10px 4px", overflowY: "auto", background: "#12100a" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
            {[
              { label: "교차로 수",   value: wsData.length,                             suffix: "개",   color: "#4ea6ff" },
              { label: "위험 교차로", value: wsData.filter(c => c.riskScore >= 70).length, suffix: "개",   color: "#ff5566" },
              { label: "평균 속도",   value: avgSpeed,                                   suffix: "km/h", color: "#2ee07a" },
            ].map(s => (
              <div key={s.label} style={{ background: "#1a1710", border: "1px solid #2a2418", borderRadius: 2, padding: "12px 10px", textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: s.color, fontFamily: "monospace" }}>{s.value}<span style={{ fontSize: 13 }}>{s.suffix}</span></div>
                <div style={{ fontSize: 12, color: "#7a7a7a", marginTop: 3 }}>{s.label}</div>
              </div>
            ))}
          </div>
          <BottleneckList bottlenecks={bottlenecks} selected={selected} onSelect={selectCr} crossroadsCount={wsData.length} />
          <RiskList risks={risks} onSelect={selectCr} crossroadsCount={wsData.length} />
        </div>
      </div>

      {/* 모달 */}
      {showRoadView && selected && (
        <RoadViewModal cr={selected} onClose={() => setShowRoadView(false)} />
      )}
      {selectedCctv && (
        <CctvModal cctv={selectedCctv} onClose={() => setSelectedCctv(null)} />
      )}
    </div>
  );
}