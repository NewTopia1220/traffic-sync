import { useState, useEffect } from "react";
import { GU_LIST } from "../../constants/seoulGeoData";

// HTML 파일 기준 하드코딩 좌표 (viewBox="0 0 460 320")
const GU_COORDS = {
  "도봉구":   { cx:320, cy:40  },
  "노원구":   { cx:290, cy:60  },
  "강북구":   { cx:250, cy:80  },
  "은평구":   { cx:100, cy:80  },
  "성북구":   { cx:218, cy:106 },
  "중랑구":   { cx:320, cy:100 },
  "종로구":   { cx:170, cy:124 },
  "서대문구": { cx:130, cy:140 },
  "동대문구": { cx:282, cy:130 },
  "마포구":   { cx:92,  cy:160 },
  "중구":     { cx:220, cy:148 },
  "성동구":   { cx:262, cy:158 },
  "강서구":   { cx:56,  cy:220 },
  "영등포구": { cx:140, cy:218 },
  "광진구":   { cx:320, cy:148 },
  "강동구":   { cx:412, cy:230 },
  "양천구":   { cx:100, cy:226 },
  "동작구":   { cx:190, cy:220 },
  "강남구":   { cx:260, cy:234 },
  "구로구":   { cx:64,  cy:252 },
  "금천구":   { cx:80,  cy:290 },
  "관악구":   { cx:180, cy:270 },
  "서초구":   { cx:250, cy:282 },
  "송파구":   { cx:370, cy:240 },
  "용산구":   { cx:200, cy:150 },
};

// 한강 path (HTML 파일 그대로)
const HANGANG = "M0,170 C80,158 150,200 220,180 C300,158 360,200 460,178 L460,200 C360,222 300,180 220,202 C150,222 80,180 0,192 Z";

export default function SeoulSvgMap({ onGoMap, selectedGu, onSelectGu, loading }) {
  const [hoveredGu, setHoveredGu] = useState(null);
  const [pulse, setPulse] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setPulse(p => (p + 1) % 60), 60);
    return () => clearInterval(t);
  }, []);

  // GU_LIST 기준으로 렌더링, 좌표는 GU_COORDS에서 가져옴
  const guEntries = GU_LIST.map(gu => ({
    ...gu,
    coord: GU_COORDS[gu.name],
  })).filter(gu => gu.coord);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%", userSelect: "none" }}>

      {loading && (
        <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <div style={{ width: 16, height: 16, border: "2px solid #333", borderTop: "2px solid #4ea6ff", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
          <span style={{ fontSize: 12, color: "#4ea6ff", fontFamily: "monospace" }}>수집 중...</span>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
        </div>
      )}

      <svg
        viewBox="0 0 460 320"
        preserveAspectRatio="xMidYMid meet"
        style={{ width: "100%", height: "100%", display: "block" }}
      >
        {/* 배경 */}
        <rect width="460" height="320" fill="#000" />

        {/* 한강 */}
        <path d={HANGANG} fill="#1f5c8a" opacity="0.55" />
        <text x="232" y="195" textAnchor="middle"
          fontFamily="Pretendard,'Malgun Gothic',sans-serif"
          fontSize="9" fill="#9bd0ec">한강</text>

        {/* 자치구 */}
        <g fontFamily="Pretendard,'Malgun Gothic',sans-serif" fontSize="9" fill="#aab4c8">
          {guEntries.map(gu => {
            const { cx, cy } = gu.coord;
            const isSel = selectedGu?.name === gu.name;
            const isHov = hoveredGu === gu.name;

            // 한강(y 170~200)과 겹치면 라벨 아래로
            const onRiver = cy >= 165 && cy <= 205;
            const textY = onRiver ? cy + 13 : cy - 7;

            return (
              <g key={gu.name}
                style={{ cursor: "pointer" }}
                onClick={e => { e.stopPropagation(); onSelectGu(gu); }}
                onMouseEnter={() => setHoveredGu(gu.name)}
                onMouseLeave={() => setHoveredGu(null)}
              >
                {/* 선택 링 */}
                {isSel && (
                  <>
                    <circle cx={cx} cy={cy} r={22} fill="rgba(255,170,51,.10)" stroke="rgba(255,170,51,.45)" strokeWidth="1" />
                    <circle cx={cx} cy={cy} r={14} fill="rgba(255,170,51,.18)" stroke="rgba(255,170,51,.6)"  strokeWidth="1" />
                    {/* 펄스 */}
                    <circle cx={cx} cy={cy} r={26 + (pulse % 30) * 0.4} fill="none" stroke="rgba(255,170,51,.3)" strokeWidth="0.8"
                      opacity={Math.max(0, 0.35 - (pulse % 30) * 0.012)} />
                  </>
                )}
                {isHov && !isSel && (
                  <circle cx={cx} cy={cy} r={9} fill="rgba(78,166,255,0.12)" stroke="#4ea6ff" strokeWidth="0.8" opacity="0.7" />
                )}

                {/* 점 */}
                <circle cx={cx} cy={cy} r={isSel ? 6 : 3}
                  fill={isSel ? "#ffaa33" : "#4ea6ff"}
                  stroke={isSel ? "#fff" : "none"}
                  strokeWidth={isSel ? "1" : "0"}
                  opacity={isHov && !isSel ? 1 : 0.9} />

                {/* 라벨 */}
                <text x={cx} y={textY} textAnchor="middle"
                  fill={isSel ? "#ffaa33" : isHov ? "#e2e8f0" : "#aab4c8"}
                  fontSize={isSel ? "10" : "9"}
                  fontWeight={isSel ? "700" : "400"}
                  opacity={isSel ? 1 : isHov ? 1 : 0.9}>
                  {gu.name}
                </text>

              </g>
            );
          })}
        </g>
      </svg>

    </div>
  );
}
