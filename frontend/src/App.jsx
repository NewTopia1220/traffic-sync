/**
 * App — 애플리케이션 최상위 컴포넌트
 * ==================================================================
 * React Router 없이 useState(page)로 화면을 전환하는 단일 페이지 구조.
 * URL은 바뀌지 않고 page 값에 따라 렌더링할 화면이 결정된다.
 *
 *   login → LoginPage
 *   main  → MainDashboard (기본)
 *   map   → MapDashboard
 *   cctv  → CctvDashboard
 *   news  → NewsDashboard
 *   simulation → SimulationDashboard
 *   mypage → MyPage
 *
 * WebSocket 교차로 데이터(wsData)와 선택 구(selectedGu)는 여러 화면이
 * 공유하므로 App에서 관리하고 props로 내려준다.
 *
 * AI 음성 어시스턴트 / 구 브리핑 관련 로직은 모두 useAssistant 훅에 있고,
 * App은 그 상태를 받아 메인 화면 위에 팝업 컴포넌트들을 띄우기만 한다.
 */
import { useState, useRef } from 'react'

import LoginPage from './pages/LoginPage'
import MyPage from './pages/mypage/MyPage'
import MainDashboard from './pages/MainDashboard'
import MapDashboard from './pages/MapDashboard'
import CctvDashboard from './pages/CctvDashboard'
import SimulationDashboard from './pages/SimulationDashboard'
import NewsDashboard from './pages/NewsDashboard'

import { useWebSocket } from './hooks/useWebSocket'
import { useAssistant } from './hooks/useAssistant'
import { GU_LIST } from './constants/seoulGeoData'

import NavBlockToast from './components/assistant/NavBlockToast'
import VoiceAssistantPanel from './components/assistant/VoiceAssistantPanel'
import AIFloatingButton from './components/assistant/AIFloatingButton'
import PendingBriefingPopup from './components/assistant/PendingBriefingPopup'
import { AssistantKeyframes } from './components/assistant/assistantStyles'

