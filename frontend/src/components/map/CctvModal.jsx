import { useState } from "react";

const UTIC_KEY = import.meta.env.VITE_UTIC_KEY || "";

export default function CctvModal({ cctv, onClose }) {
  const [reloadKey, setReloadKey] = useState(0);

  // UTIC iframe URL: streamId(id=), cctvCh(cctvch=) 포함
  const iframeSrc = `https://www.utic.go.kr/jsp/map/openDataCctvStream.jsp`
    + `?cctvid=${encodeURIComponent(cctv.cctvId)}`
    + `&cctvName=${encodeURIComponent(encodeURIComponent(cctv.cctvNm))}`
    + `&kind=Seoul`
    + `&cctvip=undefined`
    + `&cctvch=${cctv.cctvCh ?? 51}`
    + `&id=${cctv.streamId ?? ""}`
    + `&cctvpasswd=undefined&cctvport=undefined`
    + `&_r=${reloadKey}`;

  return (
    <div
      style={{ position: "fixed", inset: 0, zIndex: 1100, background: "rgba(0,0,0,0.8)", display: "flex", alignItems: "center", justifyContent: "center" }}
      onClick={onClose}
    >
      <div
        style={{ width: "90vw", maxWidth: 1100, borderRadius: 14, overflow: "hidden", border: "1px solid rgba(234,179,8,0.4)", background: "#0a1020" }}
        onClick={e => e.stopPropagation()}
      >
        {/* 헤더 */}
        <div style={{ background: "rgba(8,13,26,0.95)", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid rgba(255,255,255,0.08)" }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#fbbf24" }}>{cctv.cctvNm}</span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              onClick={() => setReloadKey(k => k + 1)}
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 5, color: "#94a3b8", fontSize: 12, cursor: "pointer", padding: "3px 9px", fontFamily: "inherit" }}
            >↺ 새로고침</button>
            <button
              onClick={onClose}
              style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.12)", borderRadius: 5, color: "#94a3b8", fontSize: 13, cursor: "pointer", padding: "3px 9px", fontFamily: "inherit" }}
            >✕</button>
          </div>
        </div>

        {/* 영상 */}
        <div style={{ background: "#000", height: "70vh", overflow: "hidden", position: "relative" }}>
          <iframe
            key={reloadKey}
            src={iframeSrc}
            style={{
              border: "none", display: "block",
              width: "100%", height: "100%",
              position: "absolute",
              top: "50%", left: "50%",
              transformOrigin: "center center",
              transform: "translate(-50%, 14%) scale(2.8)",
            }}
            title={cctv.cctvNm}
            allow="autoplay"
          />
        </div>
      </div>
    </div>
  );
}