import { congColor } from "../../utils/signalUtils";

export default function BottleneckList({ bottlenecks, selected, onSelect, crossroadsCount }) {
  return (
    <div style={{ background: "#1a1710", border: "1px solid #2a2418", borderRadius: 2, padding: "14px 16px" }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "#e7ecf5" }}>🚗 실시간 병목 현황</div>
      {bottlenecks.length === 0
        ? <div style={{ fontSize: 13, color: "#3a3a3a", textAlign: "center", padding: "10px 0" }}>{crossroadsCount === 0 ? "수신 대기 중..." : "정체 없음 ✓"}</div>
        : bottlenecks.map(cr => (
          <div key={cr.crsrdId} onClick={() => onSelect(cr)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 2, marginBottom: 6,
              background: selected?.crsrdId === cr.crsrdId ? "#2a2418" : "transparent",
              border: `1px solid ${selected?.crsrdId === cr.crsrdId ? "#3a3020" : "#2a2418"}`,
              boxShadow: selected?.crsrdId === cr.crsrdId ? `inset 2px 0 0 ${congColor(cr.congestion)}` : "none",
              cursor: "pointer" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: congColor(cr.congestion), flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: "#e7ecf5" }}>{cr.crsrdNm}</div>
                <div style={{ fontSize: 11, color: "#7a7a7a", marginTop: 1 }}>위험도 {cr.riskScore}점</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: congColor(cr.congestion), fontFamily: "monospace" }}>{cr.speed}km/h</div>
              <div style={{ fontSize: 11, color: "#7a7a7a" }}>{cr.congestion}</div>
            </div>
          </div>
        ))
      }
    </div>
  );
}
