import { useState, useCallback, useRef, useEffect } from "react";
import { useClapDetection } from "../../hooks/useClapDetection";
import { ThinkingBlock, InlineSteps } from "./ChatSteps";

const PYTHON_BASE    = import.meta.env.VITE_PYTHON_URL    || "http://localhost:8001";
const GOOGLE_TTS_KEY = import.meta.env.VITE_GOOGLE_TTS_KEY || "";

const INITIAL_MSG = [
  {
    role: "ai",
    text: "안녕하세요! 서울 교통 AI 어시스턴트입니다.\n마이크 버튼을 눌러 음성으로 질문하거나 직접 입력하세요.\n예) '잠실역 교차로 어때?' / '강남구 막히는 곳은?'",
    steps: [],
  },
];

const PRESETS = [
  { label: "병목 TOP3",   q: "지금 가장 막히는 교차로 3곳 알려줘" },
  { label: "신호 최적화", q: "현재 가장 정체가 심한 교차로의 신호 조정 방법을 알려줘" },
  { label: "날씨 현황",   q: "현재 날씨 상황이 교통에 어떤 영향을 미치고 있어?" },
];

// 마크다운 기호 제거 (TTS 읽기 전처리 — 링크 텍스트도 풀어줌)
function stripMarkdown(text) {
  return text
    .replace(/#{1,6}\s/g, "")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/`(.*?)`/g, "$1")
    .replace(/\[(.*?)\]\(.*?\)/g, "$1")
    .trim();
}

const MSG_STORAGE_KEY       = 'ts_chatbot_messages';
const COLLAPSED_STORAGE_KEY = 'ts_chatbot_collapsed';
const LIVE_STORAGE_KEY      = 'ts_chatbot_live';

export default function AIChatBot({ selected, onClose }) {
  const [messages, setMessages] = useState(() => {
    try {
      const saved = sessionStorage.getItem(MSG_STORAGE_KEY);
      return saved ? JSON.parse(saved) : INITIAL_MSG;
    } catch { return INITIAL_MSG; }
  });
  const [input,          setInput]          = useState("");
  const [loading,        setLoading]        = useState(false);
  // 스트리밍 중단 복원: 마지막으로 저장된 liveSteps부터 시작
  const [liveSteps, setLiveSteps] = useState(() => {
    try {
      const saved = sessionStorage.getItem(LIVE_STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch { return []; }
  });
  // 접힘 상태 복원: 닫았다 열어도 펼쳐진 추론은 그대로 유지
  const [collapsedSteps, setCollapsedSteps] = useState(() => {
    try {
      const saved = sessionStorage.getItem(COLLAPSED_STORAGE_KEY);
      return saved ? JSON.parse(saved) : {};
    } catch { return {}; }
  });
  const [listening,      setListening]      = useState(false);
  const [speaking,       setSpeaking]       = useState(false);

  const bottomRef       = useRef(null);
  const inputRef        = useRef(null);
  const audioRef        = useRef(null);
  const actionAudioRef  = useRef(null);
  const recognitionRef  = useRef(null);
  const abortCtrlRef    = useRef(null);  // 진행 중인 SSE fetch abort용
  const userStoppedRef  = useRef(false); // 사용자가 직접 정지 버튼 눌렀는지

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, liveSteps]);

  // 세션 유지 — 닫았다 열어도 메시지·추론·접힘 상태 모두 보존
  useEffect(() => {
    try { sessionStorage.setItem(MSG_STORAGE_KEY, JSON.stringify(messages)); } catch {}
  }, [messages]);

  useEffect(() => {
    try {
      if (liveSteps.length > 0) sessionStorage.setItem(LIVE_STORAGE_KEY, JSON.stringify(liveSteps));
      else sessionStorage.removeItem(LIVE_STORAGE_KEY);
    } catch {}
  }, [liveSteps]);

  useEffect(() => {
    try { sessionStorage.setItem(COLLAPSED_STORAGE_KEY, JSON.stringify(collapsedSteps)); } catch {}
  }, [collapsedSteps]);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  // ── TTS: Google Cloud Text-to-Speech ──────────────────────────────
  // 공통 TTS 요청 함수
  async function _tts(text, rate = 1.05) {
    if (!GOOGLE_TTS_KEY || !text) return null;
    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text: stripMarkdown(text).slice(0, 4500) },
          voice: { languageCode: "ko-KR", name: "ko-KR-Neural2-C", ssmlGender: "MALE" },
          audioConfig: { audioEncoding: "MP3", speakingRate: rate },
        }),
      }
    );
    const data = await res.json();
    return data.audioContent || null;
  }

  // 전체 답변 TTS (자동재생)
  const speakText = useCallback(async (text) => {
    if (!GOOGLE_TTS_KEY || !text) return;
    stopSpeaking();
    setSpeaking(true);
    window.__chatbotSpeaking = true;
    try {
      const content = await _tts(text, 1.05);
      if (content) {
        const audio = new Audio(`data:audio/mp3;base64,${content}`);
        audioRef.current = audio;
        audio.onended = () => { setSpeaking(false); window.__chatbotSpeaking = false; };
        audio.play();
      } else { setSpeaking(false); window.__chatbotSpeaking = false; }
    } catch { setSpeaking(false); window.__chatbotSpeaking = false; }
  }, []);

  // 도구 호출 알림 TTS — 이전 도구 알림 즉시 교체 (큐 없음)
  const speakAction = useCallback(async (label) => {
    if (!GOOGLE_TTS_KEY || !label) return;
    try {
      const content = await _tts(label, 1.4);
      if (content) {
        if (actionAudioRef.current) {
          actionAudioRef.current.pause();
          actionAudioRef.current = null;
        }
        const audio = new Audio(`data:audio/mp3;base64,${content}`);
        actionAudioRef.current = audio;
        audio.play();
      }
    } catch { /* 무시 */ }
  }, []);

  function stopSpeaking() {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setSpeaking(false);
    window.__chatbotSpeaking = false;
  }

  // ── STT: Web Speech API ───────────────────────────────────────────
  const startListening = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      alert("음성 인식은 Chrome 브라우저에서만 지원됩니다.");
      return;
    }
    stopSpeaking();
    const rec = new SR();
    rec.lang            = "ko-KR";
    rec.interimResults  = false;
    rec.maxAlternatives = 1;

    rec.onstart  = () => setListening(true);
    rec.onend    = () => setListening(false);
    rec.onerror  = () => setListening(false);
    rec.onresult = (e) => {
      // 인식 결과를 입력창에 채우기만 함 (전송은 사용자가 직접)
      setInput(e.results[0][0].transcript);
    };

    recognitionRef.current = rec;
    rec.start();
  }, []);

  function stopListening() {
    recognitionRef.current?.stop();
    setListening(false);
  }

  const toggleMic = useCallback(() => {
    if (listening) stopListening();
    else startListening();
  }, [listening, startListening]);

  // ── 박수 감지 (startListening 정의 이후에 위치해야 함) ──────────────
  // 박수 2번 = TTS 중단만 (마이크 시작은 수동 버튼으로)
  useClapDetection({
    enabled: true,
    requiredClaps: 2,
    clapWindowMs: 700,
    onDoubleClap: useCallback(() => {
      const isPlaying = !!(audioRef.current && !audioRef.current.paused)
      if (isPlaying) stopSpeaking();
    }, []),
  });

  // ── 채팅 전송 ─────────────────────────────────────────────────────
  const sendChat = useCallback(async (preset) => {
    const q = (preset ?? input).trim();
    if (!q || loading) return;
    await _send(q);
  }, [input, loading]);

  async function _send(q, retryCount = 0) {
    const MAX_RETRY = 2;
    // 최초 시도일 때만 유저 메시지 추가 (재시도 시 중복 방지)
    if (retryCount === 0) {
      setMessages(prev => [...prev, { role: "user", text: q, steps: [] }]);
    }
    setInput("");
    setLoading(true);
    setLiveSteps([]);
    try { sessionStorage.removeItem(LIVE_STORAGE_KEY); } catch {}

    const abortCtrl = new AbortController();
    abortCtrlRef.current = abortCtrl;
    userStoppedRef.current = false;  // 새 요청마다 초기화
    const abortTimer = setTimeout(() => abortCtrl.abort(), 90_000);

    try {
      const res = await fetch(`${PYTHON_BASE}/api/agent/chat/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question:  q,
          crsrdId:   selected?.crsrdId ?? null,
          userEmail: JSON.parse(localStorage.getItem("ts_user") || "{}").email || null,
        }),
        signal: abortCtrl.signal,
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
            speakText(data.content);
          } else if (data.type === "error") {
            setMessages(prev => [...prev, { role: "ai", text: `오류: ${data.content}`, steps: [] }]);
            setLiveSteps([]);
          } else {
            // 도구 호출 시 음성 알림
            if (data.type === "action" && data.label) {
              speakAction(data.label);
            }
            currentSteps = [...currentSteps, data];
            setLiveSteps([...currentSteps]);
          }
        }
      }
    } catch (err) {
      clearTimeout(abortTimer);
      // 사용자가 직접 정지 버튼 클릭 → 재시도 없이 종료
      if (err.name === "AbortError" && userStoppedRef.current) {
        setMessages(prev => [...prev, { role: "ai", text: "⏹ 생성이 중단되었습니다.", steps: [] }]);
        setLiveSteps([]);
        return;
      }
      if (err.name === "AbortError" && retryCount < MAX_RETRY) {
        // 90초 타임아웃 → 자동 재시도
        const attempt = retryCount + 1;
        setMessages(prev => [...prev, {
          role: "ai",
          text: `⏱ 응답 지연으로 재시도 중... (${attempt}/${MAX_RETRY})`,
          steps: [],
        }]);
        setLiveSteps([]);
        setLoading(false);
        await new Promise(r => setTimeout(r, 1000));
        await _send(q, attempt);
        return;
      }
      const msg = err.name === "AbortError"
        ? `⏱ ${MAX_RETRY}회 재시도했지만 응답이 없습니다. 잠시 후 다시 시도해주세요.`
        : `오류: ${err.message}`;
      setMessages(prev => [...prev, { role: "ai", text: msg, steps: [] }]);
      setLiveSteps([]);
    } finally {
      clearTimeout(abortTimer);
      abortCtrlRef.current = null;
      setLoading(false);
    }
  }

  const stopGeneration = () => {
    userStoppedRef.current = true;
    abortCtrlRef.current?.abort();
    // 백엔드에서 Ollama httpx 소켓 직접 차단
    fetch(`${PYTHON_BASE}/api/agent/stop`, { method: "POST" }).catch(() => {});
  };

  const toggleStep = (idx) => {
    setCollapsedSteps(prev => ({ ...prev, [idx]: !(prev[idx] ?? false) }));
  };

  return (
    <>
      <div style={{
        display: "flex", flexDirection: "column", flex: 1, minHeight: 0,
        background: "rgba(11,11,11,0.95)",
        borderLeft: "1px solid rgba(255,255,255,0.07)",
        fontFamily: "system-ui,-apple-system,sans-serif",
      }}>

        {/* 헤더 */}
        <div style={{
          padding: "12px 16px",
          borderBottom: "1px solid rgba(255,255,255,0.06)",
          display: "flex", alignItems: "center", gap: 8, flexShrink: 0,
        }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.72)" }}>
            AI 교통 어시스턴트
          </span>
          {selected && (
            <span style={{ fontSize: 11, color: "rgba(255,255,255,0.28)" }}>
              · {selected.crsrdNm}
            </span>
          )}
          {/* 재생 중 표시 */}
          {speaking && (
            <button onClick={stopSpeaking} title="음성 중지" style={{
              marginLeft: 4,
              background: "rgba(255,80,80,0.15)", border: "1px solid rgba(255,80,80,0.3)",
              borderRadius: 5, padding: "2px 8px",
              color: "rgba(255,120,120,0.9)", fontSize: 11, cursor: "pointer",
              display: "flex", alignItems: "center", gap: 4,
              fontFamily: "inherit",
            }}>
              <span style={{ animation: "chatDotBlink 1s ease infinite" }}>●</span> 재생 중 · 클릭해서 중지
            </button>
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
          display: "flex", gap: 5, flexWrap: "wrap", flexShrink: 0,
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
                  maxWidth: "80%", padding: "9px 13px",
                  borderRadius: "12px 12px 3px 12px",
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.07)",
                  fontSize: 13, lineHeight: 1.7,
                  color: "rgba(255,255,255,0.82)", whiteSpace: "pre-line",
                }}>
                  {m.text}
                </div>
              </div>
            ) : (
              <div key={idx} style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: "92%" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, paddingLeft: 2 }}>
                  <span style={{ fontSize: 10, color: "rgba(255,255,255,0.28)" }}>AI</span>
                  {/* 개별 메시지 TTS 재생 버튼 */}
                  {GOOGLE_TTS_KEY && (
                    <button
                      onClick={() => speakText(m.text)}
                      title="음성으로 듣기"
                      style={{
                        background: "none", border: "none",
                        color: "rgba(255,255,255,0.25)", fontSize: 11,
                        cursor: "pointer", padding: "0 2px",
                      }}
                    >
                      🔊
                    </button>
                  )}
                </div>
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
                  color: "rgba(255,255,255,0.72)", whiteSpace: "pre-line",
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

        {/* 입력 영역 */}
        <div style={{
          padding: "10px 16px 14px",
          borderTop: "1px solid rgba(255,255,255,0.06)",
          display: "flex", gap: 7, flexShrink: 0, alignItems: "center",
        }}>
          {/* 마이크 버튼 */}
          <button
            onClick={toggleMic}
            disabled={loading}
            title={listening ? "음성 인식 중단" : "음성으로 말하기"}
            style={{
              width: 36, height: 36, borderRadius: 8, flexShrink: 0,
              border: listening
                ? "1px solid rgba(255,80,80,0.6)"
                : "1px solid rgba(255,255,255,0.1)",
              background: listening
                ? "rgba(255,60,60,0.18)"
                : "rgba(255,255,255,0.05)",
              color: listening ? "rgba(255,100,100,0.9)" : "rgba(255,255,255,0.45)",
              fontSize: 13, cursor: loading ? "default" : "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
              animation: listening ? "micPulse 1s ease infinite" : "none",
              opacity: loading ? 0.4 : 1,
            }}
          >
            {listening ? "⏹" : "🎤"}
          </button>

          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !loading && sendChat()}
            placeholder={listening ? "듣는 중..." : "자유롭게 질문하세요..."}
            disabled={loading || listening}
            style={{
              flex: 1,
              background: "rgba(255,255,255,0.05)",
              border: listening
                ? "1px solid rgba(255,80,80,0.3)"
                : "1px solid rgba(255,255,255,0.08)",
              borderRadius: 8, padding: "9px 13px",
              color: "rgba(255,255,255,0.82)", fontSize: 13,
              outline: "none", fontFamily: "inherit",
              opacity: loading ? 0.5 : 1,
            }}
          />
          {loading ? (
            <button onClick={stopGeneration} style={{
              padding: "9px 14px", borderRadius: 8,
              background: "rgba(255,60,60,0.15)",
              border: "1px solid rgba(255,60,60,0.35)",
              color: "rgba(255,110,110,0.9)",
              fontSize: 13, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
              display: "flex", alignItems: "center", gap: 5,
            }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: "rgba(255,100,100,0.9)", display: "inline-block" }} />
              정지
            </button>
          ) : (
            <button onClick={() => sendChat()} style={{
              padding: "9px 16px", borderRadius: 8,
              background: "rgba(255,255,255,0.09)",
              border: "1px solid rgba(255,255,255,0.09)",
              color: "rgba(255,255,255,0.7)",
              fontSize: 13, fontWeight: 600,
              cursor: "pointer", fontFamily: "inherit",
            }}>
              전송
            </button>
          )}
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
        @keyframes micPulse {
          0%, 100% { box-shadow: 0 0 0 0 rgba(255,60,60,0.4); }
          50%       { box-shadow: 0 0 0 6px rgba(255,60,60,0); }
        }
      `}</style>
    </>
  );
}
