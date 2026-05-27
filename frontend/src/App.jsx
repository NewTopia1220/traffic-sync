import { useState } from 'react'
import LoginPage from './pages/LoginPage'
import MyPage from './pages/mypage/MyPage'
import MainDashboard from './pages/MainDashboard'
import MapDashboard from './pages/MapDashboard'
import CctvDashboard from './pages/CctvDashboard'
import SimulationDashboard from './pages/SimulationDashboard'
import NewsDashboard from './pages/NewsDashboard'
import { useWebSocket } from './hooks/useWebSocket'

/**
 * App 컴포넌트 — 애플리케이션 최상위 컴포넌트
 *
 * React Router 없이 useState로 직접 페이지를 전환하는 방식.
 * URL은 바뀌지 않고 page state 값에 따라 렌더링할 컴포넌트가 결정됨.
 *
 * 페이지 구조:
 *   'main' → MainDashboard  (통합 대시보드, 기본 페이지)
 *   'map'  → MapDashboard   (실시간 교차로 지도)
 *   'cctv' → CctvDashboard  (CCTV 관제)
 */
export default function App() {

  // localStorage에 로그인 정보 있으면 바로 메인, 없으면 로그인 페이지
  const [page, setPage] = useState(() =>
    localStorage.getItem("ts_user") ? 'main' : 'login'
  )

  // WebSocket으로 받은 교차로 신호 데이터 배열
  // MainDashboard와 MapDashboard가 같은 데이터를 공유해야 하므로
  // 공통 부모인 App에서 관리하고 props로 내려줌
  const [wsData, setWsData] = useState([])
  const { wsStatus, lastUpdate } = useWebSocket(setWsData)

  // 통합 대시보드에서 구를 클릭했을 때 해당 구의 좌표 저장
  // 지도 페이지로 이동할 때 initialCenter로 전달해 카카오맵 초기 중심을 설정
  const [mapCenter, setMapCenter] = useState(null)

  /**
   * goMap — 지도 페이지로 이동하는 함수
   * @param {Object} center - 이동할 구의 좌표 { lat, lon, name }
   *
   * MainDashboard에서 구 클릭 시 호출됨.
   * center가 있으면 mapCenter에 저장 후 'map' 페이지로 전환.
   * center 없이 호출하면 이전 좌표(또는 null) 유지.
   */
  const goMap = (center) => {
    if (center) setMapCenter(center)
    setPage('map')
  }

  const [stations, setStations] = useState([]);

  // ── 페이지 조건부 렌더링 ──────────────────────────────

  // 로그인 페이지
  if (page === 'login') return (
    <LoginPage onLoginSuccess={(data) => {
      setPage(data.isTempPw ? 'mypage' : 'main')
    }} />
  )

  // 마이페이지
  if (page === 'mypage') return (
    <MyPage onBack={() => setPage('main')} />
  )

  // 뉴스 감성 분석 페이지
  if (page === 'news') return (
    <NewsDashboard
      onGoMain={() => setPage('main')}
      onGoMap={goMap}
      onGoCctv={() => setPage('cctv')}
      onGoSimulation={() => setPage('simulation')}
    />
  )

  // 신호 시뮬레이션 페이지
  if (page === 'simulation') return (
    <SimulationDashboard
      onGoMain={() => setPage('main')}
      onGoMap={() => setPage('map')}
    />
  )

  // CCTV 관제 페이지
  if (page === 'cctv') return (
    <CctvDashboard
      onGoMain={() => setPage('main')}  // "← 대시보드" 버튼
      onGoMap={() => setPage('map')}    // "지도 보기" 버튼
    />
  )

  // 실시간 지도 페이지
  if (page === 'map') return (
    <MapDashboard
      onGoMain={() => setPage('main')}    // "← 대시보드" 버튼
      onGoCctv={() => setPage('cctv')}    // "CCTV 관제" 버튼
      wsData={wsData}                     // 교차로 신호 데이터 (읽기)
      setWsData={setWsData}               // WebSocket 수신 시 데이터 업데이트 (쓰기)
      initialCenter={mapCenter}           // 카카오맵 초기 중심 좌표
      wsStatus={wsStatus}
      lastUpdate={lastUpdate}
      stations={stations}                 // 메인에서 fetch해온 전체 데이터가 넘어감
    />
  )

  // 통합 대시보드 (기본 페이지 — page === 'main')
  return (
    <MainDashboard
      onGoMap={goMap}                           // 구 클릭 시 좌표와 함께 지도 페이지로 이동
      onGoCctv={() => setPage('cctv')}          // CCTV 관제 페이지로 이동
      onGoNews={() => setPage('news')}          // 뉴스 감성 분석 페이지로 이동
      onGoSimulation={() => setPage('simulation')} // 신호 시뮬레이션 페이지로 이동
      onGoMyPage={() => setPage('mypage')}      // 마이페이지로 이동
      onLogout={() => setPage('login')}         // 로그아웃
      wsData={wsData}                           // 교차로 신호 데이터 (읽기)
      setWsData={setWsData}                     // 데이터 업데이트 (쓰기) — 현재는 미사용
      stations={stations}
      setStations={setStations}
    />
  )
  }

