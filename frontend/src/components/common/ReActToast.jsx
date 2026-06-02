import { useState, useEffect, useRef } from "react";
import { speakAsync } from "../../lib/tts";

const PYTHON_BASE = import.meta.env.VITE_PYTHON_URL || "http://localhost:8001";

// 도구별 아이콘
const TOOL_ICON = {
  get_traffic_data:        "🚦",
  get_bottleneck_list:     "🚨",
  search_crossroad_by_name:"🔍",
  get_district_traffic:    "📊",
  set_signal_timing:       "⏱️",
  send_alert:              "🔔",
  send_email_report:       "📧",
  get_simulation_context:  "⚙️",
  search_project_docs:     "📚",
};

// TTS는 전역 큐(lib/tts.js)를 공유한다.
// → 음소거 토글이 적용되고, 박수 감지가 "재생 중"으로 인식해 새 세션을 안 연다.

// ── 점 애니메이션 ─────────────────────────────────────────────────────
function ThinkingDots() {
  return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center" }}>
      {[0,1,2].map(i => (
        <span key={i} style={{
          width: 5, height: 5, borderRadius: "50%",
          background: "rgba(255,255,255,0.5)",
          display: "inline-block",
          animation: `raDotBlink 1.2s ease ${i*0.2}s infinite`,
        }}/>
      ))}
    </span>
  );
}

