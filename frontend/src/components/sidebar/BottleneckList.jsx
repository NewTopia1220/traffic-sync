import { congColor } from "../../utils/signalUtils";

export default function BottleneckList({ bottlenecks, selected, onSelect, crossroadsCount }) {
  const panel = { background: "rgba(14,20,36,0.9)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "14px 16px" };
  return (
    <div style={panel}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>🚗 실시간 병목 현황</div>
      {bottlenecks.length === 0
        ? <div style={{ fontSize: 13, color: "#374151", textAlign: "center", padding: "10px 0" }}>{crossroadsCount === 0 ? "수신 대기 중..." : "정체 없음 ✓"}</div>
        : bottlenecks.map(cr => (
          <div key={cr.crsrdId} onClick={() => onSelect(cr)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, marginBottom: 6, background: selected?.crsrdId === cr.crsrdId ? "rgba(29,78,216,0.15)" : "rgba(255,255,255,0.02)", border: `1px solid ${selected?.crsrdId === cr.crsrdId ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.05)"}`, cursor: "pointer", transition: "all .15s" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <div style={{ width: 9, height: 9, borderRadius: "50%", background: congColor(cr.congestion), flexShrink: 0 }} />
              <div>
                <div style={{ fontSize: 13, fontWeight: 600 }}>{cr.crsrdNm}</div>
                <div style={{ fontSize: 11, color: "#6b7280", marginTop: 1 }}>위험도 {cr.riskScore}점</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: congColor(cr.congestion) }}>{cr.speed}km/h</div>
              <div style={{ fontSize: 11, color: "#6b7280" }}>{cr.congestion}</div>
            </div>
          </div>
        ))
      }
    </div>
  );
}
