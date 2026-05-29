import { useState, useEffect, useCallback, useRef } from "react";
import SimulationMapView from "../components/map/SimulationMapView";
import SignalSimPanel from "../components/map/SignalSimPanel";
import AppHeader from "../components/common/AppHeader";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8080").replace(/\/+$/, "");

const SIM_PRESETS = [
  { label: "현재 현시", q: "지금 몇 번 현시가 켜져 있어?" },
  { label: "신호 최적화", q: "이 교차로 신호 조정 권고해줘" },
  { label: "사이클 분석", q: "현시 구성이랑 사이클 시간 설명해줘" },
];

function formatSec(sec) {
  if (sec == null) return "-";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

function formatDistance(meters) {
  if (!meters) return "-";
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters} m`;
}

const cardStyle = {
  background: "#1a1710",
  border: "1px solid #2a2418",
  borderRadius: 6,
  padding: 16,
};

const smallLabel = {
  fontSize: 11,
  color: "#64748b",
  marginBottom: 5,
};

function SimulationChatBot({ intNo, intNm, simulation, autoTrigger }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "ai", text: "교차로를 클릭하면 신호계획 분석을 도와드립니다.\n현재 현시, 최적화 방안 등 자유롭게 질문하세요." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!autoTrigger || !autoTrigger.question) return;
    setIsOpen(true);
    const { question, intNo: aIntNo, simulation: aSim } = autoTrigger;
    setMessages(prev => [...prev, { role: "user", text: question }]);
    setLoading(true);
    const body = { question, intNo: aIntNo ?? null, userEmail: JSON.parse(localStorage.getItem("ts_user") || "{}").email || null };
    if (aSim && aSim.length > 0) body.simulation = aSim;
    fetch(`${API_BASE}/api/simulation-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })
      .then(r => r.json())
      .then(data => setMessages(prev => [...prev, { role: "ai", text: data.answer }]))
      .catch(err => setMessages(prev => [...prev, { role: "ai", text: `오류: ${err.message}` }]))
      .finally(() => setLoading(false));
  }, [autoTrigger]);

  const send = useCallback(async (preset) => {
    const q = (preset ?? input).trim();
    if (!q || loading) return;
    setMessages(prev => [...prev, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    try {
      const body = { question: q, intNo: intNo ?? null, userEmail: JSON.parse(localStorage.getItem("ts_user") || "{}").email || null };
      if (simulation && simulation.length > 0) body.simulation = simulation;
      const res = await fetch(`${API_BASE}/api/simulation-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages(prev => [...prev, { role: "ai", text: data.answer }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "ai", text: `오류: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, intNo, simulation]);

  const btn = (style) => ({
    borderRadius: 2,
    border: "none",
    cursor: loading ? "default" : "pointer",
    fontFamily: "inherit",
    ...style,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      <button onClick={() => setIsOpen(o => !o)} style={btn({
        width: 52,
        height: 52,
        borderRadius: "50%",
        background: isOpen ? "#4ea6ff" : "rgba(18,16,10,0.92)",
        border: `2px solid ${isOpen ? "#4ea6ff" : "rgba(78,166,255,0.5)"}`,
        fontSize: 22,
        color: "#fff",
      })} title="AI 신호 분석">
        {isOpen ? "✕" : "🤖"}
      </button>

      {isOpen && (
        <div style={{
          width: 360,
          background: "rgba(18,16,10,0.94)",
          border: "1px solid rgba(42,36,24,0.8)",
          borderRadius: 4,
          padding: "18px 20px",
          backdropFilter: "blur(6px)",
          display: "flex",
          flexDirection: "column",
          gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#4ea6ff" }}>🤖 AI 신호 분석</span>
            {intNm && (
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>● {intNm}</span>
            )}
          </div>

          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {SIM_PRESETS.map(({ label, q }) => (
              <button key={label} onClick={() => send(q)} disabled={loading} style={btn({
                padding: "5px 12px",
                fontSize: 12,
                border: "1px solid #2a3a5a",
                background: loading ? "transparent" : "rgba(78,166,255,0.1)",
                color: loading ? "#3a3a3a" : "#4ea6ff",
              })}>{label}</button>
            ))}
          </div>

          <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "92%",
                  padding: "9px 13px",
                  borderRadius: 2,
                  background: m.role === "user" ? "rgba(78,166,255,0.15)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${m.role === "user" ? "#2a3a5a" : "#1a1a1a"}`,
                  fontSize: 13,
                  lineHeight: 1.7,
                  whiteSpace: "pre-line",
                  color: "#e7ecf5",
                }}>
                  {m.role === "ai" && <div style={{ fontSize: 11, color: "#4ea6ff", marginBottom: 3 }}>Qwen3 분석</div>}
                  {m.text}
                </div>
              </div>
            ))}
            {loading && (
              <div style={{ padding: "9px 13px", borderRadius: 2, background: "rgba(255,255,255,0.04)", border: "1px solid #1a1a1a", fontSize: 12, color: "#4ea6ff" }}>
                신호계획 분석 중...
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <input value={input} onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !loading && send()}
              placeholder={intNo ? "신호 최적화, 현시 구성 등 질문..." : "교차로를 먼저 선택하세요"}
              disabled={loading}
              style={{
                flex: 1,
                background: "rgba(255,255,255,0.04)",
                border: "1px solid #1a1a1a",
                borderRadius: 2,
                padding: "9px 13px",
                color: "#e7ecf5",
                fontSize: 13,
                outline: "none",
                fontFamily: "inherit",
                opacity: loading ? 0.6 : 1,
              }} />
            <button onClick={() => send()} disabled={loading} style={btn({
              padding: "9px 18px",
              background: loading ? "#1a1a1a" : "#4ea6ff",
              color: loading ? "#3a3a3a" : "#000",
              fontSize: 14,
              fontWeight: 700,
            })}>전송</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SimSliderPanel({ intNo, intNm, onSave, onAutoAsk, autoAdjustKey = 0, autoAdjustEnabled = false, onAutoApplied }) {
  const [phases, setPhases] = useState([]);
  const [cycleVal, setCycleVal] = useState(null);
  const [sliders, setSliders] = useState({});
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [autoAnimating, setAutoAnimating] = useState(false);
  const lastAutoAdjustKeyRef = useRef(0);

  useEffect(() => {
    if (!intNo) return;
    setSliders({});
    setSaved(false);
    setLoading(true);
    fetch(`${API_BASE}/api/signal/simulation/context/${intNo}`)
      .then(r => r.json())
      .then(d => {
        setPhases(d.phases || []);
        setCycleVal(d.cycleVal ?? null);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [intNo]);



  const buildOptimizedSliderValues = () => {
    if (!phases.length) return {};
    const current = Object.fromEntries(phases.map(p => [p.no, Number(sliders[p.no] ?? p.sec ?? 0)]));
    const target = cycleVal ?? phases.reduce((sum, p) => sum + Number(current[p.no] || 0), 0);
    if (phases.length === 1) return current;

    // 병목 완화 시연용: 직진/좌회전 현시 중 시간이 가장 긴 현시를 통과 우선 현시로 보고 시간을 늘립니다.
    const candidates = phases.filter(p => (p.dirs || []).some(d => d.includes("직진") || d.includes("좌회전")));
    const boostPhase = [...(candidates.length ? candidates : phases)]
      .sort((a, b) => Number(current[b.no] || 0) - Number(current[a.no] || 0))[0];

    const optimized = { ...current };
    const boost = Math.min(18, Math.max(8, Math.round(target * 0.08)));
    optimized[boostPhase.no] = Math.min(120, Number(optimized[boostPhase.no] || 0) + boost);

    let over = phases.reduce((sum, p) => sum + Number(optimized[p.no] || 0), 0) - target;
    const reducers = phases
      .filter(p => p.no !== boostPhase.no)
      .sort((a, b) => Number(optimized[b.no] || 0) - Number(optimized[a.no] || 0));

    for (const phase of reducers) {
      if (over <= 0) break;
      const reducible = Math.max(0, Number(optimized[phase.no] || 0) - 5);
      const cut = Math.min(reducible, over);
      optimized[phase.no] = Number(optimized[phase.no] || 0) - cut;
      over -= cut;
    }

    // 다른 현시에서 줄일 수 없으면 증가한 현시를 다시 줄여 총 사이클을 맞춥니다.
    if (over > 0) {
      optimized[boostPhase.no] = Math.max(5, Number(optimized[boostPhase.no] || 0) - over);
    }

    return optimized;
  };

  useEffect(() => {
    if (!autoAdjustEnabled || !autoAdjustKey || !phases.length) return;
    if (lastAutoAdjustKeyRef.current === autoAdjustKey) return;
    lastAutoAdjustKeyRef.current = autoAdjustKey;

    const fromValues = Object.fromEntries(phases.map(p => [p.no, Number(sliders[p.no] ?? p.sec ?? 0)]));
    const toValues = buildOptimizedSliderValues();
    const steps = 22;
    let step = 0;
    setAutoAnimating(true);
    setSaved(false);

    const timer = setInterval(() => {
      step += 1;
      const t = step / steps;
      const eased = 1 - Math.pow(1 - t, 3);
      const next = {};
      phases.forEach(p => {
        const start = Number(fromValues[p.no] ?? p.sec ?? 0);
        const end = Number(toValues[p.no] ?? p.sec ?? start);
        next[p.no] = Math.round(start + (end - start) * eased);
      });
      setSliders(next);

      if (step >= steps) {
        clearInterval(timer);
        setSliders(toValues);
        setAutoAnimating(false);
        setSaved(true);
        setTimeout(() => setSaved(false), 1800);
        const simulation = phases.map(p => ({
          no: p.no,
          sec: toValues[p.no] ?? p.sec,
          dirs: p.dirs,
        }));
        onAutoApplied?.(simulation);
      }
    }, 45);

    return () => clearInterval(timer);
  }, [autoAdjustKey, autoAdjustEnabled, phases]);

  if (!intNo) return null;
  if (loading) return <div style={{ padding: "12px 0", fontSize: 12, color: "#64748b", textAlign: "center" }}>슬라이더 데이터 로딩 중...</div>;
  if (!phases.length) return null;

  const totalSec = phases.reduce((s, p) => s + (sliders[p.no] ?? p.sec), 0);
  const target = cycleVal ?? phases.reduce((s, p) => s + p.sec, 0);
  const overTarget = totalSec > target;

  const handleSave = () => {
    const simulation = phases.map(p => ({
      no: p.no,
      sec: sliders[p.no] ?? p.sec,
      dirs: p.dirs,
    }));
    onSave(simulation);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onAutoAsk?.({
      question: `관제사가 ${intNm} 신호를 조정했습니다. 원본과 비교해서 효과를 분석해주세요.`,
      intNo,
      simulation,
      _t: Date.now(),
    });
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 2 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: autoAnimating ? "#22c55e" : "#94a3b8" }}>🎚 신호 시뮬레이션 조정</div>
        {autoAnimating && <div style={{ fontSize: 10, color: "#22c55e", fontWeight: 800 }}>자동 조정 중...</div>}
      </div>
      {phases.map(p => {
        const sec = sliders[p.no] ?? p.sec;
        const changed = sliders[p.no] != null && sliders[p.no] !== p.sec;
        return (
          <div key={p.no} style={{
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${changed ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.07)"}`,
            borderRadius: 5,
            padding: "8px 10px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8" }}>현시 {p.no}</span>
                {p.dirs?.map((d, i) => (
                  <span key={i} style={{
                    fontSize: 10,
                    padding: "1px 6px",
                    borderRadius: 3,
                    background: "rgba(78,166,255,0.1)",
                    border: "1px solid rgba(78,166,255,0.2)",
                    color: "#4ea6ff",
                  }}>{d}</span>
                ))}
              </div>
              <span style={{ fontSize: 11, fontFamily: "monospace", color: changed ? "#f59e0b" : "#64748b" }}>
                {sec}s{changed ? ` (원래 ${p.sec}s)` : ""}
              </span>
            </div>
            <input
              type="range"
              min={5}
              max={120}
              step={1}
              value={sec}
              onChange={e => setSliders(prev => ({ ...prev, [p.no]: Number(e.target.value) }))}
              style={{ width: "100%", accentColor: autoAnimating ? "#22c55e" : changed ? "#f59e0b" : "#3b82f6", cursor: "pointer", transition: "all 0.2s" }}
            />
          </div>
        );
      })}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: "#64748b" }}>
          합계: <span style={{ color: overTarget ? "#ef4444" : totalSec < target ? "#f59e0b" : "#22c55e", fontWeight: 600 }}>{totalSec}s</span>
          <span style={{ color: "#475569" }}> / 목표 {target}s</span>
        </span>
        <button onClick={handleSave} style={{
          marginLeft: "auto",
          padding: "6px 14px",
          borderRadius: 4,
          border: "none",
          cursor: "pointer",
          fontFamily: "inherit",
          background: saved ? "#22c55e" : "#3b82f6",
          color: "#fff",
          fontSize: 12,
          fontWeight: 700,
          transition: "background 0.3s",
        }}>
          {saved ? "✓ 저장됨" : "저장 & AI 분석"}
        </button>
      </div>
    </div>
  );
}

export default function SimulationDashboard({ onGoMain, onGoMap, onGoNews, onGoCctv, onGoMyPage, onLogout, selectedGu }) {
  const [selectedList, setSelectedList] = useState([]);
  const [time, setTime] = useState(new Date());
  const [isOptimized, setIsOptimized] = useState(false);
  const [stats, setStats] = useState(null);
  const [originPhaseIdx, setOriginPhaseIdx] = useState(null);
  const [waypointPhaseIdx, setWaypointPhaseIdx] = useState(null);
  const [destPhaseIdx, setDestPhaseIdx] = useState(null);
  const [simPhases, setSimPhases] = useState(null);
  const [simPhaseTarget, setSimPhaseTarget] = useState(null);
  const [originContext, setOriginContext] = useState(null);
  const [waypointContext, setWaypointContext] = useState(null);
  const [destContext, setDestContext] = useState(null);
  const [autoWaypoints, setAutoWaypoints] = useState([]);
  const [autoTrigger, setAutoTrigger] = useState(null);
  const [sliderTarget, setSliderTarget] = useState("end");
  const [autoAdjustKey, setAutoAdjustKey] = useState(0);

  const start = selectedList[0] ?? null;
  // const end = selectedList[1] ?? null;
  const end = selectedList.length >= 2 ? selectedList[selectedList.length - 1] : null;
  const bottleneckWaypoint = autoWaypoints.length
    ? [...autoWaypoints].sort((a, b) => Math.abs((a.routeProgress ?? 0.5) - 0.54) - Math.abs((b.routeProgress ?? 0.5) - 0.54))[0]
    : null;
  const sliderCrossroad = sliderTarget === "start" ? start : sliderTarget === "waypoint" ? bottleneckWaypoint : end;
  const activeChatCrossroad = sliderCrossroad ?? bottleneckWaypoint ?? end ?? start ?? null;
  const canOptimize = !!start && !!end && !!stats;

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setSimPhases(null);
    setSimPhaseTarget(null);
    setOriginContext(null);
    setWaypointContext(null);
    setDestContext(null);
    if (!bottleneckWaypoint && sliderTarget === "waypoint") setSliderTarget(end ? "end" : "start");
    if (!end && sliderTarget === "end") setSliderTarget("start");
    if (!start) setSliderTarget("end");
  }, [start?.intNo, end?.intNo, bottleneckWaypoint?.intNo]);

  const handleSelect = (cr) => {
    setSelectedList(prev => {
      if (prev.some(item => item.intNo === cr.intNo)) {
        const next = prev.filter(item => item.intNo !== cr.intNo);
        if (next.length < 2) setIsOptimized(false);
        if (next.length === 0) setSliderTarget("end");
        if (next.length === 1) setSliderTarget("start");
        return next;
      }

      const next = [...prev, cr];

      setIsOptimized(false);
      setSliderTarget(next.length <= 1 ? "start" : "end");

      return next;
    });
  };

  const resetSimulation = () => {
    setSelectedList([]);
    setIsOptimized(false);
    setStats(null);
    setSimPhases(null);
    setSimPhaseTarget(null);
    setOriginContext(null);
    setWaypointContext(null);
    setDestContext(null);
    setAutoWaypoints([]);
    setSliderTarget("end");
    setAutoAdjustKey(0);
  };

  const handleManualSave = (simulation) => {
    setSimPhases(simulation);
    setSimPhaseTarget(sliderTarget);
    setIsOptimized(true);
  };

  const applySignalControl = () => {
    if (!canOptimize || isOptimized) return;
    // 병목구간이 자동 경유지로 잡힌 경우, 해당 경유지 신호를 우선 제어하는 흐름으로 보여줍니다.
    setSliderTarget(bottleneckWaypoint ? "waypoint" : "end");
    setIsOptimized(true);
    setAutoAdjustKey(key => key + 1);
  };

  const handleAutoApplied = (simulation) => {
    setSimPhases(simulation);
    setSimPhaseTarget(sliderTarget);
    setAutoTrigger({
      question: `관제사가 ${sliderCrossroad?.intNm || "선택 교차로"} 병목 완화를 위해 신호 시간을 자동 조정했습니다. 제어 전후 효과를 분석해주세요.`,
      intNo: sliderCrossroad?.intNo ?? null,
      simulation,
      _t: Date.now(),
    });
  };

  const panelTitle = sliderTarget === "start"
    ? "출발지 신호 조정"
    : sliderTarget === "waypoint"
      ? "병목 경유지 신호 조정"
      : "목적지 신호 조정";

  return (
    <div style={{ fontFamily: "'Noto Sans KR','Malgun Gothic',sans-serif", background: "#12100a", color: "#e2e8f0", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <AppHeader
        activePage="simulation"
        selectedGu={selectedGu}
        statusText={start && end ? (isOptimized ? "신호제어 적용 중" : "현행 신호 운영") : "경로 선택 대기"}
        statusLive={!!(start && end && isOptimized)}
        onGoMain={onGoMain}
        onGoMap={onGoMap}
        onGoNews={onGoNews}
        onGoCctv={onGoCctv}
        onGoSimulation={() => {}}
        onGoMyPage={onGoMyPage}
        onLogout={onLogout}
      />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "minmax(0, 1fr) 330px 400px", minHeight: 0 }}>
        <div style={{ padding: "10px 6px 10px 10px", minHeight: 0, position: "relative" }}>
          <div style={{ height: "100%", borderRadius: 11, overflow: "hidden", border: `1px solid ${isOptimized ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.08)"}`, boxShadow: isOptimized ? "0 0 20px rgba(34,197,94,0.1)" : "none" }}>
            <SimulationMapView
              selectedList={selectedList}
              onSelect={handleSelect}
              isOptimized={isOptimized}
              onStatsChange={setStats}
              onAutoWaypointsChange={setAutoWaypoints}
            />
          </div>
          <div style={{ position: "absolute", bottom: 24, right: 20, zIndex: 10 }}>
            <SimulationChatBot intNo={activeChatCrossroad?.intNo} intNm={activeChatCrossroad?.intNm} simulation={simPhases} autoTrigger={autoTrigger} />
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 6px 10px 4px", overflowY: "auto" }}>
          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontWeight: 800, color: "#60a5fa", fontSize: 15 }}>🚗 목적지 기반 시뮬레이션</div>
              <button onClick={resetSimulation} style={{ background: "transparent", border: "1px solid #334155", color: "#94a3b8", borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontSize: 11 }}>초기화</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
              <RoutePointCard type="start" title="출발지" crossroad={start} empty="지도에서 첫 번째 마커를 클릭하세요" />
              <RoutePointCard type="waypoint" title="병목 경유지" crossroad={bottleneckWaypoint} empty={end ? "자동 경유지가 없는 경로입니다" : "목적지를 선택하면 자동 탐색됩니다"} />
              <RoutePointCard type="end" title="목적지" crossroad={end} empty="지도에서 두 번째 마커를 클릭하세요" />
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontWeight: 800, color: "#fbbf24", fontSize: 14, marginBottom: 10 }}>📍 병목구간 분석</div>
            {stats ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                  <MetricBox label="전체 거리" value={formatDistance(stats.distanceMeters)} />
                  <MetricBox label="병목구간" value={`${stats.bottleneckCount}개`} />
                </div>
                <div style={{ padding: 10, borderRadius: 5, background: isOptimized ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${isOptimized ? "rgba(34,197,94,0.28)" : "rgba(239,68,68,0.25)"}`, color: isOptimized ? "#bbf7d0" : "#fecaca", fontSize: 12, lineHeight: 1.6 }}>
                  {isOptimized
                    ? "관제사가 병목구간의 직진 신호 시간을 늘려 통과속도가 개선된 상태입니다."
                    : "경로 중간 구간에서 속도 저하가 발생했습니다. 신호제어를 적용하면 예상 도착시간을 줄일 수 있습니다."}
                </div>
              </>
            ) : (
              <div style={{ color: "#64748b", fontSize: 13, lineHeight: 1.7 }}>출발지와 목적지를 모두 선택하면 경로와 병목구간이 표시됩니다.</div>
            )}
          </div>

          <div style={cardStyle}>
            <div style={{ fontWeight: 800, color: "#22c55e", fontSize: 14, marginBottom: 10 }}>⏱ 도착시간 비교</div>
            {stats ? (
              <>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                  <MetricBox label="제어 전" value={formatSec(stats.beforeSec)} color="#ef4444" sub={`${stats.beforeSpeedKph}km/h`} />
                  <MetricBox label="제어 후" value={formatSec(stats.afterSec)} color="#22c55e" sub={`${stats.afterSpeedKph}km/h`} />
                </div>
                <div style={{ padding: "12px 10px", borderRadius: 5, background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.35)", textAlign: "center" }}>
                  <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>예상 단축 시간</div>
                  <div style={{ fontSize: 24, color: "#22c55e", fontWeight: 900 }}>{formatSec(stats.savedSec)}</div>
                </div>
              </>
            ) : (
              <div style={{ color: "#64748b", fontSize: 13 }}>경로 선택 후 비교 결과가 표시됩니다.</div>
            )}
          </div>

          <button
            onClick={applySignalControl}
            disabled={!canOptimize || isOptimized}
            style={{
              border: "none",
              borderRadius: 6,
              padding: "14px 16px",
              cursor: !canOptimize || isOptimized ? "default" : "pointer",
              background: isOptimized ? "#166534" : canOptimize ? "#2563eb" : "#1f2937",
              color: !canOptimize ? "#64748b" : "#fff",
              fontSize: 14,
              fontWeight: 900,
              fontFamily: "inherit",
            }}
          >
            {isOptimized ? "✓ 병목 신호제어 적용 완료" : "🚦 관제사 병목 신호제어 적용"}
          </button>

          <div style={{ ...cardStyle, flexShrink: 0 }}>
            <div style={{ fontWeight: 800, color: "#cbd5e1", fontSize: 13, marginBottom: 8 }}>📘 사용 방법</div>
            <ol style={{ margin: 0, paddingLeft: 18, color: "#94a3b8", fontSize: 12, lineHeight: 1.8 }}>
              <li>지도에서 첫 번째 마커를 클릭해 출발지를 선택합니다.</li>
              <li>두 번째 마커를 클릭하면 목적지와 경로가 생성됩니다.</li>
              <li>가운데 패널에서 병목구간과 도착시간 단축 효과를 확인합니다.</li>
              <li>오른쪽 패널에서 출발지/경유지/목적지 신호체계와 병목 경유지 조정 슬라이더를 확인합니다.</li>
            </ol>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 10px 10px 4px", overflowY: "auto" }}>
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 900, color: "#93c5fd", fontSize: 15 }}>🚦 출발지/경유지/목적지 신호체계</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>동시 확인</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
              <button onClick={() => setSliderTarget("start")} disabled={!start} style={tabButtonStyle(sliderTarget === "start", !!start)}>
                출발지
              </button>
              <button onClick={() => setSliderTarget("waypoint")} disabled={!bottleneckWaypoint} style={tabButtonStyle(sliderTarget === "waypoint", !!bottleneckWaypoint)}>
                경유지
              </button>
              <button onClick={() => setSliderTarget("end")} disabled={!end} style={tabButtonStyle(sliderTarget === "end", !!end)}>
                목적지
              </button>
            </div>
          </div>

          <div style={cardStyle}>
            <div style={{ fontWeight: 800, color: "#22c55e", fontSize: 13, marginBottom: 8 }}>🟢 출발지 신호체계</div>
            {start ? (
              <SignalSimPanel
                intNo={start.intNo}
                intNm={start.intNm}
                onPhaseChange={setOriginPhaseIdx}
                phaseOverride={simPhaseTarget === "start" ? simPhases : null}
                onContextChange={setOriginContext}
              />
            ) : (
              <EmptySignalBox text="출발지를 먼저 선택하세요" />
            )}
          </div>

          <div style={cardStyle}>
            <div style={{ fontWeight: 800, color: "#f59e0b", fontSize: 13, marginBottom: 8 }}>🟠 병목 경유지 신호체계</div>
            {bottleneckWaypoint ? (
              <SignalSimPanel
                intNo={bottleneckWaypoint.intNo}
                intNm={bottleneckWaypoint.intNm}
                onPhaseChange={setWaypointPhaseIdx}
                phaseOverride={simPhaseTarget === "waypoint" ? simPhases : null}
                onContextChange={setWaypointContext}
              />
            ) : (
              <EmptySignalBox text="자동 경유지가 잡히면 병목 경유지 신호체계가 표시됩니다" />
            )}
          </div>

          <div style={cardStyle}>
            <div style={{ fontWeight: 800, color: "#ef4444", fontSize: 13, marginBottom: 8 }}>🔴 목적지 신호체계</div>
            {end ? (
              <SignalSimPanel
                intNo={end.intNo}
                intNm={end.intNm}
                onPhaseChange={setDestPhaseIdx}
                phaseOverride={simPhaseTarget === "end" ? simPhases : null}
                onContextChange={setDestContext}
              />
            ) : (
              <EmptySignalBox text="목적지를 선택하면 신호체계가 표시됩니다" />
            )}
          </div>

          <div style={cardStyle}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontWeight: 800, color: "#c084fc", fontSize: 13 }}>🎚 {panelTitle}</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>
                {sliderCrossroad?.intNm || "교차로 선택 필요"}
              </div>
            </div>
            {sliderCrossroad ? (
              <SimSliderPanel
                intNo={sliderCrossroad.intNo}
                intNm={sliderCrossroad.intNm}
                onSave={handleManualSave}
                onAutoAsk={setAutoTrigger}
                autoAdjustKey={autoAdjustKey}
                autoAdjustEnabled={isOptimized}
                onAutoApplied={handleAutoApplied}
              />
            ) : (
              <EmptySignalBox text="출발지 또는 목적지를 선택하면 슬라이더를 사용할 수 있습니다" />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptySignalBox({ text }) {
  return (
    <div style={{ minHeight: 120, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", color: "#64748b", fontSize: 13, lineHeight: 1.6 }}>
      {text}
    </div>
  );
}

function tabButtonStyle(active, enabled) {
  return {
    padding: "8px 10px",
    borderRadius: 5,
    border: `1px solid ${active ? "rgba(96,165,250,0.65)" : "rgba(255,255,255,0.10)"}`,
    background: active ? "rgba(96,165,250,0.18)" : "rgba(255,255,255,0.04)",
    color: !enabled ? "#475569" : active ? "#93c5fd" : "#94a3b8",
    cursor: enabled ? "pointer" : "default",
    fontSize: 12,
    fontWeight: 800,
    fontFamily: "inherit",
  };
}

function RoutePointCard({ type, title, crossroad, empty }) {
  const isStart = type === "start";
  const isWaypoint = type === "waypoint";
  const color = isStart ? "#22c55e" : isWaypoint ? "#f59e0b" : "#ef4444";
  const emoji = isStart ? "🟢" : isWaypoint ? "🟠" : "🔴";
  return (
    <div style={{ padding: 10, borderRadius: 5, background: "rgba(255,255,255,0.035)", border: `1px solid ${crossroad ? color + "66" : "rgba(255,255,255,0.08)"}` }}>
      <div style={smallLabel}>{emoji} {title}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: crossroad ? color : "#64748b" }}>
        {crossroad?.intNm || empty}
      </div>
      {crossroad && <div style={{ marginTop: 4, fontSize: 11, color: "#475569", fontFamily: "monospace" }}>INT_NO: {crossroad.intNo}</div>}
    </div>
  );
}

function MetricBox({ label, value, color = "#e2e8f0", sub }) {
  return (
    <div style={{ padding: 10, borderRadius: 5, background: "rgba(255,255,255,0.035)", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={smallLabel}>{label}</div>
      <div style={{ fontSize: 18, fontWeight: 900, color }}>{value}</div>
      {sub && <div style={{ marginTop: 2, fontSize: 11, color: "#64748b" }}>{sub}</div>}
    </div>
  );
}
