/**
 * 네비게이션 차단 토스트
 * 분석 진행 중 다른 페이지로 이동을 시도하면 상단에 잠깐 표시된다.
 * @param {string} message  표시할 안내 문구 (빈 값이면 렌더 안 함)
 */
export default function NavBlockToast({ message }) {
  if (!message) return null
  return (
    <div style={{
      position: 'fixed', top: 22, left: '50%', transform: 'translateX(-50%)',
      zIndex: 99999,
      background: 'rgba(20,20,24,0.96)',
      backdropFilter: 'blur(16px)',
      border: '1px solid rgba(255,180,50,0.4)',
      borderRadius: 10, padding: '11px 22px',
      color: 'rgba(255,200,80,0.92)', fontSize: 13, fontWeight: 600,
      boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
      fontFamily: 'system-ui,-apple-system,sans-serif',
      animation: 'brSlideIn .2s ease',
      whiteSpace: 'nowrap',
    }}>
      ⚠ {message}
    </div>
  )
}
