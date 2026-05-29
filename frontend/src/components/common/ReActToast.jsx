import { useState, useEffect, useRef } from "react";

const PYTHON_BASE = import.meta.env.VITE_PYTHON_URL || "http://localhost:8001";

const STEP_LABEL = {
  thought:     "생각",
  action:      "도구 사용",
  observation: "결과 확인",
  answer:      "완료",
  error:       "오류",
};

function ToastCard({ id, endpoint, body, onDone, onRemove }) {
  const [steps,   setSteps]   = useState([]);
  const [status,  setStatus]  = useState("loading");
  const [visible, setVisible] = useState(true);
  const bottomRef = useRef(null);

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
              onDone?.(data.content);
              setTimeout(() => { if (!cancelled) setVisible(false); }, 5000);
              setTimeout(() => { if (!cancelled) onRemove(id); }, 5500);
            } else if (data.type === "error") {
              setSteps(prev => [...prev, { ...data, type: "error" }]);
              setStatus("error");
            } else {
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

  if (!visible) return null;

  return (
    <div style={{
      width: 340,
      background: "rgba(18,18,18,0.72)",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 10,
      overflow: "hidden",
      opacity: visible ? 1 : 0,
      transition: "opacity .4s",
      animation: "toastIn .25s ease",
    }}>

      {/* 헤더 */}
      <div style={{
        display: "flex", alignItems: "center", gap: 8,
        padding: "10px 14px",
        borderBottom: "1px solid rgba(255,255,255,0.06)",
      }}>
        {status === "loading" && (
          <span style={{ display: "flex", gap: 3, alignItems: "center" }}>
            <Dots />
          </span>
        )}
        <span style={{ fontSize: 12, color: "rgba(255,255,255,0.55)", flex: 1, fontFamily: "system-ui,sans-serif" }}>
          {status === "loading" ? "추론 중" : status === "done" ? "추론 완료" : "오류"}
        </span>
        {status !== "loading" && (
          <button
            onClick={() => { setVisible(false); setTimeout(() => onRemove(id), 400); }}
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
        maxHeight: 220, overflowY: "auto",
        display: "flex", flexDirection: "column",
        padding: "10px 14px",
        gap: 2,
        fontFamily: "system-ui,-apple-system,sans-serif",
      }}>
        {steps.map((step, i) => {
          const label = STEP_LABEL[step.type] ?? step.type;
          const isAnswer = step.type === "answer";
          const isError  = step.type === "error";

          let text = "";
          if (step.type === "action") {
            text = step.tool ? `${step.tool}${step.args ? `(${step.args})` : ""}` : step.content ?? "";
          } else {
            text = step.content ?? "";
          }

          return (
            <div key={i} style={{
              animation: "fadeIn .18s ease",
              padding: "4px 0",
              borderBottom: i < steps.length - 1 ? "none" : "none",
            }}>
              <span style={{
                fontSize: 11,
                color: isAnswer ? "rgba(255,255,255,0.75)"
                     : isError  ? "rgba(255,100,100,0.8)"
                     : "rgba(255,255,255,0.35)",
                fontWeight: isAnswer ? 600 : 400,
                marginRight: 6,
                letterSpacing: ".2px",
              }}>
                {label}
              </span>
              <span style={{
                fontSize: 11,
                color: isAnswer ? "rgba(255,255,255,0.6)"
                     : isError  ? "rgba(255,100,100,0.65)"
                     : "rgba(255,255,255,0.45)",
                lineHeight: 1.5,
                wordBreak: "break-all",
                display: "inline",
              }}>
                {text.length > 80 ? text.slice(0, 80) + "…" : text}
              </span>
            </div>
          );
        })}

        {status === "loading" && steps.length === 0 && (
          <div style={{ fontSize: 11, color: "rgba(255,255,255,0.25)", padding: "2px 0" }}>
            시작 중...
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* 하단 진행바 */}
      {status === "loading" && (
        <div style={{ height: 1, background: "rgba(255,255,255,0.06)" }}>
          <div style={{
            height: "100%",
            background: "rgba(255,255,255,0.18)",
            animation: "progressBar 2.4s ease infinite",
          }} />
        </div>
      )}

      <style>{`
        @keyframes toastIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes progressBar {
          0%   { width: 0%; }
          60%  { width: 75%; }
          100% { width: 92%; }
        }
        @keyframes blink {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.2; }
        }
      `}</style>
    </div>
  );
}

function Dots() {
  return (
    <span style={{ display: "inline-flex", gap: 3, alignItems: "center", marginRight: 2 }}>
      {[0, 1, 2].map(i => (
        <span key={i} style={{
          width: 4, height: 4, borderRadius: "50%",
          background: "rgba(255,255,255,0.4)",
          display: "inline-block",
          animation: `blink 1.2s ease ${i * 0.2}s infinite`,
        }} />
      ))}
    </span>
  );
}

// ── 전역 토스트 컨테이너 ────────────────────────────────────────────────────
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
      position: "fixed", bottom: 24, right: 24, zIndex: 9900,
      display: "flex", flexDirection: "column", gap: 8,
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
