import { useState, useEffect } from "react";
import { statusCls, riskColor } from "../../utils/signalUtils";

const DIR_LABELS = [
  { dir: "north", label: "북", arrow: "↑" },
  { dir: "east",  label: "동", arrow: "→" },
  { dir: "south", label: "남", arrow: "↓" },
  { dir: "west",  label: "서", arrow: "←" },
];

const SIGNAL_TYPES = [
  { key: "stsg", label: "직진" },
  { key: "ltsg", label: "좌회전" },
  { key: "pdsg", label: "보행" },
];

function TrafficLight({ status, rmndCs, elapsed }) {
  const cls = statusCls(status);
  const isGreen = cls === "green";
  const isRed = cls === "red";
  const remaining = rmndCs != null ? Math.max(0, rmndCs / 10 - elapsed) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      {/* 신호등 하우징 */}
      <div style={{
        background: "#111", border: "2px solid #333", borderRadius: 8,
        padding: "6px 0", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 28,
      }}>
        {/* 빨간불 */}
        <div style={{
          width: 18, height: 18, borderRadius: "50%",
          background: isRed ? "#ef4444" : "#3f1010",
          boxShadow: isRed ? "0 0 8px #ef4444" : "none",
          transition: "all 0.3s",
        }} />
        {/* 노란불 (대기 중간) */}
        <div style={{
          width: 18, height: 18, borderRadius: "50%",
          background: (!isRed && !isGreen) ? "#f59e0b" : "#3f3010",
          boxShadow: (!isRed && !isGreen) ? "0 0 8px #f59e0b" : "none",
          transition: "all 0.3s",
        }} />
        {/* 초록불 */}
        <div style={{
          width: 18, height: 18, borderRadius: "50%",
          background: isGreen ? "#22c55e" : "#0a2810",
          boxShadow: isGreen ? "0 0 8px #22c55e" : "none",
          transition: "all 0.3s",
        }} />
      </div>
      {/* 남은 시간 */}
      {remaining != null && (
        <div style={{
          fontSize: 14, fontWeight: 700, fontFamily: "monospace",
          color: isGreen ? "#22c55e" : isRed ? "#ef4444" : "#6b7280",
        }}>
          {remaining.toFixed(1)}s
        </div>
      )}
    </div>
  );
}

function DirCard({ dir, label, arrow, signals, elapsed }) {
  const d = signals?.[dir];
  if (!d) return null; // 데이터 없는 방향은 아예 렌더링 안 함

  const activeSigs = SIGNAL_TYPES.filter(({ key }) => !!d[key]);

  return (
    <div style={{
      background: "rgba(18,16,10,0.75)",
      border: "1px solid rgba(42,36,24,0.8)",
      borderRadius: 4, padding: "12px 10px",
      display: "flex", flexDirection: "column", alignItems: "center", gap: 8,
      flex: 1,
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: "#4ea6ff" }}>
        {arrow} {label}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start" }}>
        {activeSigs.map(({ key, label: sLabel }) => {
          const sig = d[key];
          return (
            <div key={key} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
              <TrafficLight status={sig.status} rmndCs={sig.rmndCs} elapsed={elapsed} />
              <div style={{ fontSize: 12, color: "#6b7280" }}>{sLabel}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function SignalPanel({ cr }) {
  const [elapsed, setElapsed] = useState(0);
  const s = cr.mappedSignals || {};
  const t = cr.totDt;
  const ts = t ? `${t.slice(0,4)}-${t.slice(4,6)}-${t.slice(6,8)} ${t.slice(8,10)}:${t.slice(10,12)}` : "-";

  useEffect(() => {
    setElapsed(0);
    const id = setInterval(() => setElapsed(e => e + 0.1), 100);
    return () => clearInterval(id);
  }, [cr.totDt]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 13, color: "#475569" }}>API 수집: {ts}</div>

      {/* 북 / 북동 / 북서 */}
      {(s.north || s.northeast || s.northwest) && <div style={{ display: "flex", gap: 6 }}>
        {s.northwest && <DirCard dir="northwest" label="북서" arrow="↖" signals={s} elapsed={elapsed} />}
        {s.north && <DirCard dir="north" label="북" arrow="↑" signals={s} elapsed={elapsed} />}
        {s.northeast && <DirCard dir="northeast" label="북동" arrow="↗" signals={s} elapsed={elapsed} />}
      </div>}

      {/* 서 + 교차로명 + 동 */}
      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
        <DirCard dir="west" label="서" arrow="←" signals={s} elapsed={elapsed} />
        <div style={{
          width: 90, minWidth: 90, height: 90, flexShrink: 0,
          background: "rgba(18,16,10,0.75)", border: "1px solid rgba(42,36,24,0.8)",
          borderRadius: 4, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", gap: 4, padding: 4,
        }}>
          <div style={{ fontSize: 12, color: "#60a5fa", fontWeight: 700, textAlign: "center", wordBreak: "keep-all", lineHeight: 1.3 }}>
            {cr.crsrdNm}
          </div>
          <div style={{
            width: 38, height: 38, borderRadius: "50%",
            background: `conic-gradient(${riskColor(cr.riskScore)} ${cr.riskScore}%, #1f2937 0)`,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            <div style={{
              width: 28, height: 28, borderRadius: "50%", background: "rgba(0,0,0,0.82)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 13, fontWeight: 700, color: riskColor(cr.riskScore),
            }}>{cr.riskScore}</div>
          </div>
        </div>
        <DirCard dir="east" label="동" arrow="→" signals={s} elapsed={elapsed} />
      </div>

      {/* 남 / 남동 / 남서 */}
      {(s.south || s.southeast || s.southwest) && <div style={{ display: "flex", gap: 6 }}>
        {s.southwest && <DirCard dir="southwest" label="남서" arrow="↙" signals={s} elapsed={elapsed} />}
        {s.south && <DirCard dir="south" label="남" arrow="↓" signals={s} elapsed={elapsed} />}
        {s.southeast && <DirCard dir="southeast" label="남동" arrow="↘" signals={s} elapsed={elapsed} />}
      </div>}
    </div>
  );
}