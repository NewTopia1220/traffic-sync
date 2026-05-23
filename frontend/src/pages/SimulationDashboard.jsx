import { useState, useEffect } from "react";
import SimulationMapView from "../components/map/SimulationMapView";
import SignalSimPanel from "../components/map/SignalSimPanel";

export default function SimulationDashboard({ onGoMain, onGoMap }) {
  const [selected,    setSelected]    = useState(null);
  const [time,        setTime]        = useState(new Date());
  const [phaseIdx,    setPhaseIdx]    = useState(null);
  // AI 최적화 결과 (null=before, object=after)
  const [aiOptResult, setAiOptResult] = useState(null);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // 교차로 바뀌면 AI 결과 초기화
  const handleSelect = (cr) => {
    setSelected(cr);
    setAiOptResult(null);
  };

  // AI 최적화 결과 수신 → SimulationMapView에 전달
  const handleOptimized = (result) => {
    setAiOptResult(result);
  };

  const isAfterMode = !!aiOptResult && aiOptResult.status === "optimized";

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

        {/* Before / After 모드 배지 */}
        {selected && (
          <div style={{
            marginLeft: 16,
            display: "flex", alignItems: "center", gap: 6,
            padding: "4px 14px", borderRadius: 20,
            background: isAfterMode ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${isAfterMode ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.2)"}`,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: isAfterMode ? "#22c55e" : "#ef4444", display: "inline-block", boxShadow: isAfterMode ? "0 0 6px #22c55e" : "none" }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: isAfterMode ? "#22c55e" : "#ef4444" }}>
              {isAfterMode ? "AI 최적화 적용 중" : "현행 신호 운영"}
            </span>
          </div>
        )}

        <div style={{ marginLeft: "auto", fontSize: 13, color: "#9ca3af", fontFamily: "monospace", background: "rgba(255,255,255,0.04)", padding: "3px 9px", borderRadius: 5 }}>
          {time.toLocaleTimeString("ko-KR")}
        </div>
      </div>

      {/* 메인 */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 400px", minHeight: 0 }}>

        {/* 3D 지도 */}
        <div style={{ padding: "10px 6px 10px 10px", minHeight: 0 }}>
          <div style={{
            height: "100%", borderRadius: 11, overflow: "hidden",
            border: `1px solid ${isAfterMode ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.08)"}`,
            boxShadow: isAfterMode ? "0 0 20px rgba(34,197,94,0.1)" : "none",
            transition: "border-color 0.5s, box-shadow 0.5s",
          }}>
            <SimulationMapView
              selected={selected}
              onSelect={handleSelect}
              phaseIdx={phaseIdx}
              isOptimized={isAfterMode}  // After 모드 전달 → 차량 속도 빠르게
            />
          </div>
        </div>

        {/* 사이드바 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 10px 10px 4px", overflowY: "auto" }}>

          {/* 선택된 교차로 신호 패널 */}
          <div style={{ background: "#1a1710", border: "1px solid #2a2418", borderRadius: 6, padding: 16, flex: 1, minHeight: 0, overflowY: "auto" }}>
            {selected ? (
              <SignalSimPanel
                intNo={selected.intNo}
                intNm={selected.intNm}
                onPhaseChange={setPhaseIdx}
                onOptimized={handleOptimized}
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
          <div style={{ background: "#1a1710", border: "1px solid #2a2418", borderRadius: 6, padding: 14, flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 8 }}>📖 사용 방법</div>
            {[
              "지도에서 🔵 파란 마커 클릭",
              "현재 시각 기준 신호 현시 자동 계산",
              "방향별 신호등 실시간 확인",
              "🤖 AI 신호 최적화 버튼 클릭",
              "Before / After 신호 비교 확인",
            ].map((t, i) => (
              <div key={i} style={{ fontSize: 11, color: "#64748b", marginBottom: 4, display: "flex", gap: 6 }}>
                <span style={{ color: i >= 3 ? "#22c55e" : "#3b82f6" }}>{i + 1}.</span> {t}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}