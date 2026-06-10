import { useEffect, useRef } from 'react'
import { speakAsync } from '../../lib/tts'

const MAX_VISIBLE = 8

export default function ComplaintNotificationBanner({ queue, onDismiss, isMuted = false }) {
  const spokenRef = useRef(new Set())

  // 새 알림 TTS — 최신 항목만, isMuted 반영
  useEffect(() => {
    if (!queue || queue.length === 0) return
    const latest = queue[queue.length - 1]
    if (spokenRef.current.has(latest.id)) return
    spokenRef.current.add(latest.id)
    if (!isMuted) {
      const gu  = latest.guName   ? `${latest.guName} `   : ''
      const cat = latest.category ? `${latest.category} ` : ''
      speakAsync(`${gu}${cat}민원이 접수되었습니다.`)
    }
  }, [queue, isMuted])

  if (!queue || queue.length === 0) return null

  const visible  = queue.slice(-MAX_VISIBLE)          // 최신 MAX_VISIBLE개
  const hiddenCt = Math.max(0, queue.length - MAX_VISIBLE)

  return (
    <>
      <style>{`
        @keyframes cbnIn {
          from { transform: translateY(20px); opacity: 0; }
          to   { transform: translateY(0);    opacity: 1; }
        }
      `}</style>

      <div style={{
        position:      'fixed',
        bottom:        28,
        left:          28,
        zIndex:        9999,
        display:       'flex',
        flexDirection: 'column',
        gap:           6,
        maxWidth:      400,
        maxHeight:     'calc(100vh - 120px)',
        overflowY:     'auto',
        overflowX:     'hidden',
        fontFamily:    "'Pretendard','Noto Sans KR',system-ui,sans-serif",
        pointerEvents: 'none',
        scrollbarWidth: 'none',
      }}>

        {/* 숨겨진 알림 개수 표시 */}
        {hiddenCt > 0 && (
          <div style={{
            fontSize:   10,
            color:      '#5a5a5a',
            padding:    '2px 4px',
            fontFamily: "'IBM Plex Mono',monospace",
          }}>
            ↑ 이전 알림 {hiddenCt}개 더
          </div>
        )}

        {visible.map((c, idx) => {
          const isNewest = idx === visible.length - 1
          return (
            <div key={c.id} style={{
              pointerEvents: 'auto',
              animation:     isNewest ? 'cbnIn 0.25s ease' : 'none',  // 최신 알림만 슬라이드인
            }}>

              {/* 메시지 박스 — title 있을 때 */}
              {c.title && (
                <div style={{
                  marginBottom:  4,
                  padding:       '8px 12px',
                  background:    '#0a0a0a',
                  border:        '1px solid #222',
                  borderRadius:  3,
                  fontSize:      12,
                  color:         '#aab4c8',
                  lineHeight:    1.6,
                }}>
                  {c.title}
                </div>
              )}

              {/* 알림 카드 */}
              <div style={{
                display:    'flex',
                alignItems: 'center',
                gap:        12,
                padding:    '12px 16px',
                background: '#0d0d0d',
                border:     '1px solid #2a2a2a',
                borderLeft: '3px solid #ffaa33',
                borderRadius: 4,
                minWidth:   300,
                boxShadow:  '0 8px 32px rgba(0,0,0,0.75)',
                opacity:    1,
              }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontSize:      10,
                    color:         '#ffaa33',
                    fontWeight:    600,
                    letterSpacing: '0.08em',
                    marginBottom:  4,
                    fontFamily:    "'IBM Plex Mono',monospace",
                  }}>
                    NEW · 민원 접수
                  </div>
                  <div style={{
                    fontSize:     13,
                    color:        '#e7ecf5',
                    fontWeight:   600,
                    overflow:     'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace:   'nowrap',
                  }}>
                    {[c.guName, c.category].filter(Boolean).join(' · ') || '민원 접수'}
                  </div>
                </div>

                <button
                  onClick={() => onDismiss(c.id)}
                  style={{
                    flexShrink:     0,
                    width:          22,
                    height:         22,
                    borderRadius:   '50%',
                    background:     'transparent',
                    border:         '1px solid #2a2a2a',
                    color:          '#7a7a7a',
                    cursor:         'pointer',
                    display:        'flex',
                    alignItems:     'center',
                    justifyContent: 'center',
                    fontSize:       12,
                    padding:        0,
                  }}
                  onMouseEnter={e => {
                    e.currentTarget.style.borderColor = '#4a4a4a'
                    e.currentTarget.style.color = '#e7ecf5'
                  }}
                  onMouseLeave={e => {
                    e.currentTarget.style.borderColor = '#2a2a2a'
                    e.currentTarget.style.color = '#7a7a7a'
                  }}
                >✕</button>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}
