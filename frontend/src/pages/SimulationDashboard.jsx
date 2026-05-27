import { useState, useEffect, useCallback } from "react";
import SimulationMapView from "../components/map/SimulationMapView";
import SignalSimPanel from "../components/map/SignalSimPanel";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8080").replace(/\/+$/, "");

const SIM_PRESETS = [
  { label: "현재 현시", q: "지금 몇 번 현시가 켜져 있어?" },
  { label: "신호 최적화", q: "이 교차로 신호 조정 권고해줘" },
  { label: "사이클 분석", q: "현시 구성이랑 사이클 시간 설명해줘" },
];

function SimulationChatBot({ intNo, intNm, simulation, autoTrigger }) {
  const [isOpen, setIsOpen]     = useState(false);
  const [messages, setMessages] = useState([
    { role: "ai", text: "교차로를 클릭하면 신호계획 분석을 도와드립니다.\n현재 현시, 최적화 방안 등 자유롭게 질문하세요." }
  ]);
  const [input,   setInput]   = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!autoTrigger || !autoTrigger.question) return;
    setIsOpen(true);
    const { question, intNo: aIntNo, simulation: aSim } = autoTrigger;
    setMessages(prev => [...prev, { role: "user", text: question }]);
    setLoading(true);
    const body = { question, intNo: aIntNo ?? null };
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
      const body = { question: q, intNo: intNo ?? null };
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
    borderRadius: 2, border: "none", cursor: loading ? "default" : "pointer",
    fontFamily: "inherit", ...style,
  });

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      <button onClick={() => setIsOpen(o => !o)} style={btn({
        width: 52, height: 52, borderRadius: "50%",
        background: isOpen ? "#4ea6ff" : "rgba(18,16,10,0.92)",
        border: `2px solid ${isOpen ? "#4ea6ff" : "rgba(78,166,255,0.5)"}`,
        fontSize: 22, color: "#fff",
      })} title="AI 신호 분석">
        {isOpen ? "✕" : "🤖"}
      </button>

      {isOpen && (
        <div style={{
          width: 360, background: "rgba(18,16,10,0.92)",
          border: "1px solid rgba(42,36,24,0.8)", borderRadius: 4, padding: "18px 20px",
          backdropFilter: "blur(6px)", display: "flex", flexDirection: "column", gap: 10,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#4ea6ff" }}>🤖 AI 신호 분석</span>
            {intNm && (
              <span style={{ marginLeft: "auto", fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>
                ● {intNm}
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {SIM_PRESETS.map(({ label, q }) => (
              <button key={label} onClick={() => send(q)} disabled={loading} style={btn({
                padding: "5px 12px", fontSize: 12, border: "1px solid #2a3a5a",
                background: loading ? "transparent" : "rgba(78,166,255,0.1)",
                color: loading ? "#3a3a3a" : "#4ea6ff",
              })}>{label}</button>
            ))}
          </div>
          <div style={{ maxHeight: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "92%", padding: "9px 13px", borderRadius: 2,
                  background: m.role === "user" ? "rgba(78,166,255,0.15)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${m.role === "user" ? "#2a3a5a" : "#1a1a1a"}`,
                  fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-line", color: "#e7ecf5",
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
                flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid #1a1a1a",
                borderRadius: 2, padding: "9px 13px", color: "#e7ecf5", fontSize: 13,
                outline: "none", fontFamily: "inherit", opacity: loading ? 0.6 : 1,
              }} />
            <button onClick={() => send()} disabled={loading} style={btn({
              padding: "9px 18px", background: loading ? "#1a1a1a" : "#4ea6ff",
              color: loading ? "#3a3a3a" : "#000", fontSize: 14, fontWeight: 700,
            })}>전송</button>
          </div>
        </div>
      )}
    </div>
  );
}

function SimSliderPanel({ intNo, intNm, onSave, onAutoAsk }) {
  const [phases,   setPhases]  = useState([]);
  const [cycleVal, setCycleVal] = useState(null);
  const [sliders,  setSliders]  = useState({});
  const [saved,    setSaved]    = useState(false);
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    if (!intNo) return;
    setSliders({});
    setSaved(false);
    setLoading(true);
    fetch(`${API_BASE}/api/signal/simulation/context/${intNo}`)
      .then(r => r.json())
      .then(d => { setPhases(d.phases || []); setCycleVal(d.cycleVal ?? null); setLoading(false); })
      .catch(() => setLoading(false));
  }, [intNo]);

  if (!intNo) return null;
  if (loading) return (
    <div style={{ padding: "12px 0", fontSize: 12, color: "#64748b", textAlign: "center" }}>
      슬라이더 데이터 로딩 중...
    </div>
  );
  if (!phases.length) return null;

  const totalSec  = phases.reduce((s, p) => s + (sliders[p.no] ?? p.sec), 0);
  const target    = cycleVal ?? phases.reduce((s, p) => s + p.sec, 0);
  const overTarget = totalSec > target;

  const handleSave = () => {
    const simulation = phases.map(p => ({
      no:   p.no,
      sec:  sliders[p.no] ?? p.sec,
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
      <div style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", marginBottom: 2 }}>
        🎚 신호 시뮬레이션 조정
      </div>
      {phases.map(p => {
        const sec     = sliders[p.no] ?? p.sec;
        const changed = sliders[p.no] != null && sliders[p.no] !== p.sec;
        return (
          <div key={p.no} style={{
            background: "rgba(255,255,255,0.03)",
            border: `1px solid ${changed ? "rgba(245,158,11,0.4)" : "rgba(255,255,255,0.07)"}`,
            borderRadius: 5, padding: "8px 10px",
          }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8" }}>현시 {p.no}</span>
                {p.dirs?.map((d, i) => (
                  <span key={i} style={{
                    fontSize: 10, padding: "1px 6px", borderRadius: 3,
                    background: "rgba(78,166,255,0.1)", border: "1px solid rgba(78,166,255,0.2)",
                    color: "#4ea6ff"
                  }}>{d}</span>
                ))}
              </div>
              <span style={{ fontSize: 11, fontFamily: "monospace", color: changed ? "#f59e0b" : "#64748b" }}>
                {sec}s{changed ? ` (원래 ${p.sec}s)` : ""}
              </span>
            </div>
            <input
              type="range" min={5} max={120} step={1} value={sec}
              onChange={e => setSliders(prev => ({ ...prev, [p.no]: Number(e.target.value) }))}
              style={{ width: "100%", accentColor: changed ? "#f59e0b" : "#3b82f6", cursor: "pointer" }}
            />
          </div>
        );
      })}
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span style={{ fontSize: 11, color: "#64748b" }}>
          합계: <span style={{ color: overTarget ? "#ef4444" : totalSec < target ? "#f59e0b" : "#22c55e", fontWeight: 600 }}>
            {totalSec}s
          </span>
          <span style={{ color: "#475569" }}> / 목표 {target}s</span>
        </span>
        <button onClick={handleSave} style={{
          marginLeft: "auto", padding: "6px 14px", borderRadius: 4,
          border: "none", cursor: "pointer", fontFamily: "inherit",
          background: saved ? "#22c55e" : "#3b82f6",
          color: "#fff", fontSize: 12, fontWeight: 700, transition: "background 0.3s"
        }}>
          {saved ? "✓ 저장됨" : "저장 & AI 분석"}
        </button>
      </div>
    </div>
  );
}

// ── 메인 대시보드 ─────────────────────────────────────────────────────────────
export default function SimulationDashboard({ onGoMain, onGoMap }) {
  // selectedList: 클릭한 교차로 순서대로 쌓이는 배열
  // [0]=첫 번째 마커, [1]=두 번째 마커, ...
  const [selectedList, setSelectedList] = useState([]);
  const [time,         setTime]         = useState(new Date());
  const [phaseIdx,     setPhaseIdx]     = useState(null);
  const [simPhases,    setSimPhases]    = useState(null);
  const [simContext,   setSimContext]   = useState(null);
  const [autoTrigger,  setAutoTrigger]  = useState(null);
  const [aiOptResult,  setAiOptResult]  = useState(null);

  // 편의 변수: 첫 번째 선택 교차로 (사이드바 패널용)
  const selected = selectedList[0] ?? null;

  // isAfterMode: AI 최적화 결과가 있을 때 After 모드
  const isAfterMode = !!aiOptResult && aiOptResult.status === "optimized";

  // handleSelect: 마커 클릭마다 selectedList에 추가
  //   - 이미 리스트에 있는 교차로 클릭 → 해당 교차로 이후 제거 (재선택)
  //   - 새 교차로 클릭 → 배열 끝에 추가
  //   - 첫 번째 마커 다시 클릭 → 초기화
  const handleSelect = (cr) => {
    setSelectedList(prev => {
      // 이미 선택된 마커를 다시 클릭 → 해당 마커 취소(제거)
      const existIdx = prev.findIndex(item => item.intNo === cr.intNo);
      if (existIdx !== -1) {
        const next = prev.filter(item => item.intNo !== cr.intNo);
        if (next.length === 0) {
          setAiOptResult(null);
          setSimContext(null);
        }
        return next;
      }
      // 새 교차로 추가
      return [...prev, cr];
    });
  };

  const handleSimulationSave = (simulation) => {
    setSimPhases(simulation);
    setAiOptResult({ status: "optimized", source: "manual-simulation", appliedAt: Date.now() });
  };

  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    setSimPhases(null);
    if (selectedList.length === 0) {
      setAiOptResult(null);
      setSimContext(null);
    }
  }, [selectedList]);

  return (
    <div style={{ fontFamily: "'Noto Sans KR','Malgun Gothic',sans-serif", background: "#12100a", color: "#e2e8f0", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>

      {/* 헤더 */}
      <div style={{ background: "#12100a", borderBottom: "1px solid #2a2418", padding: "0 22px", height: 56, display: "flex", alignItems: "center", gap: 14, flexShrink: 0 }}>
        <button onClick={onGoMain} style={{ background: "#1a1710", border: "1px solid #2a2418", borderRadius: 2, padding: "5px 13px", color: "#aab4c8", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>← 대시보드</button>
        <button onClick={onGoMap} style={{ background: "#1a1710", border: "1px solid #2a2418", borderRadius: 2, padding: "5px 13px", color: "#aab4c8", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>🗺️ 실시간 지도</button>
        <span style={{ fontSize: 20 }}>🚦</span>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16, color: "#60a5fa" }}>신호 시뮬레이션 3D</div>
          <div style={{ fontSize: 11, color: "#475569" }}>교차로 클릭 → 실시간 신호 + 3D 차량 확인</div>
        </div>

        {selectedList.length > 0 && (
          <div style={{
            marginLeft: 16, display: "flex", alignItems: "center", gap: 6,
            padding: "4px 14px", borderRadius: 20,
            background: isAfterMode ? "rgba(34,197,94,0.12)" : "rgba(239,68,68,0.08)",
            border: `1px solid ${isAfterMode ? "rgba(34,197,94,0.4)" : "rgba(239,68,68,0.2)"}`,
          }}>
            <span style={{ width: 7, height: 7, borderRadius: "50%", background: isAfterMode ? "#22c55e" : "#ef4444", display: "inline-block", boxShadow: isAfterMode ? "0 0 6px #22c55e" : "none" }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: isAfterMode ? "#22c55e" : "#ef4444" }}>
              {isAfterMode ? "AI 최적화 적용 중" : "현행 신호 운영"}
            </span>
          </div>
        )}

        <div style={{ marginLeft: "auto", fontSize: 13, color: "#9ca3af", fontFamily: "monospace", background: "rgba(255,255,255,0.04)", padding: "3px 9px", borderRadius: 5 }}>
          {time.toLocaleTimeString("ko-KR")}
        </div>
      </div>

      {/* 메인 */}
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: "1fr 400px", minHeight: 0 }}>

        {/* 3D 지도 */}
        <div style={{ padding: "10px 6px 10px 10px", minHeight: 0, position: "relative" }}>
          <div style={{ height: "100%", borderRadius: 11, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
            <SimulationMapView
              selectedList={selectedList}
              onSelect={handleSelect}
              phaseIdx={phaseIdx}
              isOptimized={isAfterMode}
              trafficContext={simContext?.traffic}
            />
          </div>
          <div style={{ position: "absolute", bottom: 24, right: 20, zIndex: 10 }}>
            <SimulationChatBot intNo={selected?.intNo} intNm={selected?.intNm} simulation={simPhases} autoTrigger={autoTrigger} />
          </div>
        </div>

        {/* 사이드바 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 10px 10px 4px", overflowY: "auto" }}>

          <div style={{ background: "#1a1710", border: "1px solid #2a2418", borderRadius: 6, padding: 16 }}>
            {selected ? (  /* selected = selectedList[0] */
              <SignalSimPanel
                intNo={selected.intNo}
                intNm={selected.intNm}
                onPhaseChange={setPhaseIdx}
                phaseOverride={simPhases}
                onContextChange={setSimContext}
              />
            ) : (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: 160, gap: 12, color: "#475569" }}>
                <div style={{ fontSize: 36 }}>🚦</div>
                <div style={{ fontSize: 14, color: "#64748b" }}>교차로를 클릭하세요</div>
                <div style={{ fontSize: 12, color: "#374151" }}>지도에서 파란 마커를 클릭하면</div>
                <div style={{ fontSize: 12, color: "#374151" }}>실시간 신호 현시를 확인할 수 있습니다</div>
              </div>
            )}
          </div>

          {selectedList.length > 0 && (
            <div style={{ background: "#1a1710", border: "1px solid #2a2418", borderRadius: 6, padding: 16 }}>
              <SimSliderPanel
                intNo={selected.intNo}
                intNm={selected.intNm}
                onSave={handleSimulationSave}
                onAutoAsk={setAutoTrigger}
              />
            </div>
          )}

          <div style={{ background: "#1a1710", border: "1px solid #2a2418", borderRadius: 6, padding: 14, flexShrink: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 8 }}>📖 사용 방법</div>
            {[
              "지도에서 🔵 파란 마커 클릭",
              "현재 시각 기준 신호 현시 자동 계산",
              "슬라이더로 현시별 시간 조정",
              "저장 & AI 분석 → 챗봇에 자동 반영",
            ].map((t, i) => (
              <div key={i} style={{ fontSize: 11, color: "#64748b", marginBottom: 4, display: "flex", gap: 6 }}>
                <span style={{ color: i >= 3 ? "#22c55e" : "#3b82f6" }}>{i + 1}.</span> {t}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}