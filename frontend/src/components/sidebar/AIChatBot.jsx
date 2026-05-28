import { useState, useCallback, useRef, useEffect } from "react";

const API_BASE    = import.meta.env.VITE_API_URL    || "http://localhost:8080";
const PYTHON_BASE = import.meta.env.VITE_PYTHON_URL || "http://localhost:8001";

const INITIAL_MSG = [
  {
    role: "ai",
    text: "안녕하세요! 서울 교통 AI 어시스턴트입니다.\n교차로 이름, 구 이름, 신호 상황 등 자유롭게 질문해보세요.\n예) '잠실역 교차로 어때?' / '강남구 막히는 곳은?'",
  },
];

const PRESETS = [
  { label: "잠실역 현황",  q: "잠실역 교차로 현재 교통 상황 알려줘" },
  { label: "병목 TOP3",    q: "지금 가장 막히는 교차로 3곳 알려줘" },
  { label: "신호 최적화",  q: "현재 가장 정체가 심한 교차로의 신호 조정 방법을 알려줘" },
];

const STEP_LABEL = {
  thought:     "생각",
  action:      "도구 사용",
  observation: "결과 확인",
};

function StepItem({ step }) {
  const label = STEP_LABEL[step.type] ?? step.type;
  const text = step.type === "action"
    ? (step.tool ? `${step.tool}${step.args ? `(${step.args})` : ""}` : step.content ?? "")
    : (step.content ?? "");

  return (
    <div style={{
      padding: "4px 0",
      animation: "fadeSlideIn .18s ease",
      fontFamily: "system-ui,-apple-system,sans-serif",
    }}>
      <span style={{
        fontSize: 11,
        color: "rgba(255,255,255,0.35)",
        marginRight: 6,
        letterSpacing: ".2px",
      }}>
        {label}
      </span>
      <span style={{
        fontSize: 11,
        color: "rgba(255,255,255,0.55)",
        lineHeight: 1.5,
        wordBreak: "break-all",
      }}>
        {text.length > 100 ? text.slice(0, 100) + "…" : text}
      </span>
    </div>
  );
}

function PopupDots() {
  return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 4, height: 4, borderRadius: "50%",
          background: "rgba(255,255,255,0.4)",
          display: "inline-block",
          animation: `popupBlink 1.2s ease ${i * 0.2}s infinite`,
        }} />
      ))}
    </span>
  );
}

