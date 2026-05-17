import { useState, useEffect } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

// 방위각 → 방향 이름
function degToDir(deg) {
  const d = ((deg % 360) + 360) % 360;
  if (d >= 337.5 || d < 22.5)  return "북";
  if (d < 67.5)                 return "북동";
  if (d < 112.5)                return "동";
  if (d < 157.5)                return "남동";
  if (d < 202.5)                return "남";
  if (d < 247.5)                return "남서";
  if (d < 292.5)                return "서";
  return "북서";
}

// 현시코드 파싱: "S159341" → { type:"직진", from:"남", to:"북" }
function parsePhaseCode(code) {
  if (!code || code.length < 7) return null;
  const typeMap = { S: "직진", L: "좌회전", P: "보행자" };
  const type = typeMap[code[0]] || code[0];
  const from = degToDir(parseInt(code.slice(1, 4)));
  const to   = degToDir(parseInt(code.slice(4, 7)));
  return { type, from, to, raw: code };
}

// 현재 시각 기준으로 현재 현시 번호(1-based) 계산
function getCurrentPhaseIndex(plans, now) {
  if (!plans || plans.length === 0) return null;

  const hh = now.getHours();
  const mi = now.getMinutes();
  const nowMin = hh * 60 + mi;

  // 현재 시간대 플랜 찾기 (가장 최근 시작 플랜)
  const sorted = [...plans].sort((a, b) => {
    const aMin = parseInt(a.operHh) * 60 + parseInt(a.operMi);
    const bMin = parseInt(b.operHh) * 60 + parseInt(b.operMi);
    return aMin - bMin;
  });

  // planNo별로 그룹핑
  const planGroups = {};
  sorted.forEach(p => {
    if (!planGroups[p.planNo]) planGroups[p.planNo] = [];
    planGroups[p.planNo].push(p);
  });

  // 현재 시간에 해당하는 planNo 찾기 (각 planNo의 첫 번째 행 기준)
  let currentPlanNo = null;
  let latestStartMin = -1;
  Object.entries(planGroups).forEach(([planNo, rows]) => {
    // 이 플랜의 시작 시각들 중 현재 시각 이전인 가장 최근 것
    rows.forEach(row => {
      const rowMin = parseInt(row.operHh) * 60 + parseInt(row.operMi);
      if (rowMin <= nowMin && rowMin > latestStartMin) {
        latestStartMin = rowMin;
        currentPlanNo = planNo;
      }
    });
  });

  if (!currentPlanNo) currentPlanNo = Object.keys(planGroups)[0];

  const currentPlanRows = planGroups[currentPlanNo] || [];
  // cycleVal > 0인 행만 (유효한 현시)
  const validRows = currentPlanRows.filter(r => r.cycleVal > 0);
  if (validRows.length === 0) return null;

  // 현시 순서: planIdxNo 기준 정렬
  const phaseRows = [...validRows].sort((a, b) => parseInt(a.planIdxNo) - parseInt(b.planIdxNo));

  // 현재 사이클 내 경과 시간 계산
  const cycleLen = phaseRows[0].cycleVal;
  const nowSec = (now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds());
  const elapsed = nowSec % cycleLen;

  // 현시별 누적 시간으로 현재 현시 결정
  const ringKeys = ["aRing1","aRing2","aRing3","aRing4","aRing5","aRing6","aRing7","aRing8"];
  let acc = 0;
  for (let i = 0; i < ringKeys.length; i++) {
    const val = phaseRows[0][ringKeys[i]];
    if (!val || val <= 0) continue;
    acc += val;
    if (elapsed < acc) return i + 1; // 1-based 현시 번호
  }
  return 1;
}

// 신호등 원형 컴포넌트
function TrafficLight({ color, label, rmnd }) {
  const colors = {
    green:  { on: "#22c55e", glow: "0 0 12px #22c55e88" },
    yellow: { on: "#eab308", glow: "0 0 12px #eab30888" },
    red:    { on: "#ef4444", glow: "0 0 12px #ef444488" },
    off:    { on: "#1e293b", glow: "none" },
  };
  const c = colors[color] || colors.off;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{
        width: 28, height: 28, borderRadius: "50%",
        background: c.on, boxShadow: c.glow,
        border: "2px solid rgba(255,255,255,0.1)",
        transition: "all 0.3s ease"
      }} />
      <div style={{ fontSize: 10, color: "#94a3b8", textAlign: "center", lineHeight: 1.2 }}>{label}</div>
      {rmnd != null && <div style={{ fontSize: 9, color: "#64748b" }}>{rmnd}s</div>}
    </div>
  );
}

