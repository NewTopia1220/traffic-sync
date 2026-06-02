function speedColor(speed) {
  if (!Number.isFinite(speed) || speed < 20) return "#ff5566";
  if (speed < 40) return "#ffaa33";
  return "#2ee07a";
}

export default function BottleneckList({ bottlenecks, selected, onSelect, crossroadsCount }) {
  return (
    <div style={{ background: "#1a1710", border: "1px solid #2a2418", borderRadius: 2, padding: "14px 16px" }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 10, color: "#e7ecf5" }}>
        실시간 병목 현황
      </div>

      {bottlenecks.length === 0 ? (
        <div style={{ fontSize: 13, color: "#3a3a3a", textAlign: "center", padding: "10px 0" }}>
          {crossroadsCount === 0 ? "수신 대기 중..." : "병목 없음 ✓"}
        </div>
      ) : (
        bottlenecks.map(cr => {
          const isSelected = selected?.crsrdId === cr.crsrdId;
          const speed = Number.isFinite(cr.speed) ? cr.speed : "-";
          const color = speedColor(cr.speed);
          return (
            <div
              key={cr.crsrdId}
              onClick={() => onSelect(cr)}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "9px 10px", borderRadius: 2, marginBottom: 6,
                background: isSelected ? `${color}14` : "transparent",
                border: `1px solid ${isSelected ? `${color}72` : "#2a2418"}`,
                cursor: "pointer",
              }}
              onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = "#2a2418"; }}
              onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = "transparent"; }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, color: "#e7ecf5", fontWeight: 700, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 190 }}>
                    {cr.crsrdNm}
                  </div>
                  <div style={{ fontSize: 11, color: "#7a7a7a", marginTop: 2 }}>
                    위험도 수집 대기
                  </div>
                </div>
              </div>

              <div style={{ textAlign: "right", flexShrink: 0 }}>
                <div style={{ fontSize: 14, color: color, fontWeight: 800, fontFamily: "monospace" }}>
                  {speed}<span style={{ fontSize: 11 }}>km/h</span>
                </div>
                <div style={{ fontSize: 11, color: "#7a7a7a", marginTop: 2 }}>
                  {cr.congestion || "혼잡"}
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
