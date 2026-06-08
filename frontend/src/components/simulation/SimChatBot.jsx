// AI 신호 분석 챗봇 컴포넌트
import { useState, useEffect, useCallback } from "react";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8080").replace(/\/+$/, "");
const CHATBOT_ICON = "/icons/chatbot.webp";

const SIM_PRESETS = [
  { label: "현재 현시", q: "지금 몇 번 현시가 켜져 있어?" },
  { label: "신호 최적화", q: "이 교차로 신호 조정 권고해줘" },
  { label: "사이클 분석", q: "현시 구성이랑 사이클 시간 설명해줘" },
];

function resolveSegments(segments) {
  if (!segments?.length) return [];
  return segments
    .map(seg => {
      const speed = seg.selectedTraffic ?? seg.up;
      if (!speed?.speedKph) return null;
      return { fromIntNo: seg.fromIntNo, toIntNo: seg.toIntNo, axisName: seg.axisName, speedKph: speed.speedKph, congestion: speed.congestion };
    })
    .filter(Boolean);
}

function getUserEmail() {
  return JSON.parse(localStorage.getItem("ts_user") || "{}").email || null;
}

export default function SimChatBot({ intNo, intNm, simulation, routeTraffic, autoTrigger }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: "ai", text: "교차로를 클릭하면 신호계획 분석을 도와드립니다.\n현재 현시, 최적화 방안 등 자유롭게 질문하세요." },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const buildBody = (question, intNoVal, simVal, rt) => {
    const body = { question, intNo: intNoVal ?? null, userEmail: getUserEmail() };
    if (simVal?.length > 0) body.simulation = simVal;
    const resolved = resolveSegments(rt?.segments);
    if (resolved.length > 0) body.routeTraffic = resolved;
    return body;
  };

  // autoTrigger: 외부(경로 최적화 등)에서 자동으로 AI 질문을 유발할 때 사용
  useEffect(() => {
    if (!autoTrigger?.question) return;
    setIsOpen(true);
    const { question, intNo: aIntNo, simulation: aSim, routeTraffic: aRt } = autoTrigger;
    setMessages(prev => [...prev, { role: "user", text: question }]);
    setLoading(true);

    fetch(`${API_BASE}/api/simulation-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(buildBody(question, aIntNo, aSim, aRt)),
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
      const res = await fetch(`${API_BASE}/api/simulation-chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(q, intNo, simulation, routeTraffic)),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages(prev => [...prev, { role: "ai", text: data.answer }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "ai", text: `오류: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, intNo, simulation, routeTraffic]);

  const btnBase = { borderRadius: 2, border: "none", cursor: loading ? "default" : "pointer", fontFamily: "inherit" };

  return (
    <div style={{ display: "flex", flexDirection: "column-reverse", alignItems: "flex-end", gap: 8 }}>
      <button
        onClick={() => setIsOpen(o => !o)}
        style={{
          width: 54, height: 54, borderRadius: "50%",
          background: isOpen
            ? "linear-gradient(135deg, rgba(96,165,250,0.95), rgba(168,85,247,0.95))"
            : "linear-gradient(135deg, rgba(30,41,59,0.96), rgba(59,130,246,0.9))",
          border: `2px solid ${isOpen ? "rgba(255,255,255,0.38)" : "rgba(147,197,253,0.55)"}`,
          backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)",
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          boxShadow: "0 4px 18px rgba(0,0,0,0.62), 0 0 16px rgba(96,165,250,0.28)",
          transition: "all .2s", padding: 0,
        }}
        title={isOpen ? "AI 챗봇 닫기" : "AI 신호 분석 열기"}
      >
        {isOpen
          ? <span style={{ fontSize: 16, color: "rgba(255,255,255,0.55)" }}>✕</span>
          : <img src={CHATBOT_ICON} alt="AI 상담사" style={{ width: 42, height: 42, objectFit: "contain", display: "block", transform: "translateY(1px)" }} />
        }
      </button>

      {isOpen && (
        <div style={{
          width: 340, maxHeight: "calc(100vh - 310px)", minHeight: 360,
          background: "rgba(18,16,10,0.94)", border: "1px solid rgba(42,36,24,0.8)",
          borderRadius: 8, padding: "16px 18px", backdropFilter: "blur(8px)",
          WebkitBackdropFilter: "blur(8px)", display: "flex", flexDirection: "column",
          gap: 10, boxShadow: "0 14px 38px rgba(0,0,0,0.45)", overflow: "hidden",
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 16, fontWeight: 700, color: "#4ea6ff" }}>AI 신호 분석</span>
            {intNm && <span style={{ marginLeft: "auto", fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>● {intNm}</span>}
          </div>

          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {SIM_PRESETS.map(({ label, q }) => (
              <button key={label} onClick={() => send(q)} disabled={loading} style={{ ...btnBase, padding: "5px 12px", fontSize: 12, border: "1px solid #2a3a5a", background: loading ? "transparent" : "rgba(78,166,255,0.1)", color: loading ? "#3a3a3a" : "#4ea6ff" }}>
                {label}
              </button>
            ))}
          </div>

          <div style={{ flex: 1, minHeight: 150, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6 }}>
            {messages.map((m, i) => (
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{ maxWidth: "92%", padding: "9px 13px", borderRadius: 2, background: m.role === "user" ? "rgba(78,166,255,0.15)" : "rgba(255,255,255,0.04)", border: `1px solid ${m.role === "user" ? "#2a3a5a" : "#1a1a1a"}`, fontSize: 13, lineHeight: 1.7, whiteSpace: "pre-line", color: "#e7ecf5" }}>
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
            <input
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !loading && send()}
              placeholder={intNo ? "신호 최적화, 현시 구성 등 질문..." : "교차로를 먼저 선택하세요"}
              disabled={loading}
              style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid #1a1a1a", borderRadius: 2, padding: "9px 13px", color: "#e7ecf5", fontSize: 13, outline: "none", fontFamily: "inherit", opacity: loading ? 0.6 : 1 }}
            />
            <button onClick={() => send()} disabled={loading} style={{ ...btnBase, padding: "9px 18px", background: loading ? "#1a1a1a" : "#4ea6ff", color: loading ? "#3a3a3a" : "#000", fontSize: 14, fontWeight: 700 }}>
              전송
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
