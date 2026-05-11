import { useState, useEffect } from "react";
import { GU_LIST, HANGANG_PATH, toSvg } from "../../constants/seoulGeoData";

export default function SeoulSvgMap({ onGoMap, selectedGu, onSelectGu, loading }) {
  const [hoveredGu, setHoveredGu] = useState(null);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPulse(p => (p + 1) % 100), 60);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ position:"relative", width:"100%", height:"100%", userSelect:"none", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center" }}>

      <button
        onClick={() => onGoMap(selectedGu)}
        style={{
          position:"absolute", top:0, right:0, zIndex:5,
          padding:"8px 16px", borderRadius:7,
          background:"rgba(34,197,94,0.15)", border:"1px solid rgba(34,197,94,0.5)",
          color:"#22c55e", fontSize:13, fontWeight:700, cursor:"pointer",
          fontFamily:"inherit", display:"flex", alignItems:"center", gap:6,
          transition:"all .15s",
        }}
        onMouseEnter={e => { e.currentTarget.style.background="rgba(34,197,94,0.28)"; }}
        onMouseLeave={e => { e.currentTarget.style.background="rgba(34,197,94,0.15)"; }}
      >
        🗺️ 실시간 지도 →
      </button>

      {loading && (
        <div style={{ position:"absolute", inset:0, background:"rgba(7,12,23,0.7)", zIndex:10, display:"flex", alignItems:"center", justifyContent:"center", borderRadius:8, gap:8 }}>
          <div style={{ width:20, height:20, border:"2px solid rgba(59,130,246,0.3)", borderTop:"2px solid #3b82f6", borderRadius:"50%", animation:"spin 1s linear infinite" }}/>
          <span style={{ fontSize:13, color:"#60a5fa" }}>데이터 수집 중...</span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      <svg viewBox="30 10 355 365" style={{ width:"100%", height:"100%" }}>
        <defs>
          <radialGradient id="seoulGrad" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#1e3a8a" stopOpacity="0.9"/>
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.95"/>
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="2.5" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
          <filter id="guGlow">
            <feGaussianBlur stdDeviation="3" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
        </defs>

        <rect x="30" y="10" width="355" height="365" fill="url(#seoulGrad)" rx="12"/>
        <path d={HANGANG_PATH} fill="#0ea5e9" opacity="0.35"/>
        <text x="210" y="228" fontSize="9" fill="#38bdf8" opacity="0.8" fontFamily="Malgun Gothic,sans-serif">한 강</text>

        {GU_LIST.map(gu => {
          const [x, y] = toSvg(gu.lat, gu.lon);
          if (x < 55 || x > 380 || y < 15 || y > 375) return null;
          const isSel = selectedGu?.name === gu.name;
          const isHov = hoveredGu === gu.name;
          const r = isSel ? 6 : isHov ? 5 : 2.5;
          const dotColor = isSel ? "#f59e0b" : "#60a5fa";
          const textColor = isSel ? "#fde68a" : isHov ? "#93c5fd" : "#93c5fd";
          const textSize = isSel ? 9.5 : isHov ? 8.5 : 7.5;
          const fontWeight = isSel ? "700" : "400";

          return (
            <g key={gu.name}
              style={{ cursor:"pointer" }}
              onClick={e => { e.stopPropagation(); onSelectGu(gu); }}
              onMouseEnter={() => setHoveredGu(gu.name)}
              onMouseLeave={() => setHoveredGu(null)}
            >
              {isSel && (
                <circle cx={x} cy={y} r={12} fill="none" stroke="#f59e0b" strokeWidth="1" opacity="0.4" filter="url(#guGlow)"/>
              )}
              {isHov && !isSel && (
                <circle cx={x} cy={y} r={9} fill="rgba(96,165,250,0.15)" stroke="#60a5fa" strokeWidth="0.8" opacity="0.6"/>
              )}
              <circle cx={x} cy={y} r={r} fill={dotColor} opacity={isSel ? 1 : isHov ? 0.9 : 0.65}/>
              <text x={x} y={y - (isSel ? 9 : 6)} fontSize={textSize}
                fill={textColor} opacity={isSel ? 1 : isHov ? 1 : 0.75}
                textAnchor="middle" fontFamily="Malgun Gothic,sans-serif" fontWeight={fontWeight}>
                {gu.name}
              </text>
            </g>
          );
        })}

        {selectedGu && (() => {
          const [sx, sy] = toSvg(selectedGu.lat, selectedGu.lon);
          return (
            <>
              <circle cx={sx} cy={sy} r={14 + (pulse % 20) * 0.4} fill="none" stroke="#f59e0b" strokeWidth="1" opacity={0.35 - (pulse % 20) * 0.015}/>
              <text x={sx + 14} y={sy - 8} fontSize="9" fill="#fde68a" fontFamily="Malgun Gothic,sans-serif" fontWeight="700">▶ {selectedGu.name}</text>
            </>
          );
        })()}
      </svg>

    </div>
  );
}
