import { useEffect, useRef } from "react";

export default function RoadViewModal({ cr, onClose }) {
  const rvRef = useRef(null);

  useEffect(() => {
    if (!rvRef.current || !window.kakao?.maps) return;
    const kakao = window.kakao;
    const pos = new kakao.maps.LatLng(cr.lat, cr.lon);
    const rv = new kakao.maps.Roadview(rvRef.current);
    const rvClient = new kakao.maps.RoadviewClient();
    rvClient.getNearestPanoId(pos, 50, panoId => {
      if (panoId) {
        rv.setPanoId(panoId, pos);
      }
    });
  }, [cr]);

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.75)",
      display: "flex", alignItems: "center", justifyContent: "center",
    }} onClick={onClose}>
      <div style={{
        width: 700, height: 480, borderRadius: 14, overflow: "hidden",
        border: "1px solid rgba(96,165,250,0.4)",
        background: "#0f1624", position: "relative",
      }} onClick={e => e.stopPropagation()}>
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
          background: "rgba(8,13,26,0.92)", padding: "10px 16px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#60a5fa" }}>
            📍 {cr.crsrdNm} — 로드뷰
          </span>
          <button onClick={onClose} style={{
            background: "rgba(255,255,255,0.08)", border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 6, color: "#94a3b8", fontSize: 13, cursor: "pointer", padding: "3px 10px",
          }}>✕ 닫기</button>
        </div>
        <div ref={rvRef} style={{ width: "100%", height: "100%", paddingTop: 42 }} />
      </div>
    </div>
  );
}
