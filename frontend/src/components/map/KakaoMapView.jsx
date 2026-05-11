import { useState, useEffect, useRef } from "react";
import { domColor } from "../../utils/signalUtils";

const DEFAULT_LAT = 37.5133;
const DEFAULT_LON = 127.1002;
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";

export default function KakaoMapView({ crossroads, selected, onSelect, initialCenter, onCctvClick }) {
  const mapRef = useRef(null);
  const mapObj = useRef(null);
  const overlays = useRef({});
  const cctvOverlays = useRef([]);
  const clusterer = useRef(null);
  const [ready, setReady] = useState(false);
  const [zoom, setZoom] = useState(4);
  const [cctvList, setCctvList] = useState([]);
  const [showCctv, setShowCctv] = useState(false);

  useEffect(() => {
    const KEY = import.meta.env.VITE_KAKAO_APP_KEY;
    if (window.kakao?.maps) { setReady(true); return; }
    if (document.querySelector("script[data-kakao]")) {
      const id = setInterval(() => { if (window.kakao?.maps) { clearInterval(id); setReady(true); } }, 100);
      return;
    }
    const s = document.createElement("script");
    s.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${KEY}&libraries=clusterer,services&autoload=false`;
    s.setAttribute("data-kakao", "1");
    s.onload = () => window.kakao.maps.load(() => setReady(true));
    document.head.appendChild(s);
  }, []);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const kakao = window.kakao;
    const centerLat = initialCenter?.lat ?? DEFAULT_LAT;
    const centerLon = initialCenter?.lon ?? DEFAULT_LON;
    const map = new kakao.maps.Map(mapRef.current, {
      center: new kakao.maps.LatLng(centerLat, centerLon), level: 4,
    });
    mapObj.current = map;
    mapRef.current.style.filter = "invert(90%) hue-rotate(180deg) brightness(0.85) saturate(0.9)";
    kakao.maps.event.addListener(map, "zoom_changed", () => setZoom(map.getLevel()));
    clusterer.current = new kakao.maps.MarkerClusterer({
      map, averageCenter: true, minLevel: 5,
      styles: [{ width: "42px", height: "42px", background: "rgba(18,14,10,0.9)", borderRadius: "50%", border: "2px solid rgba(255,170,51,0.7)", color: "#ffaa33", fontSize: "14px", fontWeight: "700", lineHeight: "42px", textAlign: "center" }],
    });
  }, [ready]);

  useEffect(() => {
    if (!ready || !mapObj.current) return;
    const kakao = window.kakao;
    Object.values(overlays.current).forEach(ov => ov.setMap(null));
    overlays.current = {};

    if (zoom >= 5) {
      if (clusterer.current) clusterer.current.clear();
      crossroads.forEach(cr => {
        const pos = new kakao.maps.LatLng(cr.lat, cr.lon);
        const isSel = selected?.crsrdId === cr.crsrdId;
        const color = domColor(cr.mappedSignals);
        const content = isSel
          ? `<div style="position:relative;cursor:pointer"><div style="width:36px;height:36px;border-radius:50%;border:2px solid ${color};background:${color}33;display:flex;align-items:center;justify-content:center"><div style="width:13px;height:13px;border-radius:50%;background:${color};box-shadow:0 0 8px ${color}"></div></div><div style="position:absolute;top:-22px;left:50%;transform:translateX(-50%);background:rgba(18,14,10,0.92);border:1px solid ${color}66;border-radius:3px;padding:2px 8px;font-size:11px;color:${color};white-space:nowrap;font-weight:700;font-family:Malgun Gothic,sans-serif">${cr.crsrdNm}</div></div>`
          : `<div style="width:12px;height:12px;border-radius:50%;border:2px solid rgba(255,255,255,0.35);background:${color};box-shadow:0 0 5px ${color}88;cursor:pointer"></div>`;
        const ov = new kakao.maps.CustomOverlay({ position: pos, content, zIndex: isSel ? 10 : 3, xAnchor: 0.5, yAnchor: 0.5 });
        ov.setMap(mapObj.current);
        ov.__cr = cr;
        overlays.current[cr.crsrdId] = ov;
      });
    } else {
      if (clusterer.current) {
        const markers = crossroads.map(cr => {
          const m = new kakao.maps.Marker({ position: new kakao.maps.LatLng(cr.lat, cr.lon) });
          kakao.maps.event.addListener(m, "click", () => onSelect(cr));
          return m;
        });
        clusterer.current.addMarkers(markers);
      }
    }
  }, [ready, crossroads, selected, zoom]);

  useEffect(() => {
    if (!ready || !mapObj.current || !selected?.lat || !selected?.lon) return;
    const kakao = window.kakao;
    mapObj.current.panTo(new kakao.maps.LatLng(selected.lat, selected.lon));
  }, [ready, selected?.crsrdId]);

  // CCTV 목록 로드
  useEffect(() => {
    fetch(`${API_BASE}/api/cctv`)
      .then(r => r.json())
      .then(data => setCctvList(data))
      .catch(() => {});
  }, []);

  // CCTV 마커 표시/숨김
  useEffect(() => {
    if (!ready || !mapObj.current) return;
    const kakao = window.kakao;
    cctvOverlays.current.forEach(ov => ov.setMap(null));
    cctvOverlays.current = [];
    if (!showCctv) return;

    cctvList.forEach(cctv => {
      const pos = new kakao.maps.LatLng(cctv.lat, cctv.lon);
      const hasStream = !!cctv.streamUrl;

      const el = document.createElement("div");
      el.style.cssText = `cursor:pointer;width:36px;height:36px;border-radius:8px;background:rgba(234,179,8,0.2);border:2px solid #fbbf24;display:flex;align-items:center;justify-content:center;font-size:18px;box-shadow:0 0 8px #fbbf2488`;
      el.title = cctv.cctvNm;
      el.textContent = "📹";
      el.addEventListener("click", e => { e.stopPropagation(); onCctvClick?.(cctv); });

      const ov = new kakao.maps.CustomOverlay({ position: pos, content: el, zIndex: 5, xAnchor: 0.5, yAnchor: 0.5 });
      ov.setMap(mapObj.current);
      cctvOverlays.current.push(ov);
    });
  }, [ready, showCctv, cctvList, onCctvClick]);

  useEffect(() => {
    if (!ready || !mapRef.current) return;
    const el = mapRef.current;
    const h = e => {
      Object.values(overlays.current).forEach(ov => {
        const n = ov.getContent();
        if (typeof n === "string") return;
        if (n?.contains?.(e.target)) onSelect(ov.__cr);
      });
    };
    el.addEventListener("click", h);
    return () => el.removeEventListener("click", h);
  }, [ready, onSelect, onCctvClick]);

  if (!ready) return (
    <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", background: "#0a1020", gap: 10 }}>
      <div style={{ width: 28, height: 28, border: "3px solid rgba(59,130,246,0.3)", borderTop: "3px solid #3b82f6", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
      <div style={{ fontSize: 14, color: "#6b7280" }}>카카오맵 로딩 중...</div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={mapRef} style={{ width: "100%", height: "100%" }} />
      <div style={{ position: "absolute", top: 14, right: 14, background: "rgba(18,14,10,0.88)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "10px 14px", zIndex: 10, pointerEvents: "none", backdropFilter: "blur(4px)" }}>
        <div style={{ fontSize: 12, color: "#aab4c8", fontWeight: 700, marginBottom: 8 }}>교통 상태</div>
        {[["#2ee07a", "원활 (40km/h+)"], ["#ffaa33", "서행 (20~40km/h)"], ["#ff5566", "혼잡 (~20km/h)"]].map(([c, l]) => (
          <div key={l} style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 5 }}>
            <div style={{ width: 9, height: 9, borderRadius: "50%", background: c }} /><span style={{ fontSize: 12, color: "#aab4c8" }}>{l}</span>
          </div>
        ))}
      </div>
      <div style={{ position: "absolute", top: 14, left: 14, display: "flex", gap: 7, zIndex: 10 }}>
        <div style={{ background: "rgba(18,14,10,0.88)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "4px 12px", fontSize: 12, color: "#aab4c8", pointerEvents: "none", backdropFilter: "blur(4px)" }}>
          🗺️ 잠실역 반경 1km · V2X 실시간 · {crossroads.length}개 교차로
        </div>
        <button
          onClick={() => setShowCctv(v => !v)}
          style={{
            background: showCctv ? "rgba(255,170,51,0.15)" : "rgba(18,14,10,0.88)",
            border: `1px solid ${showCctv ? "rgba(255,170,51,0.5)" : "rgba(255,255,255,0.08)"}`,
            borderRadius: 4, padding: "4px 12px", fontSize: 12,
            color: showCctv ? "#ffaa33" : "#aab4c8",
            cursor: "pointer", fontFamily: "inherit", backdropFilter: "blur(4px)",
          }}>
          📹 CCTV {cctvList.length > 0 ? `${cctvList.length}개` : ""}
        </button>
      </div>
      {zoom < 5 && (
        <div style={{ position: "absolute", bottom: 14, left: "50%", transform: "translateX(-50%)", background: "rgba(18,14,10,0.88)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 4, padding: "5px 14px", fontSize: 12, color: "#aab4c8", zIndex: 10, pointerEvents: "none", backdropFilter: "blur(4px)" }}>
          클러스터 모드 · 확대하면 교차로별 신호 표시
        </div>
      )}
    </div>
  );
}
