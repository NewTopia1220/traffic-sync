import { statusCls, riskColor } from "../../utils/signalUtils";

function SignalBadge({ signal, label }) {
  if (!signal) return null;
  const cls = statusCls(signal.status);
  const color = cls === "green" ? "#22c55e" : cls === "red" ? "#ef4444" : "#6b7280";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
      <div style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0, boxShadow: `0 0 5px ${color}` }} />
      <span style={{ fontSize: 12, color: "#94a3b8", width: 36 }}>{label}</span>
      <span style={{ fontSize: 13, fontWeight: 600, color, fontFamily: "monospace" }}>{(signal.rmndCs / 10).toFixed(1)}s</span>
    </div>
  );
}

function DirBox({ dir, label, signals }) {
  const d = signals?.[dir];
  return (
    <div style={{ background: d ? "rgba(30,38,55,0.9)" : "rgba(20,26,40,0.4)", border: "1px solid rgba(255,255,255,0.07)", borderRadius: 8, padding: "9px 11px", minWidth: 88, opacity: d ? 1 : 0.4 }}>
      <div style={{ fontSize: 11, color: "#60a5fa", fontWeight: 700, marginBottom: 6 }}>{label}</div>
      {d
        ? (<><SignalBadge signal={d.stsg} label="직진" /><SignalBadge signal={d.ltsg} label="좌회전" /><SignalBadge signal={d.pdsg} label="보행" /></>)
        : <div style={{ fontSize: 11, color: "#374151" }}>-</div>
      }
    </div>
  );
}

export default function SignalPanel({ cr }) {
  const s = cr.mappedSignals || {};
  const t = cr.totDt;
  const ts = t ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)} ${t.slice(8, 10)}:${t.slice(10, 12)}` : "-";
  return (
    <div>
      <div style={{ fontSize: 11, color: "#475569", marginBottom: 8 }}>API 수집: {ts}</div>
      <div style={{ display: "grid", gridTemplateAreas: '". north ." "west center east" ". south ."', gridTemplateColumns: "1fr 116px 1fr", gap: 6 }}>
        <div style={{ gridArea: "north" }}><DirBox dir="north" label="↑ 북" signals={s} /></div>
        <div style={{ gridArea: "west" }}><DirBox dir="west" label="← 서" signals={s} /></div>
        <div style={{
          gridArea: "center", background: "rgba(15,22,36,0.95)", border: "1px solid #1d4ed8", borderRadius: 10,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "10px 6px", textAlign: "center",
        }}>
          <div style={{ fontSize: 11, color: "#60a5fa", fontWeight: 700, lineHeight: 1.4 }}>{cr.crsrdNm}</div>
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 3 }}>{cr.crsrdId}</div>
          <div style={{ marginTop: 8, width: 34, height: 34, borderRadius: "50%", background: `conic-gradient(${riskColor(cr.riskScore)} ${cr.riskScore}%,#1f2937 0)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#0f1624", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: riskColor(cr.riskScore) }}>{cr.riskScore}</div>
          </div>
        </div>
        <div style={{ gridArea: "east" }}><DirBox dir="east" label="→ 동" signals={s} /></div>
        <div style={{ gridArea: "south" }}><DirBox dir="south" label="↓ 남" signals={s} /></div>
      </div>
    </div>
  );
}
