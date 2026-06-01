import { useEffect, useRef, useState } from "react";

export default function RoadViewModal({ cr, onClose }) {
  const roadviewRef = useRef(null);
  const [size, setSize] = useState({ width: 720, height: 480 });
  const [resizing, setResizing] = useState(false);
  const startRef = useRef(null);

  useEffect(() => {
    if (!cr || !roadviewRef.current || !window.kakao?.maps) return;

    const kakao = window.kakao;
    const position = new kakao.maps.LatLng(cr.lat, cr.lon);
    const roadview = new kakao.maps.Roadview(roadviewRef.current);
    const roadviewClient = new kakao.maps.RoadviewClient();

    roadviewClient.getNearestPanoId(position, 70, (panoId) => {
      if (panoId) {
        roadview.setPanoId(panoId, position);
      } else {
        roadviewRef.current.innerHTML = `
          <div style="height:100%;display:flex;align-items:center;justify-content:center;color:#94a3b8;background:#0f172a;font-size:14px;">
            주변 로드뷰를 찾을 수 없습니다.
          </div>
        `;
      }
    });
  }, [cr]);

  useEffect(() => {
    if (!resizing) return;

    const handleMove = (e) => {
      if (!startRef.current) return;
      const nextWidth = Math.min(1100, Math.max(520, startRef.current.width + (e.clientX - startRef.current.x)));
      const nextHeight = Math.min(760, Math.max(360, startRef.current.height + (e.clientY - startRef.current.y)));
      setSize({ width: nextWidth, height: nextHeight });
    };

    const handleUp = () => {
      setResizing(false);
      startRef.current = null;
    };

    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
  }, [resizing]);

  const startResize = (e) => {
    e.preventDefault();
    e.stopPropagation();
    startRef.current = { x: e.clientX, y: e.clientY, width: size.width, height: size.height };
    setResizing(true);
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 1000,
      background: "rgba(0,0,0,0.72)",
      display: "flex", alignItems: "center", justifyContent: "center",
      padding: 24,
    }}>
      <div style={{
        width: size.width, height: size.height,
        minWidth: 520, minHeight: 360,
        maxWidth: "92vw", maxHeight: "88vh",
        background: "#111827",
        border: "1px solid rgba(96,165,250,0.35)",
        borderRadius: 10,
        overflow: "hidden",
        boxShadow: "0 20px 60px rgba(0,0,0,0.65)",
        position: "relative",
        display: "flex", flexDirection: "column",
      }}>
        <div style={{
          height: 42, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "0 12px 0 16px",
          background: "rgba(15,23,42,0.96)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
        }}>
          <div style={{ color: "#60a5fa", fontWeight: 800, fontSize: 14 }}>
            {cr?.crsrdNm || "선택 지점"}
          </div>
          <button onClick={onClose} title="닫기" style={{
            width: 30,
            height: 30,
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.14)",
            borderRadius: 6,
            color: "#cbd5e1",
            cursor: "pointer",
            fontSize: 18,
            lineHeight: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: "inherit",
          }}>
            ×
          </button>
        </div>

        <div ref={roadviewRef} style={{ flex: 1, minHeight: 0, background: "#020617" }} />

        <div
          onMouseDown={startResize}
          title="창 크기 조절"
          style={{
            position: "absolute", right: 0, bottom: 0,
            width: 22, height: 22,
            cursor: "nwse-resize",
            background: "linear-gradient(135deg, transparent 45%, rgba(96,165,250,0.65) 46%, rgba(96,165,250,0.65) 55%, transparent 56%)",
          }}
        />
      </div>
    </div>
  );
}