export default function SignalSimPanel({ intNo, intNm, onPhaseChange }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [now,     setNow]     = useState(new Date());
  const [phaseIdx, setPhaseIdx] = useState(null);

  // 1초마다 현재 시각 갱신
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // intNo 바뀌면 API 호출
  useEffect(() => {
    if (!intNo) return;
    setLoading(true);
    fetch(`${API_BASE}/api/signal/crossroads/${intNo}`)
      .then(r => r.json())
      .then(d => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [intNo]);

  // 1초마다 현시 계산
  useEffect(() => {
    if (!data?.plans) return;
    const idx = getCurrentPhaseIndex(data.plans, now);
    setPhaseIdx(idx);
    onPhaseChange?.(idx);
  }, [data, now]);

  if (loading) return (
    <div style={{ padding: 20, color: "#94a3b8", fontSize: 13, textAlign: "center" }}>
      신호 데이터 로딩 중...
    </div>
  );

  if (!data || !data.phases?.length) return (
    <div style={{ padding: 20, color: "#64748b", fontSize: 13, textAlign: "center" }}>
      신호 데이터 없음
    </div>
  );

  // MAP_NO=0 우선 사용
  const phase = data.phases.find(p => p.mapNo === "0") || data.phases[0];

  const aKeys = ["aRing1","aRing2","aRing3","aRing4","aRing5","aRing6","aRing7","aRing8"];
  const bKeys = ["bRing1","bRing2","bRing3","bRing4","bRing5","bRing6","bRing7","bRing8"];

  // A링 + B링을 같은 인덱스끼리 쌍으로 묶기
  // pairIdx: A링 몇 번째와 쌍인지 (0-based), A링 자체면 자기 인덱스
  const pairedCodes = [];
  aKeys.forEach((ak, i) => {
    const aCode = phase[ak];
    const bCode = phase[bKeys[i]];
    if (aCode && aCode.length >= 7) pairedCodes.push({ code: aCode, pairIdx: i });
    if (bCode && bCode.length >= 7) pairedCodes.push({ code: bCode, pairIdx: i });
  });

  // 중복 방향 제거
  const seenDirs = new Set();
  const ringCodes = pairedCodes.filter(({ code }) => {
    const parsed = parsePhaseCode(code);
    if (!parsed) return false;
    const dir = `${parsed.from}→${parsed.to}`;
    if (seenDirs.has(dir)) return false;
    seenDirs.add(dir);
    return true;
  });

  // pairIdx 기준으로 A링 현시와 연동해 색상 결정
  const getColor = (pairIdx) => {
    if (!phaseIdx) return "red";
    return pairIdx + 1 === phaseIdx ? "green" : "red";
  };

  // 방향별 신호 상태
  const dirSignals = {};
  ringCodes.forEach(({ code, pairIdx }) => {
    const parsed = parsePhaseCode(code);
    if (!parsed) return;
    const key = `${parsed.from}→${parsed.to}`;
    if (!dirSignals[key]) {
      dirSignals[key] = { ...parsed, pairIdx, color: getColor(pairIdx) };
    }
  });

  // 현재 플랜의 사이클 정보
  const validPlans = data.plans?.filter(p => p.cycleVal > 0) || [];
  const currentCycle = validPlans[0]?.cycleVal || 0;
  const nowSec = now.getHours() * 3600 + now.getMinutes() * 60 + now.getSeconds();
  const elapsed = currentCycle > 0 ? nowSec % currentCycle : 0;
  const remaining = currentCycle > 0 ? currentCycle - elapsed : 0;

  return (
    <div style={{ fontSize: 13, color: "#e2e8f0" }}>

      {/* 교차로 이름 + 현재 시각 */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div style={{ fontSize: 15, fontWeight: 700, color: "#60a5fa" }}>🚦 {intNm}</div>
        <div style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace" }}>
          {now.toLocaleTimeString("ko-KR")}
        </div>
      </div>

      {/* 사이클 진행 바 */}
      {currentCycle > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", marginBottom: 4 }}>
            <span>사이클 진행</span>
            <span>{elapsed}s / {currentCycle}s (잔여 {remaining}s)</span>
          </div>
          <div style={{ height: 4, background: "#1e293b", borderRadius: 2, overflow: "hidden" }}>
            <div style={{
              height: "100%", borderRadius: 2,
              width: `${(elapsed / currentCycle) * 100}%`,
              background: "linear-gradient(90deg, #3b82f6, #22c55e)",
              transition: "width 0.9s linear"
            }} />
          </div>
        </div>
      )}

      {/* 현시 번호 표시 */}
      <div style={{ marginBottom: 14, display: "flex", gap: 6, flexWrap: "wrap" }}>
        {ringCodes.map(({ code, pairIdx }, idx) => {
          const parsed = parsePhaseCode(code);
          if (!parsed) return null;
          const isActive = pairIdx + 1 === phaseIdx;
          return (
            <div key={idx} style={{
              padding: "4px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600,
              background: isActive ? "rgba(34,197,94,0.15)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${isActive ? "rgba(34,197,94,0.5)" : "rgba(255,255,255,0.08)"}`,
              color: isActive ? "#22c55e" : "#64748b",
              transition: "all 0.3s"
            }}>
              {parsed.type === "보행자" ? "🚶" : parsed.type === "좌회전" ? "↰" : "↑"}
              {" "}{parsed.from}→{parsed.to}
            </div>
          );
        })}
      </div>

      {/* 방향별 신호등 */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 11, color: "#64748b", marginBottom: 8 }}>방향별 신호 현황</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {Object.entries(dirSignals).map(([key, sig]) => (
            <div key={key} style={{
              background: "rgba(255,255,255,0.03)",
              border: `1px solid ${sig.color === "green" ? "rgba(34,197,94,0.3)" : "rgba(239,68,68,0.2)"}`,
              borderRadius: 6, padding: "8px 6px",
              display: "flex", flexDirection: "column", alignItems: "center", gap: 6,
              transition: "all 0.3s"
            }}>
              <TrafficLight color={sig.color} label={key} />
              <div style={{ fontSize: 10, color: "#64748b" }}>
                {sig.type === "보행자" ? "🚶 보행" : sig.type === "좌회전" ? "↰ 좌회전" : "↑ 직진"}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 교차로 좌표 */}
      <div style={{ fontSize: 11, color: "#475569", borderTop: "1px solid rgba(255,255,255,0.06)", paddingTop: 8 }}>
        INT_NO: {intNo} · MAP_NO: {phase.mapNo} · 현시수: {ringCodes.length}
      </div>
    </div>
  );
}
