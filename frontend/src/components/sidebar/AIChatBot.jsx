import { useState, useCallback, useEffect } from "react";
import { AI_RESPONSES } from "../../constants/aiResponses";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

const INITIAL_MSG = [
  {
    role: "ai",
    text: "안녕하세요! 서울 교통 AI 어시스턴트입니다.\n교차로 이름, 구 이름, 신호 상황 등 자유롭게 질문해보세요.\n예) '잠실역 교차로 어때?' / '강남구 막히는 곳은?'",
  },
];

const PRESETS = [
  { label: "잠실역 현황", q: "잠실역 교차로 현재 교통 상황 알려줘" },
  { label: "병목 TOP3",   q: "지금 가장 막히는 교차로 3곳 알려줘" },
  { label: "신호 최적화", q: "현재 가장 정체가 심한 교차로의 신호 조정 방법을 알려줘" },
];

/**
 * AIChatBot — 통합 자유 챗봇
 * 교차로 선택 없이도 자유 질문 가능.
 * Spring Boot /api/chat → Python 에이전트 → Ollama (qwen3) → MCP 도구 활용
 *
 * @param {Object} [selected] - 선택된 교차로 (있으면 컨텍스트로 전달)
 */
export default function AIChatBot({ selected }) {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState(INITIAL_MSG);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  const sendChat = useCallback(async (preset) => {
    const q = (preset ?? input).trim();
    if (!q || loading) return;

    setMessages(prev => [...prev, { role: "user", text: q }]);
    setInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          crsrdId: selected?.crsrdId ?? null,
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setMessages(prev => [...prev, { role: "ai", text: data.answer }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: "ai", text: `오류: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, selected]);

  return (
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

          {/* 빠른 질문 버튼 */}
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
                <div style={{ padding: "10px 14px", borderRadius: 2, background: "rgba(255,255,255,0.04)", border: "1px solid #1a1a1a", fontSize: 13, color: "#4ea6ff" }}>
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
  );
}
