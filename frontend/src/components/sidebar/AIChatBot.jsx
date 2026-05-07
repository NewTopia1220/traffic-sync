import { useState, useCallback, useEffect } from "react";
import { AI_RESPONSES } from "../../constants/aiResponses";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

export default function AIChatBot({ selected }) {
  const [chatMessages, setChatMessages] = useState(AI_RESPONSES.default);
  const [chatInput, setChatInput] = useState("");
  const [loading, setLoading] = useState(false);

  // 교차로 바뀔 때 챗 초기화
  useEffect(() => {
    if (!selected) return;
    setChatMessages([
      {
        role: "ai",
        text: `[${selected.crsrdNm}] 선택됨.\n위험도 ${selected.riskScore}점 / ${selected.congestion} / 평균대기 ${selected.avgWait}초`,
      },
    ]);
  }, [selected?.crsrdId]);

  const sendChat = useCallback(async () => {
    const q = chatInput.trim();
    if (!q) return;

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
  }, [chatInput, selected]);

  const panel = {
    background: "rgba(14,20,36,0.9)",
    border: "1px solid rgba(59,130,246,0.2)",
    borderRadius: 10,
    padding: "14px 16px",
    flex: 1,
    display: "flex",
    flexDirection: "column",
  };

  return (
    <div style={panel}>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>
        🤖 <span style={{ color: "#60a5fa" }}>AI 교통 분석 챗봇</span>
      </div>
      {selected
        ? <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 8 }}>
            ● {selected.crsrdNm} · 위험도 {selected.riskScore}점 · 대기 {selected.avgWait}초
          </div>
        : <div style={{ fontSize: 12, color: "#374151", marginBottom: 8 }}>교차로를 클릭하면 분석 시작</div>
      }

      {/* 빠른 질문 버튼 */}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 8 }}>
        {["신호 최적화", "위험도 분석", "우회로 제안"].map(q => (
          <button key={q} onClick={() => setChatInput(q)}
            style={{ padding: "3px 10px", fontSize: 11, borderRadius: 5, border: "1px solid rgba(59,130,246,0.3)", background: "rgba(29,78,216,0.1)", color: "#93c5fd", cursor: "pointer", fontFamily: "inherit" }}>
            {q}
          </button>
        ))}
      </div>

      {/* 메시지 목록 */}
      <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, marginBottom: 10, maxHeight: 200, minHeight: 80 }}>
        {chatMessages.map((m, i) => (
          <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
            <div style={{
              maxWidth: "88%", padding: "8px 11px",
              borderRadius: m.role === "user" ? "10px 10px 2px 10px" : "10px 10px 10px 2px",
              background: m.role === "user" ? "rgba(29,78,216,0.5)" : "rgba(30,38,55,0.9)",
              border: `1px solid ${m.role === "user" ? "rgba(59,130,246,0.3)" : "rgba(255,255,255,0.07)"}`,
              fontSize: 12, lineHeight: 1.7, whiteSpace: "pre-line",
            }}>
              {m.role === "ai" && <div style={{ fontSize: 10, color: "#60a5fa", marginBottom: 3, fontWeight: 600 }}>AI 분석</div>}
              {m.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display: "flex", justifyContent: "flex-start" }}>
            <div style={{ padding: "8px 14px", borderRadius: "10px 10px 10px 2px", background: "rgba(30,38,55,0.9)", border: "1px solid rgba(255,255,255,0.07)", fontSize: 12, color: "#60a5fa" }}>
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
          style={{ flex: 1, background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 7, padding: "8px 11px", color: "#e2e8f0", fontSize: 13, outline: "none", fontFamily: "inherit", opacity: loading ? 0.6 : 1 }}
        />
        <button onClick={sendChat} disabled={loading}
          style={{ padding: "8px 14px", borderRadius: 7, background: loading ? "#374151" : "#1d4ed8", border: "none", color: "#fff", fontSize: 13, fontWeight: 600, cursor: loading ? "default" : "pointer", fontFamily: "inherit" }}>
          전송
        </button>
      </div>
    </div>
  );
}
