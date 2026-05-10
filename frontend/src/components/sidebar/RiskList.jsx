import { riskColor, riskLabel } from "../../utils/signalUtils";

export default function RiskList({ risks, onSelect, crossroadsCount }) {
  return (
    <div style={{ background: "#1a1710", border: "1px solid #2a2418", borderRadius: 2, padding: "14px 16px" }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "#e7ecf5" }}>
        ⚠️ <span style={{ color: "#ffaa33" }}>사고 위험 도로</span>
      </div>
      {risks.length === 0
        ? <div style={{ fontSize: 13, color: "#3a3a3a", textAlign: "center", padding: "10px 0" }}>{crossroadsCount === 0 ? "수신 대기 중..." : "위험 없음 ✓"}</div>
        : risks.map(cr => (
          <div key={cr.crsrdId} onClick={() => onSelect(cr)}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 10px", borderRadius: 2, marginBottom: 6,
              background: "transparent", border: "1px solid #2a2418", cursor: "pointer" }}
            onMouseEnter={e => e.currentTarget.style.background = "#2a2418"}
            onMouseLeave={e => e.currentTarget.style.background = "transparent"}
          >
            <div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "2px 7px", borderRadius: 2,
                background: riskColor(cr.riskScore) + "22", color: riskColor(cr.riskScore), marginRight: 8 }}>
                {riskLabel(cr.riskScore)} {cr.riskScore}점
              </span>
              <span style={{ fontSize: 13, color: "#e7ecf5" }}>{cr.crsrdNm}</span>
            </div>
            <div style={{ width: 52, height: 4, borderRadius: 2, background: "#1a1a1a", overflow: "hidden" }}>
              <div style={{ width: `${cr.riskScore}%`, height: "100%", background: riskColor(cr.riskScore) }} />
            </div>
          </div>
        ))
      }
    </div>
  );
}
