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
import { useState, useRef, useCallback } from 'react'

import LoginPage from './pages/LoginPage'
import MyPage from './pages/mypage/MyPage'
import MainDashboard from './pages/MainDashboard'
import MapDashboard from './pages/MapDashboard'
import CctvDashboard from './pages/CctvDashboard'
import SimulationDashboard from './pages/SimulationDashboard'
import NewsDashboard from './pages/NewsDashboard'
import ComplaintManagePage from './pages/ComplaintManagePage'
import CivilApp from './pages/civil/CivilApp'

import { useWebSocket } from './hooks/useWebSocket'
import { useAssistant } from './hooks/useAssistant'
import { speakAsync, stopAllTTS } from './lib/tts'
import LoginBriefingCard from './components/LoginBriefingCard'
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
  const [areaFetchState, setAreaFetchState] = useState({ status: 'idle', guName: null, count: 0 })
  const [readyArea, setReadyArea] = useState({ guName: null, count: 0 })
  const [navNotice, setNavNotice] = useState('')

  // 로그인 브리핑 카드
  const [loginBriefing, setLoginBriefing] = useState(null) // { name, gu, weatherDesc, temp, pendingCount }

  const showNavNotice = (message) => {
    setNavNotice(message)
    setTimeout(() => setNavNotice(''), 2500)
  }

  const isSimulationAreaReady = (gu = selectedGu) =>
    !!gu && readyArea.guName === gu.name

  const handleAreaFetchState = (nextState) => {
    setAreaFetchState(nextState)
    if (nextState?.status === 'done') {
      setReadyArea({ guName: nextState.guName, count: nextState.count ?? 0 })
    }
  }

  const enterSimulation = () => {
    if (areaFetchState.status === 'loading') {
      const fetchingGu = areaFetchState.guName
        ? GU_LIST.find(g => g.name === areaFetchState.guName)
        : null
      if (fetchingGu || selectedGu) setMapCenter(fetchingGu || selectedGu)
      setPage('main')
      showNavNotice(`${areaFetchState.guName || '선택 구'} 데이터 수집 중입니다. 완료 후 시뮬레이션을 열 수 있습니다.`)
      return
    }

    if (!isSimulationAreaReady()) {
      if (selectedGu) setMapCenter(selectedGu)
      setPage('main')
      showNavNotice(`${selectedGu?.name || '선택 구'} 데이터 수집이 끝난 뒤 시뮬레이션을 열 수 있습니다.`)
      return
    }

    if (selectedGu) setMapCenter(selectedGu)
    setPage('simulation')
  }

  // AI 어시스턴트 / 브리핑 로직 일체
  const assistant = useAssistant({
    page,
    onNavIntent: (intent) => {
      switch (intent.action) {
        case 'navigate':
          if (intent.page === 'map')             { if (selectedGu) setMapCenter(selectedGu); setPage('map') }
          else if (intent.page === 'simulation') enterSimulation()
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
  const goSimulation = () => assistant.tryNav(enterSimulation)

  // SVG 지도에서 구 선택 → 선택 상태 갱신 + 브리핑 시작 확인 팝업
  const handleSelectGu = (gu) => {
    if (assistant.isAnalyzing) { assistant.blockNav(); return }
    setSelectedGu(gu)
    setMapCenter(gu)
    const name = JSON.parse(localStorage.getItem('ts_user') || '{}').name || '관제사'
    assistant.promptGuBriefing(name, gu.name)
  }

  // ── 페이지별 조건부 렌더링 ──────────────────────────────────────

  if (page === 'civil') return <CivilApp onBack={() => setPage('login')} />

  if (page === 'login') return (
    <LoginPage
      onCivil={() => setPage('civil')}
      onLoginSuccess={async (data) => {
        const name = data.name || '관제사'
        const gu   = selectedGu?.name || '강남구'
        const API  = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/+$/, '')

        setPage(data.isTempPw ? 'mypage' : 'main')

        // 임시 비번이면 브리핑 없이 마이페이지로
        if (data.isTempPw) { assistant.greetOnLogin(name, gu); return }

        // 날씨 + 민원 미처리 건수 병렬 fetch
        let weatherDesc = '정보 없음', temp = '--', pendingCount = 0
        try {
          const pos = await new Promise((resolve, reject) =>
            navigator.geolocation.getCurrentPosition(
              p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
              reject, { timeout: 5000 }
            )
          )
          const [wRes, cRes] = await Promise.all([
            fetch(`${API}/api/civil/auth/weather?lat=${pos.lat}&lng=${pos.lng}`),
            fetch(`${API}/api/complaints`),
          ])
          if (wRes.ok) {
            const w = await wRes.json()
            weatherDesc = w.description || '정보 없음'
            temp = w.temperatureC != null ? `${Math.round(w.temperatureC)}도` : '--'
          }
          if (cRes.ok) {
            const complaints = await cRes.json()
            pendingCount = Array.isArray(complaints)
              ? complaints.filter(c => c.status === '접수').length
              : 0
          }
        } catch {}

        setLoginBriefing({ name, gu, weatherDesc, temp, pendingCount })
      }}
    />
  )

  if (page === 'mypage') return <MyPage onBack={() => setPage('main')} />

  if (page === 'complaints') return (
    <ComplaintManagePage onBack={() => setPage('map')} />
  )

  if (page === 'news') return (
    <NewsDashboard
      onGoMain={() => setPage('main')}
      onGoMap={goMap}
      onGoCctv={() => setPage('cctv')}
      onGoSimulation={goSimulation}
      onGoComplaints={() => setPage('complaints')}
      onGoMyPage={() => setPage('mypage')}
      onLogout={() => setPage('login')}
      selectedGu={selectedGu}
    />
  )

  if (page === 'simulation') return (
    <SimulationDashboard
      onGoMain={() => setPage('main')}
      onGoMap={goMap}
      onGoNews={() => setPage('news')}
      onGoCctv={() => setPage('cctv')}
      onGoComplaints={() => setPage('complaints')}
      onGoMyPage={() => setPage('mypage')}
      onLogout={() => setPage('login')}
      selectedGu={selectedGu}
    />
  )

  if (page === 'cctv') return (
    <CctvDashboard
      onGoMain={() => setPage('main')}
      onGoMap={goMap}
      onGoNews={() => setPage('news')}
      onGoSimulation={goSimulation}
      onGoComplaints={() => setPage('complaints')}
      onGoMyPage={() => setPage('mypage')}
      onLogout={() => setPage('login')}
      selectedGu={selectedGu}
    />
  )

  if (page === 'map') return (
    <MapDashboard
      onGoMain={() => setPage('main')}
      onGoCctv={() => setPage('cctv')}
      onGoNews={() => setPage('news')}
      onGoSimulation={goSimulation}
      onGoComplaints={() => setPage('complaints')}
      onGoMyPage={() => setPage('mypage')}
      onLogout={() => setPage('login')}
      selectedGu={selectedGu}
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

      {loginBriefing && (
        <LoginBriefingCard
          briefing={loginBriefing}
          onClose={() => {
            stopAllTTS()
            setLoginBriefing(null)
            assistant.activatePendingBriefing(loginBriefing.name, loginBriefing.gu)
          }}
          onTTSDone={() => {
            setLoginBriefing(null)
            assistant.activatePendingBriefing(loginBriefing.name, loginBriefing.gu)
          }}
        />
      )}

      <NavBlockToast message={assistant.navBlockMsg || navNotice} />

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
        onGoSimulation={goSimulation}
        onGoComplaints={() => assistant.tryNav(() => setPage('complaints'))}
        onGoMyPage={() => assistant.tryNav(() => setPage('mypage'))}
        onLogout={() => assistant.tryNav(() => setPage('login'))}
        wsData={wsData}
        setWsData={setWsData}
        stations={stations}
        setStations={setStations}
        selectedGu={selectedGu}
        onSelectGu={handleSelectGu}
        onAreaFetchState={handleAreaFetchState}
        onRegisterSelectGu={(fn) => { selectGuRef.current = fn }}
        isMuted={assistant.isMuted}
        onToggleMute={assistant.toggleMute}
      />
    </>
  )
}