export default function App() {
  // localStorage에 로그인 정보 있으면 바로 메인, 없으면 로그인 페이지
  const [page, setPage] = useState(() =>
    localStorage.getItem('ts_user') ? 'main' : 'login'
  )

  // 여러 화면이 공유하는 데이터 상태
  const [wsData, setWsData] = useState([])
  const { wsStatus, lastUpdate } = useWebSocket(setWsData)
  const [mapCenter, setMapCenter] = useState(null)             // 지도 초기 중심 좌표
  const [selectedGu, setSelectedGu] = useState(() => GU_LIST.find(g => g.name === '강남구'))
  const [stations, setStations] = useState([])                // 메인에서 fetch한 교통량 지점
  // MainDashboard의 handleSelectGu(fetch-area 포함)를 받아두는 ref
  const selectGuRef = useRef(null)

  // AI 어시스턴트 / 브리핑 로직 일체
  const assistant = useAssistant({
    page,
    onNavIntent: (intent) => {
      switch (intent.action) {
        case 'navigate':
          if (intent.page === 'map')             { if (selectedGu) setMapCenter(selectedGu); setPage('map') }
          else if (intent.page === 'simulation') setPage('simulation')
          else if (intent.page === 'cctv')       setPage('cctv')
          else if (intent.page === 'news')       setPage('news')
          break
        case 'select_gu': {
          const gu = GU_LIST.find(g => g.name === intent.gu || intent.gu?.includes(g.name))
          // fetch-area 포함된 MainDashboard 핸들러 우선 사용
          if (gu) selectGuRef.current ? selectGuRef.current(gu) : (setSelectedGu(gu), setMapCenter(gu))
          break
        }
        case 'mypage': setPage('mypage'); break
        case 'logout':  setPage('login'); break
      }
    },
  })

  // 구 클릭 → 지도 페이지로 이동 (분석 중이면 차단)
  const goMap = (center) => assistant.tryNav(() => {
    if (center) setMapCenter(center)
    setPage('map')
  })

  // SVG 지도에서 구 선택 → 선택 상태 갱신 + 브리핑 시작 확인 팝업
  const handleSelectGu = (gu) => {
    if (assistant.isAnalyzing) { assistant.blockNav(); return }
    setSelectedGu(gu)
    setMapCenter(gu)
    const name = JSON.parse(localStorage.getItem('ts_user') || '{}').name || '관제사'
    assistant.promptGuBriefing(name, gu.name)
  }

  // ── 페이지별 조건부 렌더링 ──────────────────────────────────────

  if (page === 'login') return (
    <LoginPage onLoginSuccess={(data) => {
      const name = data.name || '관제사'
      const gu   = selectedGu?.name || '강남구'
      assistant.greetOnLogin(name, gu)  // 환영 인사 + 시작 확인 팝업
      setPage(data.isTempPw ? 'mypage' : 'main')
    }} />
  )

  if (page === 'mypage') return <MyPage onBack={() => setPage('main')} />

  if (page === 'news') return (
    <NewsDashboard
      onGoMain={() => setPage('main')}
      onGoMap={goMap}
      onGoCctv={() => setPage('cctv')}
      onGoSimulation={() => setPage('simulation')}
    />
  )

  if (page === 'simulation') return (
    <SimulationDashboard
      onGoMain={() => setPage('main')}
      onGoMap={() => setPage('map')}
    />
  )

  if (page === 'cctv') return (
    <CctvDashboard
      onGoMain={() => setPage('main')}
      onGoMap={() => setPage('map')}
    />
  )

  if (page === 'map') return (
    <MapDashboard
      onGoMain={() => setPage('main')}
      onGoCctv={() => setPage('cctv')}
      wsData={wsData}
      setWsData={setWsData}
      initialCenter={mapCenter}
      wsStatus={wsStatus}
      lastUpdate={lastUpdate}
      stations={stations}
    />
  )

  // ── 메인 대시보드 + AI 어시스턴트 팝업들 ────────────────────────
  return (
    <>
      <AssistantKeyframes />

      <NavBlockToast message={assistant.navBlockMsg} />

      {/* 음성 어시스턴트 채팅 팝업 (최소화 상태가 아닐 때만) */}
      {assistant.voiceUI.active && !assistant.voiceMinimized && (
        <VoiceAssistantPanel
          voiceUI={assistant.voiceUI}
          voiceSTTActive={assistant.voiceSTTActive}
          msgEndRef={assistant.msgEndRef}
          onStartSTT={assistant.startVoiceSTT}
          onStopTTS={assistant.stopAllTTS}
          onMinimize={assistant.minimizeVoiceUI}
          onClose={assistant.closeVoiceUI}
          onEmailConfirm={assistant.handleEmailConfirmClick}
        />
      )}

      {/* 항상 보이는 AI 플로팅 버튼 */}
      <AIFloatingButton
        active={assistant.voiceUI.active}
        minimized={assistant.voiceMinimized}
        onClick={assistant.onFloatingClick}
      />

      {/* 구 분석 시작 확인 팝업 — 보이스 패널이 열려있으면 그 왼쪽에 위치 */}
      <PendingBriefingPopup
        pending={assistant.pendingBriefing}
        onStart={assistant.acceptPendingBriefing}
        onDismiss={assistant.dismissPendingBriefing}
        shifted={assistant.voiceUI.active && !assistant.voiceMinimized}
      />

      <MainDashboard
        onGoMap={goMap}
        onGoCctv={() => assistant.tryNav(() => setPage('cctv'))}
        onGoNews={() => assistant.tryNav(() => setPage('news'))}
        onGoSimulation={() => assistant.tryNav(() => setPage('simulation'))}
        onGoMyPage={() => assistant.tryNav(() => setPage('mypage'))}
        onLogout={() => assistant.tryNav(() => setPage('login'))}
        wsData={wsData}
        setWsData={setWsData}
        stations={stations}
        setStations={setStations}
        selectedGu={selectedGu}
        onSelectGu={handleSelectGu}
        onRegisterSelectGu={(fn) => { selectGuRef.current = fn }}
        isMuted={assistant.isMuted}
        onToggleMute={assistant.toggleMute}
      />
    </>
  )
}
