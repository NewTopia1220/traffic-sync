/**
 * AI 플로팅 버튼 (우하단 고정)
 * - 세션이 없으면 'AI' 표시 → 클릭 시 새 음성 세션 시작
 * - 세션이 열려 있으면 '−' 표시 → 클릭 시 패널 최소화/펼치기 토글
 *
 * @param {boolean} active     음성 세션 활성 여부
 * @param {boolean} minimized  패널 최소화 여부
 * @param {Function} onClick   클릭 핸들러
 */
export default function AIFloatingButton({ active, minimized, onClick }) {
  return (
    <button
      onClick={onClick}
      title="AI 교통 어시스턴트"
      style={{
        position: 'fixed', bottom: 28, right: 28, zIndex: 9998,
        width: 56, height: 56, borderRadius: '50%',
        background: active ? 'rgba(30,30,35,0.97)' : 'rgba(20,20,24,0.95)',
        border: active ? '1.5px solid rgba(255,255,255,0.2)' : '1.5px solid rgba(255,255,255,0.1)',
        color: 'rgba(255,255,255,0.82)',
        fontSize: 13, fontWeight: 700,
        cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        boxShadow: '0 6px 24px rgba(0,0,0,0.6)',
        backdropFilter: 'blur(16px)',
        fontFamily: 'system-ui,-apple-system,sans-serif',
        letterSpacing: '0.5px',
        transition: 'border-color .2s',
      }}
    >
      {active && !minimized ? '−' : 'AI'}
    </button>
  )
}
