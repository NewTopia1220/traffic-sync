/**
 * 미니 라인 차트 (SVG polyline + 그라데이션 영역)
 * LivCard 하단에 삽입되어 속도 히스토리를 시각화한다.
 *
 * @param {number[]} values  속도 배열 (2개 이상이어야 그려짐)
 * @param {string}   color   선/영역 색상 hex
 */
export default function Sparkline({ values, color }) {
  if (!values || values.length < 2) return null;

  const W = 300, H = 100;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;

  // 각 값을 SVG 좌표로 변환 (위아래 3px 여백)
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = H - ((v - min) / range) * (H - 6) - 3;
    return `${x},${y}`;
  }).join(" ");

  const gradId = `sg${color.replace("#", "")}`; // 색상별 고유 gradient id

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "100%", display: "block" }} preserveAspectRatio="none">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {/* 선 아래 채움 영역 (좌하단 → 데이터 → 우하단) */}
      <polygon points={`0,${H} ${pts} ${W},${H}`} fill={`url(#${gradId})`} />
      {/* 실선 */}
      <polyline points={pts} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
