import { useState } from 'react'
import MainDashboard from './pages/MainDashboard'
import MapDashboard from './pages/MapDashboard'
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

  return page === 'main'
    ? <MainDashboard onGoMap={goMap} wsData={wsData} setWsData={setWsData} />
    : <MapDashboard onGoMain={() => setPage('main')} wsData={wsData} setWsData={setWsData} initialCenter={mapCenter} wsStatus={wsStatus} lastUpdate={lastUpdate} />
}