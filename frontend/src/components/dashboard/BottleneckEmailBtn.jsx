/**
 * 병목 메일 전송 버튼
 * 클릭하면 AI 에이전트가 해당 구의 병목 분석 후 이메일을 발송한다.
 * 진행 상태(idle/loading/done)에 따라 라벨과 색이 바뀐다.
 *
 * @param {string} district  대상 자치구 이름
 */
import { useState } from "react";
import { triggerReActToast } from "../common/ReActToast";

export default function BottleneckEmailBtn({ district }) {
  const [status, setStatus] = useState("idle"); // idle | loading | done | error

  const handleClick = () => {
    if (status === "loading") return;
    setStatus("loading");
    const userEmail = JSON.parse(localStorage.getItem("ts_user") || "{}").email || null;

    triggerReActToast({
      endpoint: "/api/agent/bottleneck-email/stream",
      body: { district, userEmail },
      onDone: () => {
        setStatus("done");
        setTimeout(() => setStatus("idle"), 3000);
      },
    });
  };

  const label = status === "loading" ? "분석 중..."
    : status === "done" ? "✓ 메일 전송됨"
    : status === "error" ? "전송 실패"
    : "📧 병목 메일";
  const color = status === "done" ? "#2ee07a" : status === "error" ? "#ff5566" : "#4ea6ff";

  return (
    <button onClick={handleClick} disabled={status === "loading"} style={{
      fontSize: 11, padding: "4px 10px", borderRadius: 2,
      border: `1px solid ${color}`, background: "transparent",
      color, cursor: status === "loading" ? "wait" : "pointer",
      fontFamily: "'IBM Plex Mono',monospace", transition: "all 0.2s",
    }}>
      {label}
    </button>
  );
}
