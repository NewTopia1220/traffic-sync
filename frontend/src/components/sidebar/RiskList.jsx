import { riskColor, riskLabel } from "../../utils/signalUtils";

export default function RiskList({ risks, onSelect, crossroadsCount }) {
  const panel = { background: "rgba(14,20,36,0.9)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 10, padding: "14px 16px" };
  return (
    <div style={panel}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>⚠️ <span style={{ color: "#fbbf24" }}>사고 위험 도로</span></div>
      {risks.length === 0
        ? <div style={{ fontSize: 13, color: "#374151", textAlign: "center", padding: "10px 0" }}>{crossroadsCount === 0 ? "수신 대기 중..." : "위험 없음 ✓"}</div>
        : risks.map(cr => (
          <div key={cr.crsrdId} onClick={() => onSelect(cr)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 8, marginBottom: 6, background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.05)", cursor: "pointer", transition: "all .15s" }}
            onMouseEnter={e => e.currentTarget.style.background = "rgba(239,68,68,0.05)"}
            onMouseLeave={e => e.currentTarget.style.background = "rgba(255,255,255,0.02)"}
          >
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 4, background: riskColor(cr.riskScore) + "22", color: riskColor(cr.riskScore), marginRight: 8 }}>{riskLabel(cr.riskScore)} {cr.riskScore}점</span>
              <span style={{ fontSize: 13 }}>{cr.crsrdNm}</span>
            </div>
            <div style={{ width: 52, height: 5, borderRadius: 3, background: "#1e293b", overflow: "hidden" }}>
              <div style={{ width: `${cr.riskScore}%`, height: "100%", background: riskColor(cr.riskScore), borderRadius: 3 }} />
            </div>
          </div>
        ))
      }
    </div>
  );
}
