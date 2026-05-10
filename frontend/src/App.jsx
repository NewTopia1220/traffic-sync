import { useState } from 'react'
import MainDashboard from './pages/MainDashboard'
import MapDashboard from './pages/MapDashboard'
import CctvDashboard from './pages/CctvDashboard'
import { useWebSocket } from './hooks/useWebSocket'

export default function App() {
  const [page, setPage] = useState('main')
  const [wsData, setWsData] = useState([])
  const [mapCenter, setMapCenter] = useState(null)

  const { wsStatus, lastUpdate } = useWebSocket(setWsData)

  const goMap = (center) => {
    if (center) setMapCenter(center)
    setPage('map')
  }

  if (page === 'cctv') return <CctvDashboard onGoMain={() => setPage('main')} onGoMap={() => setPage('map')} />
  if (page === 'map') return <MapDashboard onGoMain={() => setPage('main')} onGoCctv={() => setPage('cctv')} wsData={wsData} setWsData={setWsData} initialCenter={mapCenter} wsStatus={wsStatus} lastUpdate={lastUpdate} />
  return <MainDashboard onGoMap={goMap} onGoCctv={() => setPage('cctv')} wsData={wsData} setWsData={setWsData} />
}