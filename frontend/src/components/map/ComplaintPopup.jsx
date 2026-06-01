const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8080").replace(/\/+$/, "");

const STATUS_COLOR = { "접수": "#ffaa33", "처리중": "#4ea6ff", "완료": "#2ee07a" };

const V = {
  bg0: "#000", bg1: "#0a0a0a", line: "#1a1a1a",
  ink0: "#e7ecf5", ink1: "#aab4c8", ink2: "#7a7a7a",
  org: "#ffaa33", red: "#ff5566",
  mono: "'IBM Plex Mono',ui-monospace,Menlo,monospace",
  sans: "'Pretendard','Noto Sans KR',system-ui,sans-serif",
};

export default function ComplaintPopup({ complaint, onClose }) {
  const statusColor = STATUS_COLOR[complaint.status] || V.ink2;
  const photos = complaint.photoUrls || [];

  const fmt = dt => dt ? new Date(dt).toLocaleString("ko-KR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 500, background: "rgba(0,0,0,0.72)", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: V.sans }}>
      <div style={{ background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, width: 480, maxWidth: "90vw", maxHeight: "85vh", display: "flex", flexDirection: "column", boxShadow: "0 8px 32px rgba(0,0,0,0.8)" }}>

        {/* 헤더 */}
        <div style={{ padding: "14px 18px", borderBottom: `1px solid ${V.line}`, background: "#080808", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <span style={{ fontFamily: V.mono, fontSize: 10, color: V.org, letterSpacing: ".5px", fontWeight: 700 }}>민원</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: V.ink0, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{complaint.title}</span>
          <span style={{ fontFamily: V.mono, fontSize: 11, color: statusColor, fontWeight: 700 }}>{complaint.status || "접수"}</span>
          <button onClick={onClose} style={{ width: 28, height: 28, background: "transparent", border: `1px solid ${V.line}`, borderRadius: 2, color: V.ink2, cursor: "pointer", fontSize: 15, flexShrink: 0 }}>✕</button>
        </div>

        {/* 본문 */}
        <div style={{ flex: 1, overflowY: "auto", padding: "16px 18px", display: "flex", flexDirection: "column", gap: 12 }}>

          {/* 메타 정보 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[
              ["민원 분류", complaint.category || "—"],
              ["접수자", complaint.userName || "—"],
              ["접수 일시", fmt(complaint.createdAt)],
              ["위치", complaint.address || "—"],
            ].map(([label, value]) => (
              <div key={label} style={{ padding: "10px 12px", background: V.bg0, border: `1px solid ${V.line}`, borderRadius: 2 }}>
                <div style={{ fontFamily: V.mono, fontSize: 10, color: V.ink2, letterSpacing: ".4px", marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 12, color: V.ink0, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{value}</div>
              </div>
            ))}
          </div>

          {/* 민원 내용 */}
          <div style={{ padding: "12px 14px", background: V.bg0, border: `1px solid ${V.line}`, borderRadius: 2 }}>
            <div style={{ fontFamily: V.mono, fontSize: 10, color: V.ink2, letterSpacing: ".4px", marginBottom: 8 }}>민원 내용</div>
            <div style={{ fontSize: 13, color: V.ink1, lineHeight: 1.7, whiteSpace: "pre-wrap" }}>{complaint.content || "내용 없음"}</div>
          </div>

          {/* 사진 */}
          {photos.length > 0 && (
            <div>
              <div style={{ fontFamily: V.mono, fontSize: 10, color: V.ink2, letterSpacing: ".4px", marginBottom: 8 }}>첨부 사진</div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {photos.map((url, i) => (
                  <a key={i} href={url.startsWith("http") ? url : `${API_BASE}${url}`} target="_blank" rel="noreferrer">
                    <img
                      src={url.startsWith("http") ? url : `${API_BASE}${url}`}
                      alt={`민원 사진 ${i + 1}`}
                      style={{ width: 120, height: 90, objectFit: "cover", borderRadius: 2, border: `1px solid ${V.line}`, cursor: "pointer" }}
                    />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 하단 */}
        <div style={{ padding: "12px 18px", borderTop: `1px solid ${V.line}`, background: "#060606", fontFamily: V.mono, fontSize: 11, color: V.ink2, display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
          <span>민원번호 #{complaint.id || "—"}</span>
          <span style={{ color: V.line }}>·</span>
          <span>📍 {complaint.address || "위치 정보 없음"}</span>
        </div>
      </div>
    </div>
  );
}
