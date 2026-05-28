import { useState, useCallback, useRef, useEffect } from "react";

const PYTHON_BASE = import.meta.env.VITE_PYTHON_URL || "http://localhost:8001";

const INITIAL_MSG = [
  {
    role: "ai",
    text: "안녕하세요! 서울 교통 AI 어시스턴트입니다.\n교차로 이름, 구 이름, 신호 상황 등 자유롭게 질문해보세요.\n예) '잠실역 교차로 어때?' / '강남구 막히는 곳은?'",
    steps: [],
  },
];

const PRESETS = [
  { label: "병목 TOP3",  q: "지금 가장 막히는 교차로 3곳 알려줘" },
  { label: "신호 최적화", q: "현재 가장 정체가 심한 교차로의 신호 조정 방법을 알려줘" },
  { label: "날씨 현황",  q: "현재 날씨 상황이 교통에 어떤 영향을 미치고 있어?" },
];

const STEP_LABEL = {
  thought:     "생각",
  action:      "도구 사용",
  observation: "결과 확인",
};

function ThinkingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 2, alignItems: "center" }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 3, height: 3, borderRadius: "50%",
          background: "rgba(255,255,255,0.45)",
          display: "inline-block",
          animation: `chatDotBlink 1.2s ease ${i * 0.2}s infinite`,
        }} />
      ))}
    </span>
  );
}

