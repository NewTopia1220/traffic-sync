import { useState, useEffect, useCallback } from "react";
import KakaoMapView from "../components/map/KakaoMapView";
import SignalPanel from "../components/map/SignalPanel";
import RoadViewModal from "../components/map/RoadViewModal";
import CctvModal from "../components/map/CctvModal";
import BottleneckList from "../components/sidebar/BottleneckList";
import RiskList from "../components/sidebar/RiskList";
import AIChatBot from "../components/sidebar/AIChatBot";
import { riskGradeValue } from "../utils/signalUtils";
import AppHeader from "../components/common/AppHeader";


const WEATHER = { icon: "🌤️", temp: "21°C", desc: "맑음", humidity: "65%" };
const TABS = [
  { key: "map",  label: "🗺️ 실시간 지도" }
];

const CHAT_W = 480;

export default function MapDashboard({ onGoMain, onGoCctv, onGoNews, onGoSimulation, onGoMyPage, onLogout, selectedGu, wsData, setWsData, initialCenter, wsStatus, lastUpdate, stations = [] }) {
  const [time,         setTime]         = useState(new Date());
  const [selected,     setSelected]     = useState(null);
  const [activeTab,    setActiveTab]    = useState("map");
  const [showRoadView, setShowRoadView] = useState(false);
  const [selectedCctv, setSelectedCctv] = useState(null);
  const [chatOpen,     setChatOpen]     = useState(false);
  const [signalPanelOpen, setSignalPanelOpen] = useState(true);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setSelected(prev => {
      if (!prev && wsData.length > 0 && signalPanelOpen) return wsData[0];
      if (prev) return wsData.find(c => c.crsrdId === prev.crsrdId) || prev;
      return prev;
    });
  }, [wsData, signalPanelOpen]);

  const selectCr = useCallback(cr => {
    setSelected(cr);
    setSignalPanelOpen(true);
    setActiveTab("map");
  }, []);

  const riskRank = c => {
    const grade = riskGradeValue(c.riskGrade);
    const score = Number.isFinite(c.riskScore) ? c.riskScore : -1;
    return grade == null ? -1 : grade * 100000 + score;
  };
  const isHighRisk = c => (riskGradeValue(c.riskGrade) ?? 0) >= 3;

  const bottlenecks = [...wsData]
    .filter(c => c.congestion === "혼잡" || c.congestion === "서행")
    .sort((a, b) => (a.speed ?? Number.MAX_SAFE_INTEGER) - (b.speed ?? Number.MAX_SAFE_INTEGER));
  const risks       = [...wsData].filter(isHighRisk).sort((a, b) => riskRank(b) - riskRank(a));
  const validSpeeds = wsData.map(c => c.speed).filter(Number.isFinite);
  const avgSpeed    = validSpeeds.length ? Math.round(validSpeeds.reduce((a, v) => a + v, 0) / validSpeeds.length) : "—";
  const isConn      = wsStatus === "연결됨";

  return (
    <div style={{ fontFamily: "'Noto Sans KR','Malgun Gothic',sans-serif", background: "#12100a", color: "#e2e8f0", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* 공통 헤더 */}
      <AppHeader
        activePage="map"
        selectedGu={selectedGu}
        statusText={isConn ? "LIVE · V2X 연결됨" : wsStatus}
        statusLive={isConn}
        onGoMain={onGoMain}
        onGoMap={() => {}}
        onGoNews={onGoNews}
        onGoCctv={onGoCctv}
        onGoSimulation={onGoSimulation}
        onGoMyPage={onGoMyPage}
        onLogout={onLogout}
        rightExtra={(
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: "#7a7a7a" }}>
            갱신: <span style={{ color: "#aab4c8" }}>{lastUpdate ? lastUpdate.toLocaleTimeString("ko-KR") : "-"}</span>
          </span>
        )}
      />
{/* 메인 — chatOpen 시 그리드에 챗봇 컬럼 추가 */}
      <div style={{
        flex: 1, display: "grid",
        gridTemplateColumns: chatOpen ? `1fr 360px ${CHAT_W}px` : "1fr 360px",
        minHeight: 0,
        transition: "grid-template-columns .28s ease",
      }}>

        {/* 좌측 — 지도 */}
        <div style={{ display: "flex", flexDirection: "column", padding: "10px 6px 10px 10px", minHeight: 0 }}>

          {activeTab === "map" && (
            <div style={{ flex: 1, position: "relative", minHeight: 0, borderRadius: 11, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
              <KakaoMapView crossroads={wsData} selected={selected} onSelect={selectCr} initialCenter={initialCenter} selectedGu={selectedGu} onCctvClick={setSelectedCctv} stations={stations} onStationSelect={(id) => { console.log("지도에서 선택된 지점 ID:", id); }} />

              {wsData.length === 0 && (
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "rgba(7,12,23,0.75)", zIndex: 30, gap: 10 }}>
                  <div style={{ fontSize: 15, color: "#94a3b8" }}>V2X 데이터 수신 대기 중...</div>
                  <div style={{ fontSize: 13, color: "#475569" }}>스프링 부트 실행 확인 (port 8080)</div>
                </div>
              )}

              {/* AI 챗봇 토글 버튼 — 우하단 오버레이 */}
              <div style={{ position: "absolute", bottom: 14, right: 14, zIndex: 20 }}>
                <button
                  onClick={() => setChatOpen(o => !o)}
                  title={chatOpen ? "AI 챗봇 닫기" : "AI 교통 어시스턴트 열기"}
                  style={{
                    width: 54, height: 54,
                    borderRadius: "50%",
                    background: chatOpen
                      ? "linear-gradient(135deg, rgba(96,165,250,0.95), rgba(168,85,247,0.95))"
                      : "linear-gradient(135deg, rgba(30,41,59,0.96), rgba(59,130,246,0.9))",
                    border: `2px solid ${chatOpen ? "rgba(255,255,255,0.38)" : "rgba(147,197,253,0.55)"}`,
                    backdropFilter: "blur(12px)",
                    WebkitBackdropFilter: "blur(12px)",
                    cursor: "pointer",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    boxShadow: "0 4px 18px rgba(0,0,0,0.62), 0 0 16px rgba(96,165,250,0.28)",
                    transition: "all .2s",
                  }}
                >
                  {chatOpen
                    ? <span style={{ fontSize: 16, color: "rgba(255,255,255,0.55)" }}>✕</span>
                    : <span style={{ fontSize: 25, lineHeight: 1 }}>🤖</span>
                  }
                </button>
              </div>

              {/* 좌측 하단: 신호 현황 오버레이 */}
              {selected && signalPanelOpen && (
                <div style={{ position: "absolute", bottom: 14, left: 14, display: "flex", flexDirection: "column", gap: 8, zIndex: 20, width: 460, maxWidth: "calc(100% - 28px)", pointerEvents: "auto" }}>
                  <div style={{ background: "rgba(18,16,10,0.75)", border: "1px solid rgba(42,36,24,0.8)", borderRadius: 10, padding: 16, backdropFilter: "blur(8px)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10, gap: 8 }}>
                      <div style={{ fontSize: 17, color: "#4ea6ff", fontWeight: 800, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{selected.crsrdNm}</div>
                      <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                        <button onClick={() => setShowRoadView(true)} style={{ background: "rgba(96,165,250,0.15)", border: "1px solid rgba(96,165,250,0.4)", borderRadius: 6, color: "#60a5fa", fontSize: 12, cursor: "pointer", padding: "5px 11px", fontFamily: "inherit" }}>로드뷰</button>
                        <button
                          onClick={() => { setSignalPanelOpen(false); setSelected(null); }}
                          title="신호 현황 닫기"
                          style={{
                            width: 28, height: 28, borderRadius: 6,
                            background: "rgba(255,255,255,0.06)",
                            border: "1px solid rgba(255,255,255,0.14)",
                            color: "#cbd5e1", cursor: "pointer", fontSize: 16,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            fontFamily: "inherit", lineHeight: 1,
                          }}
                        >×</button>
                      </div>
                    </div>
                    <SignalPanel cr={selected} />
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* 우측 사이드바 — 항상 표시 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 10px 10px 4px", overflowY: "auto", background: "#12100a" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 6 }}>
            {[
              { label: "교차로 수",   value: wsData.length,                    suffix: "개",   color: "#4ea6ff" },
              { label: "위험 교차로", value: wsData.filter(isHighRisk).length,  suffix: "개",   color: "#ff5566" },
              { label: "평균 속도",   value: avgSpeed,                          suffix: "km/h", color: "#2ee07a" },
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

        {/* 챗봇 패널 — chatOpen일 때만 그리드 컬럼에 렌더링 */}
        {chatOpen && (
          <AIChatBot
            selected={selected}
            onClose={() => setChatOpen(false)}
          />
        )}
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
