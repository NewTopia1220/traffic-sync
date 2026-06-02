/**
 * AI 어시스턴트 팝업 공용 스타일/상수
 * ------------------------------------------------------------------
 * - AssistantKeyframes : 슬라이드/페이드/도트/진행바 keyframes를 한 번만 주입
 * - VOICE_STATUS_LABEL : voiceUI.status → 헤더에 표시할 한글 라벨
 * - TOOL_ICONS         : 브리핑 단계에서 도구 이름 → 이모지 매핑
 */

export const VOICE_STATUS_LABEL = {
  greeting: 'AI 안내 중',
  listening: '🎤 듣는 중...',
  thinking: '분석 중...',
  speaking: '🔊 응답 중',
  email_confirm: '이메일 발송 확인',
  done: '완료',
  idle: '',
}

export const TOOL_ICONS = {
  get_traffic_data: '🚦',
  get_bottleneck_list: '🚨',
  get_district_traffic: '📊',
  search_crossroad_by_name: '🔍',
  get_simulation_context: '⚙️',
  send_email_report: '📧',
  send_alert: '🔔',
  search_project_docs: '📚',
}

/** 어시스턴트 팝업/오버레이가 공유하는 keyframes. 앱에서 한 번만 렌더한다. */
export function AssistantKeyframes() {
  return (
    <style>{`
      @keyframes brSlideIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
      @keyframes brFadeIn  { from{opacity:0;transform:translateY(4px)}  to{opacity:1;transform:translateY(0)} }
      @keyframes brDot     { 0%,100%{opacity:1} 50%{opacity:0.2} }
      @keyframes brProgress { 0%{width:0%;margin-left:0} 50%{width:60%;margin-left:20%} 100%{width:0%;margin-left:100%} }
      @keyframes micPulse  { 0%,100%{box-shadow:0 0 0 0 rgba(255,60,60,0.4)} 50%{box-shadow:0 0 0 6px rgba(255,60,60,0)} }
    `}</style>
  )
}