function ReactPopup({ steps, loading, onClose }) {
  const bottomRef = useRef(null);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [steps]);

  return (
    <>
      {/* 오버레이 */}
      <div
        onClick={loading ? undefined : onClose}
        style={{
          position: "fixed", inset: 0, zIndex: 9998,
          background: "rgba(0,0,0,0.45)", backdropFilter: "blur(4px)",
        }}
      />
      {/* 팝업 */}
      <div style={{
        position: "fixed", top: "50%", left: "50%", zIndex: 9999,
        transform: "translate(-50%, -50%)",
        width: 480, maxWidth: "90vw",
        background: "rgba(18,18,18,0.82)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: 12,
        overflow: "hidden",
        boxShadow: "0 16px 64px rgba(0,0,0,0.7)",
      }}>
        {/* 헤더 */}
        <div style={{
          display: "flex", alignItems: "center", gap: 8,
          padding: "14px 18px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
        }}>
          {loading && <PopupDots />}
          <span style={{
            fontSize: 13, color: "rgba(255,255,255,0.6)",
            fontFamily: "system-ui,sans-serif", flex: 1,
          }}>
            {loading ? "추론 중" : "추론 완료"}
          </span>
          {!loading && (
            <button
              onClick={onClose}
              style={{
                background: "none", border: "none",
                color: "rgba(255,255,255,0.3)", fontSize: 14,
                cursor: "pointer", padding: "0 2px", lineHeight: 1,
              }}
            >✕</button>
          )}
        </div>

        {/* 스텝 목록 */}
        <div style={{
          display: "flex", flexDirection: "column",
          maxHeight: 360, overflowY: "auto",
          padding: "12px 18px",
          gap: 2,
        }}>
          {steps.length === 0 && (
            <div style={{
              fontSize: 11, color: "rgba(255,255,255,0.25)",
              padding: "4px 0",
              fontFamily: "system-ui,sans-serif",
            }}>
              시작 중...
            </div>
          )}
          {steps.map((step, i) => <StepItem key={i} step={step} />)}
          <div ref={bottomRef} />
        </div>

        {/* 하단 진행바 */}
        {loading && (
          <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }}>
            <div style={{
              height: "100%",
              background: "rgba(255,255,255,0.18)",
              animation: "popupProgressBar 2.4s ease infinite",
            }} />
          </div>
        )}

        {/* 카운터 */}
        <div style={{
          padding: "8px 18px",
          fontSize: 11, color: "rgba(255,255,255,0.2)",
          textAlign: "right",
          fontFamily: "system-ui,sans-serif",
        }}>
          {steps.length}단계
        </div>
      </div>

      {/* 키프레임 */}
      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateY(4px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes popupBlink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.2; }
        }
        @keyframes popupProgressBar {
          0%   { width: 0%; }
          60%  { width: 75%; }
          100% { width: 92%; }
        }
      `}</style>
    </>
  );
}

export default function AIChatBot({ selected }) {
  const [isOpen,    setIsOpen]    = useState(false);
  const [messages,  setMessages]  = useState(INITIAL_MSG);
  const [input,     setInput]     = useState("");
  const [loading,   setLoading]   = useState(false);
  const [steps,     setSteps]     = useState([]);
  const [showPopup, setShowPopup] = useState(false);

  const sendChat = useCallback(async (preset) => {
    const q = (preset ?? input).trim();
    if (!q || loading) return;

    setMessages(prev => [...prev, { role: "user", text: q }]);
    setInput("");
    setLoading(true);
    setSteps([]);
    setShowPopup(true);

    try {
      const res = await fetch(`${PYTHON_BASE}/api/agent/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          crsrdId:   selected?.crsrdId ?? null,
          userEmail: JSON.parse(localStorage.getItem("ts_user") || "{}").email || null,
        }),
      });

      const reader  = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

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
            setMessages(prev => [...prev, { role: "ai", text: data.content }]);
            setShowPopup(false);
          } else if (data.type === "error") {
            setMessages(prev => [...prev, { role: "ai", text: `오류: ${data.content}` }]);
            setShowPopup(false);
          } else {
            setSteps(prev => [...prev, data]);
          }
        }
      }
    } catch (err) {
      setMessages(prev => [...prev, { role: "ai", text: `오류: ${err.message}` }]);
      setShowPopup(false);
    } finally {
      setLoading(false);
    }
  }, [input, loading, selected]);

  return (
    <>
      {showPopup && (
        <ReactPopup
          steps={steps}
          loading={loading}
          onClose={() => !loading && setShowPopup(false)}
        />
      )}

      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>

        {/* 토글 버튼 */}
        <button
          onClick={() => setIsOpen(o => !o)}
          style={{
            width: 52, height: 52, borderRadius: "50%",
            background: isOpen ? "#4ea6ff" : "rgba(18,16,10,0.92)",
            border: `2px solid ${isOpen ? "#4ea6ff" : "rgba(78,166,255,0.5)"}`,
            boxShadow: isOpen ? "0 0 16px rgba(78,166,255,0.6)" : "0 2px 12px rgba(0,0,0,0.7)",
            cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, transition: "all .2s", flexShrink: 0,
          }}
          title={isOpen ? "챗봇 닫기" : "AI 교통 분석 챗봇"}
        >
          {isOpen ? "✕" : "🤖"}
        </button>

        {/* 챗봇 패널 */}
        {isOpen && (
          <div style={{
            width: 380,
            background: "rgba(18,16,10,0.85)",
            border: "1px solid rgba(42,36,24,0.8)",
            borderRadius: 4, padding: "20px 24px",
            backdropFilter: "blur(6px)",
            display: "flex", flexDirection: "column", gap: 10,
          }}>

            {/* 헤더 */}
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 18, fontWeight: 700, color: "#e7ecf5" }}>
                🤖 <span style={{ color: "#4ea6ff" }}>AI 교통 어시스턴트</span>
              </span>
              {selected && (
                <span style={{ marginLeft: "auto", fontSize: 12, color: "#7a7a7a", fontFamily: "monospace" }}>
                  ● {selected.crsrdNm}
                </span>
              )}
            </div>

            {/* 프리셋 버튼 */}
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
              {PRESETS.map(({ label, q }) => (
                <button key={label}
                  onClick={() => sendChat(q)}
                  disabled={loading}
                  style={{
                    padding: "6px 14px", fontSize: 13, borderRadius: 4,
                    border: "1px solid #2a3a5a",
                    background: loading ? "transparent" : "rgba(78,166,255,0.1)",
                    color: loading ? "#3a3a3a" : "#4ea6ff",
                    cursor: loading ? "default" : "pointer",
                    fontFamily: "inherit",
                  }}>
                  {label}
                </button>
              ))}
            </div>

            {/* 메시지 목록 */}
            <div style={{
              flex: 1, overflowY: "auto",
              display: "flex", flexDirection: "column", gap: 6,
              maxHeight: 360, minHeight: 140,
            }}>
              {messages.map((m, i) => (
                <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                  <div style={{
                    maxWidth: "92%", padding: "10px 14px", borderRadius: 2,
                    background: m.role === "user" ? "rgba(78,166,255,0.15)" : "rgba(255,255,255,0.04)",
                    border: `1px solid ${m.role === "user" ? "#2a3a5a" : "#1a1a1a"}`,
                    fontSize: 14, lineHeight: 1.8, whiteSpace: "pre-line", color: "#e7ecf5",
                  }}>
                    {m.role === "ai" && (
                      <div style={{ fontSize: 12, color: "#4ea6ff", marginBottom: 4, fontWeight: 600 }}>
                        Qwen3 분석
                      </div>
                    )}
                    {m.text}
                  </div>
                </div>
              ))}

              {loading && (
                <div style={{ display: "flex", justifyContent: "flex-start" }}>
                  <div style={{
                    padding: "10px 14px", borderRadius: 2,
                    background: "rgba(255,255,255,0.04)", border: "1px solid #1a1a1a",
                    fontSize: 13, color: "#4ea6ff",
                  }}>
                    에이전트 분석 중...
                  </div>
                </div>
              )}
            </div>

            {/* 입력창 */}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !loading && sendChat()}
                placeholder="자유롭게 질문하세요..."
                disabled={loading}
                style={{
                  flex: 1, background: "rgba(255,255,255,0.04)",
                  border: "1px solid #1a1a1a", borderRadius: 2,
                  padding: "10px 14px", color: "#e7ecf5", fontSize: 14,
                  outline: "none", fontFamily: "inherit",
                  opacity: loading ? 0.6 : 1,
                }}
              />
              <button
                onClick={() => sendChat()}
                disabled={loading}
                style={{
                  padding: "10px 20px", borderRadius: 2,
                  background: loading ? "#1a1a1a" : "#4ea6ff",
                  border: "none",
                  color: loading ? "#3a3a3a" : "#000",
                  fontSize: 15, fontWeight: 700,
                  cursor: loading ? "default" : "pointer",
                  fontFamily: "inherit",
                }}>
                전송
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