// ── 단계 아이템 ───────────────────────────────────────────────────────
function StepItem({ step, isLast, isLoading }) {
  const isAction  = step.type === "action";
  const isObs     = step.type === "observation";
  const isAnswer  = step.type === "answer";
  const isError   = step.type === "error";
  const isThought = step.type === "thought";

  if (isThought) return null; // thought는 숨김

  const icon = isAction  ? (TOOL_ICON[step.tool] || "🔧")
             : isObs     ? "↳"
             : isAnswer  ? "✦"
             : isError   ? "✕"
             : "·";

  const label = isAction  ? (step.label || step.tool || "도구 사용")
              : isObs     ? "결과"
              : isAnswer  ? null
              : isError   ? "오류"
              : step.type;

  const text  = isAction  ? (step.args ? `${step.args}` : "")
              : isObs     ? (step.content || "")
              : isAnswer  ? (step.content || "")
              : isError   ? (step.content || "")
              : "";

  return (
    <div style={{
      animation: "raFadeIn .2s ease",
      marginBottom: isAnswer ? 0 : 6,
    }}>
      {isAnswer ? (
        /* 최종 답변 버블 */
        <div style={{
          background: "rgba(255,255,255,0.04)",
          border: "1px solid rgba(255,255,255,0.08)",
          borderRadius: 10,
          padding: "12px 14px",
          fontSize: 12,
          color: "rgba(255,255,255,0.75)",
          lineHeight: 1.75,
          whiteSpace: "pre-line",
        }}>
          {text}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          {/* 아이콘 */}
          <span style={{
            fontSize: isAction ? 14 : 11,
            flexShrink: 0,
            marginTop: 1,
            opacity: isObs ? 0.4 : 0.85,
          }}>{icon}</span>

          <div style={{ flex: 1, minWidth: 0 }}>
            {/* 라벨 */}
            {label && (
              <div style={{
                display: "flex", alignItems: "center", gap: 6, marginBottom: 2,
              }}>
                <span style={{
                  fontSize: 12, fontWeight: 600,
                  color: isAction ? "rgba(255,255,255,0.8)"
                       : isError  ? "rgba(255,100,100,0.8)"
                       : "rgba(255,255,255,0.35)",
                }}>
                  {label}
                </span>
                {isAction && isLast && isLoading && <ThinkingDots />}
                {isAction && (!isLast || !isLoading) && (
                  <span style={{ fontSize: 10, color: "rgba(100,220,100,0.6)" }}>✓</span>
                )}
              </div>
            )}
            {/* 내용 */}
            {text && (
              <div style={{
                fontSize: 11,
                color: isObs    ? "rgba(255,255,255,0.3)"
                     : isError  ? "rgba(255,100,100,0.6)"
                     : "rgba(255,255,255,0.45)",
                lineHeight: 1.5,
                wordBreak: "break-all",
              }}>
                {text.length > 100 ? text.slice(0,100) + "…" : text}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 메인 카드 ─────────────────────────────────────────────────────────
function ToastCard({ id, endpoint, body, onDone, onRemove }) {
  const [steps,   setSteps]   = useState([]);
  const [status,  setStatus]  = useState("loading");
  const [visible, setVisible] = useState(true);
  const bottomRef  = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [steps]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`${PYTHON_BASE}${endpoint}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });

        const reader  = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done || cancelled) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop();

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            let data;
            try { data = JSON.parse(line.slice(6)); } catch { continue; }

            if (data.type === "done") break;
            if (data.type === "answer") {
              setSteps(prev => [...prev, data]);
              setStatus("done");
              speakAsync(data.content, 1.0);
              onDone?.(data.content);
            } else if (data.type === "error") {
              setSteps(prev => [...prev, { ...data, type: "error" }]);
              setStatus("error");
            } else {
              if (data.type === "action" && data.label) {
                speakAsync(`${data.label} 중`, 1.3);
              }
              setSteps(prev => [...prev, data]);
            }
          }
        }
      } catch (e) {
        if (!cancelled) {
          setSteps(prev => [...prev, { type: "error", content: e.message }]);
          setStatus("error");
        }
      }
    })();

    return () => { cancelled = true; };
  }, []);

  const close = () => {
    setVisible(false);
    setTimeout(() => onRemove(id), 400);
  };

  if (!visible) return null;

  const visibleSteps = steps.filter(s => s.type !== "thought");

  return (
    <div style={{
      width: 420,
      background: "rgba(12,12,14,0.96)",
      backdropFilter: "blur(20px)",
      WebkitBackdropFilter: "blur(20px)",
      border: "1px solid rgba(255,255,255,0.09)",
      borderRadius: 14,
      overflow: "hidden",
      opacity: visible ? 1 : 0,
      transition: "opacity .4s",
      animation: "raSlideIn .28s ease",
      boxShadow: "0 16px 48px rgba(0,0,0,0.6)",
    }}>

      {/* 헤더 */}
      <div style={{
        display: "flex", alignItems: "center", gap: 10,
        padding: "13px 16px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        <div style={{
          width: 28, height: 28, borderRadius: "50%",
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 13, flexShrink: 0,
        }}>
          {status === "loading" ? <ThinkingDots /> : status === "done" ? "✦" : "✕"}
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.8)", fontFamily: "system-ui,sans-serif" }}>
            AI 교통 어시스턴트
          </div>
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.3)", fontFamily: "system-ui,sans-serif", marginTop: 1 }}>
            {status === "loading" ? "분석 중..." : status === "done" ? "분석 완료" : "오류 발생"}
          </div>
        </div>
        {status !== "loading" && (
          <button onClick={close} style={{
            background: "none", border: "none",
            color: "rgba(255,255,255,0.25)", fontSize: 16,
            cursor: "pointer", padding: "0 2px", lineHeight: 1,
          }}>✕</button>
        )}
      </div>

      {/* 스텝 목록 */}
      <div style={{
        maxHeight: 340, overflowY: "auto",
        padding: "14px 16px",
        fontFamily: "system-ui,-apple-system,sans-serif",
      }}>
        {visibleSteps.length === 0 && status === "loading" && (
          <div style={{ fontSize: 12, color: "rgba(255,255,255,0.2)", padding: "4px 0" }}>
            시작하는 중...
          </div>
        )}
        {visibleSteps.map((step, i) => (
          <StepItem
            key={i}
            step={step}
            isLast={i === visibleSteps.length - 1}
            isLoading={status === "loading"}
          />
        ))}
        <div ref={bottomRef} />
      </div>

      {/* 진행 바 */}
      {status === "loading" && (
        <div style={{ height: 2, background: "rgba(255,255,255,0.04)" }}>
          <div style={{
            height: "100%",
            background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.25), transparent)",
            animation: "raProgress 1.8s ease infinite",
          }}/>
        </div>
      )}

      <style>{`
        @keyframes raSlideIn {
          from { opacity:0; transform:translateY(12px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes raFadeIn {
          from { opacity:0; transform:translateY(4px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes raDotBlink {
          0%,100% { opacity:1; }
          50%      { opacity:0.2; }
        }
        @keyframes raProgress {
          0%   { width:0%;   margin-left:0; }
          50%  { width:60%;  margin-left:20%; }
          100% { width:0%;   margin-left:100%; }
        }
      `}</style>
    </div>
  );
}

// ── 전역 토스트 컨테이너 ──────────────────────────────────────────────
let _addToast = null;
export function setToastAdder(fn) { _addToast = fn; }
export function triggerReActToast({ endpoint, body, onDone }) {
  _addToast?.({ endpoint, body, onDone });
}

export default function ReActToastContainer() {
  const [toasts, setToasts] = useState([]);
  const counter = useRef(0);

  useEffect(() => {
    setToastAdder(({ endpoint, body, onDone }) => {
      const id = ++counter.current;
      setToasts(prev => [...prev, { id, endpoint, body, onDone }]);
    });
    return () => setToastAdder(null);
  }, []);

  const remove = (id) => setToasts(prev => prev.filter(t => t.id !== id));

  if (toasts.length === 0) return null;

  return (
    <div style={{
      // AI 플로팅 버튼(bottom 28)에 가리지 않도록 위로 띄움
      position: "fixed", bottom: 96, right: 28, zIndex: 10001,
      display: "flex", flexDirection: "column", gap: 10,
      alignItems: "flex-end",
    }}>
      {toasts.map(t => (
        <ToastCard
          key={t.id}
          id={t.id}
          endpoint={t.endpoint}
          body={t.body}
          onDone={t.onDone}
          onRemove={remove}
        />
      ))}
    </div>
  );
}
