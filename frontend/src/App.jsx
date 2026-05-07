import { useState } from 'react'
import MainDashboard from './pages/MainDashboard'
import MapDashboard from './pages/MapDashboard'

export default function App() {
  const [page, setPage] = useState('main')
  const [wsData, setWsData] = useState([])

  return page === 'main'
    ? <MainDashboard onGoMap={() => setPage('map')} wsData={wsData} setWsData={setWsData} />
    : <MapDashboard  onGoMain={() => setPage('main')} wsData={wsData} setWsData={setWsData} />
}