function StepRows({ steps }) {
  return (
    <div style={{ padding: "6px 12px 8px", display: "flex", flexDirection: "column", gap: 4 }}>
      {steps.map((step, i) => {
        const label = STEP_LABEL[step.type] ?? step.type;
        const text = step.type === "action"
          ? (step.tool ? `${step.tool}${step.args ? `(${step.args})` : ""}` : step.content ?? "")
          : (step.content ?? "");
        return (
          <div key={i} style={{ display: "flex", gap: 10, animation: "chatFadeIn .15s ease" }}>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", minWidth: 54, flexShrink: 0, paddingTop: 1, fontFamily: "system-ui,sans-serif" }}>
              {label}
            </span>
            <span style={{ fontSize: 10, color: "rgba(255,255,255,0.48)", lineHeight: 1.55, wordBreak: "break-all", fontFamily: "system-ui,sans-serif" }}>
              {text.length > 140 ? text.slice(0, 140) + "…" : text}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function InlineSteps({ steps, collapsed, onToggle }) {
  if (!steps || steps.length === 0) return null;
  return (
    <div style={{
      border: "1px solid rgba(255,255,255,0.06)",
      borderRadius: 6, overflow: "hidden", marginBottom: 4,
    }}>
      <button onClick={onToggle} style={{
        width: "100%", display: "flex", alignItems: "center", gap: 6,
        padding: "7px 12px",
        background: "rgba(255,255,255,0.025)",
        border: "none", cursor: "pointer",
        color: "rgba(255,255,255,0.38)", fontSize: 11,
        textAlign: "left", fontFamily: "system-ui,sans-serif",
      }}>
        <span style={{ fontSize: 8, transition: "transform .2s", transform: collapsed ? "rotate(-90deg)" : "none", display: "inline-block" }}>▾</span>
        추론 과정 · {steps.length}단계
      </button>
      {!collapsed && <StepRows steps={steps} />}
    </div>
  );
}

function ThinkingBlock({ steps }) {
  return (
    <div style={{ border: "1px solid rgba(255,255,255,0.06)", borderRadius: 6, overflow: "hidden" }}>
      <div style={{
        display: "flex", alignItems: "center", gap: 6,
        padding: "7px 12px",
        background: "rgba(255,255,255,0.025)",
        color: "rgba(255,255,255,0.38)", fontSize: 11,
        fontFamily: "system-ui,sans-serif",
      }}>
        <ThinkingDots />
        <span style={{ marginLeft: 2 }}>추론 중{steps.length > 0 ? ` · ${steps.length}단계` : ""}</span>
      </div>
      {steps.length > 0 && <StepRows steps={steps} />}
      <div style={{ height: 1, background: "rgba(255,255,255,0.04)" }}>
        <div style={{ height: "100%", background: "rgba(255,255,255,0.14)", animation: "chatProgressBar 2.4s ease infinite" }} />
      </div>
    </div>
  );
}

// 패널 내용 컴포넌트 — MapDashboard 그리드 셀 안에 렌더링됨
export default function AIChatBot({ selected, onClose }) {
  const [messages,       setMessages]       = useState(INITIAL_MSG);
  const [input,          setInput]          = useState("");
  const [loading,        setLoading]        = useState(false);
  const [liveSteps,      setLiveSteps]      = useState([]);
  const [collapsedSteps, setCollapsedSteps] = useState({});

  const bottomRef = useRef(null);
  const inputRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, liveSteps]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const toggleStep = (idx) => {
    setCollapsedSteps(prev => ({ ...prev, [idx]: !(prev[idx] ?? false) }));
  };

  const sendChat = useCallback(async (preset) => {
    const q = (preset ?? input).trim();
    if (!q || loading) return;

    setMessages(prev => [...prev, { role: "user", text: q, steps: [] }]);
    setInput("");
    setLoading(true);
    setLiveSteps([]);

    try {
      const res = await fetch(`${PYTHON_BASE}/api/agent/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question:  q,
          crsrdId:   selected?.crsrdId ?? null,
          userEmail: JSON.parse(localStorage.getItem("ts_user") || "{}").email || null,
        }),
      });

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let currentSteps = [];

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          let data;
          try { data = JSON.parse(line.slice(6)); } catch { continue; }

          if (data.type === "done") break;
          if (data.type === "answer") {
            setMessages(prev => [...prev, { role: "ai", text: data.content, steps: currentSteps }]);
            setLiveSteps([]);
          } else if (data.type === "error") {
            setMessages(prev => [...prev, { role: "ai", text: `오류: ${data.content}`, steps: [] }]);
            setLiveSteps([]);
          } else {
            currentSteps = [...currentSteps, data];
            setLiveSteps([...currentSteps]);
          }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "ai", text: `오류: ${err.message}`, steps: [] }]);
      setLiveSteps([]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, selected]);

  return (
    <>
      <div style={{
        display: "flex", flexDirection: "column", height: "100%",
        background: "rgba(11,11,11,0.95)",
        borderLeft: "1px solid rgba(255,255,255,0.07)",
        fontFamily: "system-ui,-apple-system,sans-serif",
      }}>

        {/* 헤더 */}
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", gap: 8,
          flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.72)" }}>
            AI 교통 어시스턴트
          </span>
          {selected && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)" }}>
              · {selected.crsrdNm}
            </span>
          )}
          <button onClick={onClose} style={{
            marginLeft: "auto",
            background: "none", border: "none",
            color: "rgba(255,255,255,0.3)", fontSize: 14,
            cursor: "pointer", padding: "0 2px", lineHeight: 1,
          }}>✕</button>
        </div>

        {/* 프리셋 */}
        <div style={{
          padding: "8px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.04)",
          display: "flex", gap: 5, flexWrap: "wrap",
          flexShrink: 0,
        }}>
          {PRESETS.map(({ label, q }) => (
            <button key={label} onClick={() => sendChat(q)} disabled={loading} style={{
              padding: "4px 10px", fontSize: 11, borderRadius: 5,
              border: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(255,255,255,0.04)",
              color: loading ? "rgba(255,255,255,0.18)" : "rgba(255,255,255,0.5)",
              cursor: loading ? "default" : "pointer",
              fontFamily: "inherit",
            }}>
              {label}
            </button>
          ))}
        </div>

        {/* 메시지 영역 */}
        <div style={{
          flex: 1, overflowY: "auto",
          padding: "14px 16px",
          display: "flex", flexDirection: "column", gap: 12,
        }}>
          {messages.map((m, idx) =>
            m.role === "user" ? (
              <div key={idx} style={{ display: "flex", justifyContent: "flex-end" }}>
                <div style={{
                  maxWidth: "80%",
                  padding: "9px 13px",
                  borderRadius: "12px 12px 3px 12px",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  fontSize: 13, lineHeight: 1.7,
                  color: "rgba(255,255,255,0.82)",
                  whiteSpace: "pre-line",
                }}>
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: "92%" }}>
                <span style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", paddingLeft: 2 }}>AI</span>
                <InlineSteps
                  steps={m.steps}
                  collapsed={collapsedSteps[idx] === true}
                  onToggle={() => toggleStep(idx)}
                />
                <div style={{
                  padding: "9px 13px",
                  borderRadius: "3px 12px 12px 12px",
                  background: "rgba(255,255,255,0.03)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  fontSize: 13, lineHeight: 1.8,
                  color: "rgba(255,255,255,0.72)",
                  whiteSpace: "pre-line",
                }}>
                  {m.text}
                </div>
              </div>
            )
          )}

          {loading && (
            <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: "92%" }}>
              <span style={{ fontSize: 10, color: "rgba(255,255,255,0.28)", paddingLeft: 2 }}>AI</span>
              <ThinkingBlock steps={liveSteps} />
            </div>
          )}

          <div ref={bottomRef} />
        </div>

        {/* 입력 */}
        <div style={{
          padding: "10px 16px 14px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex", gap: 7, flexShrink: 0,
        }}>
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !loading && sendChat()}
            placeholder="자유롭게 질문하세요..."
            disabled={loading}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8, padding: "9px 13px",
              color: "rgba(255,255,255,0.82)", fontSize: 13,
              outline: "none", fontFamily: "inherit",
              opacity: loading ? 0.5 : 1,
            }}
          />
          <button onClick={() => sendChat()} disabled={loading} style={{
            padding: "9px 16px", borderRadius: 8,
            background: loading ? "rgba(255,255,255,0.03)" : "rgba(255,255,255,0.09)",
            border: "1px solid rgba(255,255,255,0.09)",
            color: loading ? "rgba(255,255,255,0.2)" : "rgba(255,255,255,0.7)",
            fontSize: 13, fontWeight: 600,
            cursor: loading ? "default" : "pointer",
            fontFamily: "inherit",
          }}>
            전송
          </button>
        </div>
      </div>

      <style>{`
        @keyframes chatDotBlink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.2; }
        }
        @keyframes chatProgressBar {
          0%   { width: 0%; }
          60%  { width: 75%; }
          100% { width: 92%; }
        }
        @keyframes chatFadeIn {
          from { opacity: 0; transform: translateY(3px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  );
}
