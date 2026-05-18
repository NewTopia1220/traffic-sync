import { useState, useCallback, useEffect } from "react";
import { AI_RESPONSES } from "../../constants/aiResponses";

// 스프링 REST API 주소 (.env의 VITE_API_URL)
const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8080").replace(/\/+$/, "");

/**
 * AIChatBot 컴포넌트
 *
 * 🤖 버튼 클릭으로 패널 열기/닫기 (토글)
 * 선택된 교차로 데이터를 컨텍스트로 스프링 /api/chat에 POST
 * 스프링 → TrafficStatus(신호+속도+위험도 통합 상태) → Groq llama-3.3-70b → 답변
 *
 * 토글 구조:
 *   isOpen: false → 🤖 버튼만 표시 (패널 DOM 없음)
 *   isOpen: true  → 🤖→✕ 버튼 + 패널 마운트
 *   패널 닫을 때 언마운트 → chatMessages 초기화 (매번 새 대화 시작)
 *
 * @param {Object} selected - 선택된 교차로 (crsrdId, crsrdNm, riskScore, congestion, avgWait)
 */
export default function AIChatBot({ selected }) {
  // 패널 열림/닫힘 여부 (기본: 닫힌 상태)
  const [isOpen, setIsOpen] = useState(false);
  // 채팅 메시지 배열 [{ role: "ai"|"user", text: string }]
  // 초기값: aiResponses.js의 default 메시지
  const [chatMessages, setChatMessages] = useState(AI_RESPONSES.default);
  // 입력창 텍스트
  const [chatInput, setChatInput] = useState("");
  // API 호출 중 여부 (중복 전송 방지 + UI 비활성화)
  const [loading, setLoading] = useState(false);

  // ── 교차로 변경 시 채팅 초기화 ────────────────────────────────────────────
  // selected.crsrdId 기준으로 실행 (같은 교차로의 신호 갱신은 초기화 안 함)
  // 새 교차로 선택 시 해당 교차로의 기본 정보로 채팅 리셋
  useEffect(() => {
    if (!selected) return;
    const riskText = selected.riskScore == null ? "수집 대기" : `${selected.riskScore}점`;
    const waitText = selected.avgWait == null ? "수집 대기" : `${selected.avgWait}초`;
    setChatMessages([
      {
        role: "ai",
        text: `[${selected.crsrdNm}] 선택됨.\n위험도 ${riskText} / ${selected.congestion} / 평균대기 ${waitText}`,
      },
    ]);
  }, [selected?.crsrdId]);

  // ── sendChat: 메시지 전송 함수 ────────────────────────────────────────────
  /**
   * @param {string} [preset] - 빠른 질문 버튼 클릭 시 미리 정해진 질문 텍스트
   *                            없으면 chatInput 사용
   *
   * 전송 흐름:
   * 1. 사용자 메시지 즉시 UI에 추가 (낙관적 업데이트)
   * 2. POST /api/chat → 스프링 ChatController
   * 3. 스프링: TrafficCacheService에서 교차로 TrafficStatus 조회
   *           → 실제 보조 API 캐시를 합쳐 챗봇 프롬프트 생성
   *           → ChatService → Groq API 호출
   * 4. 응답 data.answer를 AI 메시지로 추가
   * 5. 실패 시 에러 메시지 표시
   */
  const sendChat = useCallback(async (preset) => {
    const q = (preset ?? chatInput).trim();
    if (!q || loading) return; // 빈 문자열이거나 이미 요청 중이면 무시

    // 사용자 메시지 즉시 표시 (응답 대기 전에 먼저 보임)
    setChatMessages(prev => [...prev, { role: "user", text: q }]);
    setChatInput(""); // 입력창 초기화
    setLoading(true);

    try {
      // crsrdId: 선택된 교차로 없으면 null → 스프링이 buildDefaultContext() 사용
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ crsrdId: selected?.crsrdId ?? null, question: q }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      // 스프링 응답: { answer: "AI 분석 결과 텍스트" }
      setChatMessages(prev => [...prev, { role: "ai", text: data.answer }]);
    } catch (err) {
      setChatMessages(prev => [...prev, { role: "ai", text: `오류: ${err.message}` }]);
    } finally {
      setLoading(false);
    }
  }, [chatInput, loading, selected]);
  // useCallback 의존성: chatInput(입력값), loading(중복방지), selected(교차로 ID 전달)

  return (
    // 최상위 wrapper: 세로 flex + 우측 정렬
    // alignItems:"flex-end" → 버튼과 패널 모두 오른쪽 끝에 정렬
    // MapDashboard에서 이 컴포넌트가 right:14에 고정되어 있어 자연스럽게 우측 정렬됨
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>

      {/* ── 토글 버튼 (항상 표시) ── */}
      {/* 클릭: isOpen 토글 (o => !o 함수형 업데이트로 최신 state 보장) */}
      {/* 열림: 파란 배경 + glow / 닫힘: 어두운 반투명 + 일반 그림자 */}
      <button
        onClick={() => setIsOpen(o => !o)}
        style={{
          width: 52, height: 52, borderRadius: "50%",
          background: isOpen ? "#4ea6ff" : "rgba(18,16,10,0.92)",
          border: `2px solid ${isOpen ? "#4ea6ff" : "rgba(78,166,255,0.5)"}`,
          boxShadow: isOpen
            ? "0 0 16px rgba(78,166,255,0.6)"  // 열림: 파란 발광 효과
            : "0 2px 12px rgba(0,0,0,0.7)",     // 닫힘: 일반 그림자
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 22, transition: "all .2s", flexShrink: 0,
        }}
        title={isOpen ? "챗봇 닫기" : "AI 교통 분석 챗봇"}
      >
        {/* 열림: ✕ / 닫힘: 🤖 */}
        {isOpen ? "✕" : "🤖"}
      </button>

      {/* ── 챗봇 패널 (isOpen일 때만 마운트) ── */}
      {/* {isOpen && ...} 패턴: false면 DOM에서 완전히 제거됨
          → 닫을 때 chatMessages 등 내부 state 모두 사라짐
          → 다시 열면 AI_RESPONSES.default부터 새로 시작 */}
      {isOpen && (
        <div style={{
          background: "rgba(18,16,10,0.75)",
          border: "1px solid rgba(42,36,24,0.8)",
          borderRadius: 4, padding: "20px 24px",
          backdropFilter: "blur(6px)", // 지도 위 반투명 패널 효과
          display: "flex", flexDirection: "column",
        }}>

          {/* 패널 제목 */}
          <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 10, color: "#e7ecf5" }}>
            🤖 <span style={{ color: "#4ea6ff" }}>AI 교통 분석 챗봇</span>
          </div>

          {/* 현재 선택 교차로 정보 / 안내 문구 */}
          {selected
            ? <div style={{ fontSize: 15, color: "#7a7a7a", marginBottom: 10 }}>
                ● {selected.crsrdNm} · 위험도 {selected.riskScore == null ? "수집 대기" : `${selected.riskScore}점`} · 대기 {selected.avgWait == null ? "수집 대기" : `${selected.avgWait}초`}
              </div>
            : <div style={{ fontSize: 15, color: "#3a3a3a", marginBottom: 10 }}>
                교차로를 클릭하면 분석 시작
              </div>
          }

          {/* ── 빠른 질문 버튼 ── */}
          {/* preset 텍스트를 sendChat에 직접 전달 → 입력창 없이 바로 전송 */}
          {/* selected 없거나 loading 중이면 비활성화 (disabled + 회색) */}
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
                  padding: "8px 18px", fontSize: 14, borderRadius: 4,
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

          {/* ── 메시지 목록 ── */}
          {/* overflowY:"auto": 메시지 많아지면 패널 안에서 스크롤 */}
          {/* maxHeight:340 / minHeight:140: 패널 높이 범위 제한 */}
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 6, marginBottom: 10, maxHeight: 340, minHeight: 140 }}>
            {chatMessages.map((m, i) => (
              // 사용자: 오른쪽 정렬 / AI: 왼쪽 정렬
              <div key={i} style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                <div style={{
                  maxWidth: "90%", padding: "12px 16px",
                  borderRadius: 2,
                  // 사용자 말풍선: 파란 반투명 / AI 말풍선: 흰 반투명
                  background: m.role === "user" ? "rgba(78,166,255,0.15)" : "rgba(255,255,255,0.04)",
                  border: `1px solid ${m.role === "user" ? "#2a3a5a" : "#1a1a1a"}`,
                  fontSize: 15, lineHeight: 1.9,
                  whiteSpace: "pre-line", // \n을 줄바꿈으로 처리
                  color: "#e7ecf5",
                }}>
                  {/* AI 메시지에만 "AI 분석" 라벨 표시 */}
                  {m.role === "ai" && (
                    <div style={{ fontSize: 13, color: "#4ea6ff", marginBottom: 5, fontWeight: 600 }}>
                      AI 분석
                    </div>
                  )}
                  {m.text}
                </div>
              </div>
            ))}

            {/* API 호출 중 로딩 표시 */}
            {loading && (
              <div style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ padding: "10px 16px", borderRadius: 2, background: "rgba(255,255,255,0.04)", border: "1px solid #1a1a1a", fontSize: 14, color: "#4ea6ff" }}>
                  분석 중...
                </div>
              </div>
            )}
          </div>

          {/* ── 입력창 + 전송 버튼 ── */}
          <div style={{ display: "flex", gap: 8 }}>
            <input
              value={chatInput}
              onChange={e => setChatInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && !loading && sendChat()} // 엔터로 전송
              placeholder="추가 질문 입력..."
              disabled={loading} // API 호출 중 입력 비활성화
              style={{
                flex: 1, background: "rgba(255,255,255,0.04)",
                border: "1px solid #1a1a1a", borderRadius: 2,
                padding: "12px 16px", color: "#e7ecf5", fontSize: 15,
                outline: "none", fontFamily: "inherit",
                opacity: loading ? 0.6 : 1, // 로딩 중 희미하게
              }}
            />
            {/* 전송 버튼: 로딩 중 회색/비활성 / 평상시 파란 배경 */}
            <button
              onClick={sendChat}
              disabled={loading}
              style={{
                padding: "12px 22px", borderRadius: 2,
                background: loading ? "#1a1a1a" : "#4ea6ff",
                border: "none",
                color: loading ? "#3a3a3a" : "#000",
                fontSize: 16, fontWeight: 700,
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
