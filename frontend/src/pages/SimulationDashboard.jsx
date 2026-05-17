import { useState, useEffect } from "react";
import SimulationMapView from "../components/map/SimulationMapView";
import SignalSimPanel from "../components/map/SignalSimPanel";

export default function SimulationDashboard({ onGoMain, onGoMap }) {
  const [selected,  setSelected]  = useState(null);
  const [time,      setTime]      = useState(new Date());
  const [phaseIdx,  setPhaseIdx]  = useState(null);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ fontFamily: "'Noto Sans KR','Malgun Gothic',sans-serif", background: "#12100a", color: "#e2e8f0", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* 헤더 */}
      <div style={{ background: "#12100a", borderBottom: "1px solid #2a2418", padding: "0 22px", height: 56, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <button onClick={onGoMain} style={{ background: "#1a1710", border: "1px solid #2a2418", borderRadius: 2, padding: "5px 13px", color: "#aab4c8", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>← 대시보드</button>
        <button onClick={onGoMap} style={{ background: "#1a1710", border: "1px solid #2a2418", borderRadius: 2, padding: "5px 13px", color: "#aab4c8", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>🗺️ 실시간 지도</button>
        <span style={{ fontSize: 20 }}>🚦</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#60a5fa" }}>신호 시뮬레이션 3D</div>
          <div style={{ fontSize: 11, color: "#475569" }}>교차로 클릭 → 실시간 신호 + 3D 차량 확인</div>
        </div>
        <div style={{ marginLeft: "auto", fontSize: 13, color: "#9ca3af", fontFamily: "monospace", background: "rgba(255,255,255,0.04)", padding: "3px 9px", borderRadius: 5 }}>
          {time.toLocaleTimeString("ko-KR")}
        </div>
      </div>

      {/* 메인 */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 380px", minHeight: 0 }}>

        {/* 3D 지도 */}
        <div style={{ padding: "10px 6px 10px 10px", minHeight: 0 }}>
          <div style={{ height: "100%", borderRadius: 11, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
            <SimulationMapView
              selected={selected}
              onSelect={setSelected}
              phaseIdx={phaseIdx}
            />
          </div>
        </div>

        {/* 사이드바 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 10px 10px 4px", overflowY: "auto" }}>

          {/* 선택된 교차로 신호 패널 */}
          <div style={{ background: "#1a1710", border: "1px solid #2a2418", borderRadius: 6, padding: 16, flex: 1 }}>
            {selected ? (
              <SignalSimPanel
                intNo={selected.intNo}
                intNm={selected.intNm}
                onPhaseChange={setPhaseIdx}
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100%", gap: 12, color: "#475569" }}>
                <div style={{ fontSize: 36 }}>🚦</div>
                <div style={{ fontSize: 14, color: "#64748b" }}>교차로를 클릭하세요</div>
                <div style={{ fontSize: 12, color: "#374151" }}>지도에서 파란 마커를 클릭하면</div>
                <div style={{ fontSize: 12, color: "#374151" }}>실시간 신호 현시를 확인할 수 있습니다</div>
              </div>
            )}
          </div>

          {/* 안내 */}
          <div style={{ background: "#1a1710", border: "1px solid #2a2418", borderRadius: 6, padding: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 8 }}>📖 사용 방법</div>
            {[
              "지도에서 🔵 파란 마커 클릭",
              "현재 시각 기준 신호 현시 자동 계산",
              "방향별 신호등 실시간 확인",
              "3D 차량이 신호에 맞춰 이동",
            ].map((t, i) => (
              <div key={i} style={{ fontSize: 11, color: "#64748b", marginBottom: 4, display: "flex", gap: 6 }}>
                <span style={{ color: "#3b82f6" }}>{i + 1}.</span> {t}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
