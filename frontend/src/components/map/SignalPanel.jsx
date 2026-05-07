import { statusCls, riskColor } from "../../utils/signalUtils";

const H   = 90;   // 방향 박스 높이
const CW  = 108;  // 가운데 박스 너비
const GAP = 5;

function SignalBadge({ signal, label }) {
  if (!signal) return null;
  const cls = statusCls(signal.status);
  const color = cls === "green" ? "#22c55e" : cls === "red" ? "#ef4444" : "#6b7280";
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ fontSize: 11, color: "#94a3b8", width: 38, flexShrink: 0, whiteSpace: "nowrap" }}>{label}</span>
      <span style={{ fontSize: 12, fontWeight: 600, color, fontFamily: "monospace", whiteSpace: "nowrap" }}>
        {(signal.rmndCs / 10).toFixed(1)}s
      </span>
    </div>
  );
}

/* dir="ns" → 북/남 (가로 전체), dir="we" → 서/동 (flex:1) */
function DirBox({ dir, label, signals, fullWidth }) {
  const d = signals?.[dir];
  return (
    <div style={{
      height: H,
      ...(fullWidth ? { flex: 1 } : { flex: 1 }),
      boxSizing: "border-box",
      background: d ? "rgba(30,38,55,0.9)" : "rgba(20,26,40,0.3)",
      border: "1px solid rgba(255,255,255,0.07)",
      borderRadius: 8, padding: "8px 12px",
      opacity: d ? 1 : 0.35,
    }}>
      <div style={{ fontSize: 11, color: "#60a5fa", fontWeight: 700, marginBottom: 5 }}>{label}</div>
      {d ? (
        <>
          <SignalBadge signal={d.stsg} label="직진" />
          <SignalBadge signal={d.ltsg} label="좌회전" />
          <SignalBadge signal={d.pdsg} label="보행" />
        </>
      ) : (
        <div style={{ fontSize: 11, color: "#374151" }}>-</div>
      )}
    </div>
  );
}

export default function SignalPanel({ cr }) {
  const s = cr.mappedSignals || {};
  const t = cr.totDt;
  const ts = t ? `${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)} ${t.slice(8,10)}:${t.slice(10,12)}` : "-";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: GAP }}>
      <div style={{ fontSize: 11, color: "#475569" }}>API 수집: {ts}</div>

      {/* 행 1: 북 (전체 폭) */}
      <div style={{ display: "flex", height: H, gap: GAP }}>
        <DirBox dir="north" label="↑ 북" signals={s} />
      </div>

      {/* 행 2: 서 + 가운데 + 동 */}
      <div style={{ display: "flex", height: H, gap: GAP }}>
        <DirBox dir="west" label="← 서" signals={s} />
        <div style={{
          width: CW, minWidth: CW, height: H, boxSizing: "border-box",
          background: "rgba(15,22,36,0.95)", border: "1px solid #1d4ed8", borderRadius: 10,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          padding: "6px", textAlign: "center", gap: 3, flexShrink: 0,
        }}>
          <div style={{ fontSize: 10, color: "#60a5fa", fontWeight: 700, lineHeight: 1.3, wordBreak: "keep-all" }}>{cr.crsrdNm}</div>
          <div style={{ width: 34, height: 34, flexShrink: 0, borderRadius: "50%", background: `conic-gradient(${riskColor(cr.riskScore)} ${cr.riskScore}%,#1f2937 0)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ width: 26, height: 26, borderRadius: "50%", background: "#0f1624", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: riskColor(cr.riskScore) }}>{cr.riskScore}</div>
          </div>
          <div style={{ fontSize: 9, color: "#6b7280" }}>위험도</div>
        </div>
        <DirBox dir="east" label="→ 동" signals={s} />
      </div>

      {/* 행 3: 남 (전체 폭) */}
      <div style={{ display: "flex", height: H, gap: GAP }}>
        <DirBox dir="south" label="↓ 남" signals={s} />
      </div>
    </div>
  );
}
