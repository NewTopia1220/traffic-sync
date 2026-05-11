import { useState, useCallback, useEffect } from "react";
import { AI_RESPONSES } from "../../constants/aiResponses";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

export default function AIChatBot({ selected }) {
  const [chatMessages, setChatMessages] = useState(AI_RESPONSES.default);
  const [chatInput, setChatInput] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selected) return;
    setChatMessages([
      {
        role: "ai",
        text: `[${selected.crsrdNm}] 선택됨.\n위험도 ${selected.riskScore}점 / ${selected.congestion} / 평균대기 ${selected.avgWait}초`,
      },
    ]);
  }, [selected?.crsrdId]);

  const sendChat = useCallback(async (preset) => {
    const q = (preset ?? chatInput).trim();
    if (!q || loading) return;

    setChatMessages(prev => [...prev, { role: "user", text: q }]);
    setChatInput("");
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crsrdId: selected?.crsrdId ?? null, question: q }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setChatMessages(prev => [...prev, { role: "ai", text: data.answer }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: "ai", text: `오류: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }, [chatInput, loading, selected]);

  return (
    <div style={{
      background: "rgba(18,16,10,0.75)", border: "1px solid rgba(42,36,24,0.8)",
      borderRadius: 4, padding: "14px 16px", backdropFilter: "blur(6px)",
      display: "flex", flexDirection: "column",
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4, color: "#e7ecf5" }}>
        🤖 <span style={{ color: "#4ea6ff" }}>AI 교통 분석 챗봇</span>
      </div>
      {selected
        ? <div style={{ fontSize: 12, color: "#7a7a7a", marginBottom: 8 }}>
            ● {selected.crsrdNm} · 위험도 {selected.riskScore}점 · 대기 {selected.avgWait}초
          </div>
        : <div style={{ fontSize: 12, color: "#3a3a3a", marginBottom: 8 }}>교차로를 클릭하면 분석 시작</div>
      }

      {/* 빠른 질문 버튼 */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
        {[
          { label: "신호 최적화", q: "이 교차로의 신호를 최적화하는 방법을 분석해줘" },
          { label: "위험도 분석", q: "이 교차로의 위험 요인과 사고 위험도를 분석해줘" },
          { label: "우회로 제안", q: "이 교차로 혼잡 시 추천 우회로를 알려줘" },
        ].map(({ label, q }) => (
          <button key={label}
            onClick={() => sendChat(q)}
            disabled={loading || !selected}
            style={{
              padding: "4px 11px", fontSize: 11, borderRadius: 2,
              border: `1px solid ${selected && !loading ? "#2a3a5a" : "#1a1a1a"}`,
              background: selected && !loading ? "rgba(78,166,255,0.1)" : "transparent",
              color: selected && !loading ? "#4ea6ff" : "#3a3a3a",
              cursor: selected && !loading ? "pointer" : "default",
              fontFamily: "inherit",
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* 메시지 목록 */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, marginBottom: 10, maxHeight: 200, minHeight: 80 }}>
        {chatMessages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "88%", padding: "8px 11px",
              borderRadius: 2,
              background: m.role === "user" ? "rgba(78,166,255,0.15)" : "rgba(255,255,255,0.04)",
              border: `1px solid ${m.role === "user" ? "#2a3a5a" : "#1a1a1a"}`,
              fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-line", color: "#e7ecf5",
            }}>
              {m.role === "ai" && <div style={{ fontSize: 10, color: "#4ea6ff", marginBottom: 3, fontWeight: 600 }}>AI 분석</div>}
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "8px 14px", borderRadius: 2, background: "rgba(255,255,255,0.04)", border: "1px solid #1a1a1a", fontSize: 12, color: "#4ea6ff" }}>
              분석 중...
            </div>
          </div>
        )}
      </div>

      {/* 입력창 */}
      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={chatInput}
          onChange={e => setChatInput(e.target.value)}
          onKeyDown={e => e.key === "Enter" && !loading && sendChat()}
          placeholder="추가 질문 입력..."
          disabled={loading}
          style={{ flex: 1, background: "rgba(255,255,255,0.04)", border: "1px solid #1a1a1a", borderRadius: 2, padding: "8px 11px", color: "#e7ecf5", fontSize: 13, outline: "none", fontFamily: "inherit", opacity: loading ? 0.6 : 1 }}
        />
        <button onClick={sendChat} disabled={loading}
          style={{ padding: "8px 14px", borderRadius: 2, background: loading ? "#1a1a1a" : "#4ea6ff", border: "none", color: loading ? "#3a3a3a" : "#000", fontSize: 13, fontWeight: 700, cursor: loading ? "default" : "pointer", fontFamily: "inherit" }}>
          전송
        </button>
      </div>
    </div>
  );
}
