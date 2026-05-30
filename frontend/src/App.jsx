import { useState, useCallback, useRef, useEffect } from 'react'
import { useClapDetection } from './hooks/useClapDetection'

const PYTHON_BASE    = (import.meta.env.VITE_PYTHON_URL    || 'http://localhost:8001').replace(/\/+$/, '')
const API_BASE       = (import.meta.env.VITE_API_URL       || 'http://localhost:8080').replace(/\/+$/, '')
const GOOGLE_TTS_KEY = import.meta.env.VITE_GOOGLE_TTS_KEY || ''

// ── Google Cloud TTS — 단일 전역 큐 (모든 발화가 순차 재생, 겹침 없음) ──
function stripMd(text) {
  return text.replace(/#{1,6}\s/g,'').replace(/\*\*(.*?)\*\*/g,'$1').replace(/\*(.*?)\*/g,'$1').replace(/`(.*?)`/g,'$1').trim()
}

let _ttsChain = Promise.resolve()
let _currentTTSAudio = null
let _ttsMuted = false  // 음소거 플래그

// 모든 speakAsync 호출은 이 큐에 순서대로 쌓임
function speakAsync(text, rate = 1.0) {
  if (_ttsMuted || !GOOGLE_TTS_KEY || !text) return Promise.resolve()
  const p = _ttsChain.then(async () => {
    try {
      const res = await fetch(
        `https://texttospeech.googleapis.com/v1/text:synthesize?key=${GOOGLE_TTS_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            input: { text: stripMd(text).slice(0, 4500) },
            voice: { languageCode: 'ko-KR', name: 'ko-KR-Neural2-C', ssmlGender: 'MALE' },
            audioConfig: { audioEncoding: 'MP3', speakingRate: rate },
          }),
        }
      )
      const data = await res.json()
      if (!data.audioContent) return
      await new Promise(resolve => {
        const audio = new Audio(`data:audio/mp3;base64,${data.audioContent}`)
        _currentTTSAudio          = audio
        window.__currentBriefingAudio = audio
        window.__stopBriefingAudio    = () => {
          audio.pause()
          _currentTTSAudio = null
          window.__currentBriefingAudio = null
          window.__stopBriefingAudio    = null
          _ttsChain = Promise.resolve()  // 클랩 중단 시 나머지 큐도 버림
          resolve()
        }
        audio.onended = () => { _currentTTSAudio = null; window.__stopBriefingAudio = null; resolve() }
        audio.onerror = resolve
        audio.play()
      })
    } catch { /* TTS 실패 무시 */ }
  })
  _ttsChain = p
  return p
}

// 큐 전체 중단 — 현재 오디오 resolve 후 큐 초기화 (await speakAsync 언블록)
function stopAllTTS() {
  if (window.__stopBriefingAudio) {
    window.__stopBriefingAudio()  // resolve() 호출 포함 → await speakAsync 풀림
  } else if (_currentTTSAudio) {
    _currentTTSAudio.pause()
    _currentTTSAudio = null
    window.__currentBriefingAudio = null
  }
  _ttsChain = Promise.resolve()
}

// STT 한 번 듣고 transcript 반환 (타임아웃 시 null)
function listenOnce(timeoutMs = 8000) {
  return new Promise(resolve => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { resolve(null); return }
    const r = new SR()
    r.lang = 'ko-KR'
    r.maxAlternatives = 1
    let done = false
    const finish = (val) => { if (!done) { done = true; resolve(val) } }
    r.onresult = e => finish(e.results[0][0].transcript)
    r.onerror  = () => finish(null)
    r.onend    = () => finish(null)
    setTimeout(() => { try { r.abort() } catch {} finish(null) }, timeoutMs)
    r.start()
  })
}

import LoginPage from './pages/LoginPage'
import MyPage from './pages/mypage/MyPage'
import MainDashboard from './pages/MainDashboard'
import MapDashboard from './pages/MapDashboard'
import CctvDashboard from './pages/CctvDashboard'
import SimulationDashboard from './pages/SimulationDashboard'
import NewsDashboard from './pages/NewsDashboard'
import { useWebSocket } from './hooks/useWebSocket'
import { GU_LIST } from './constants/seoulGeoData'

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

  // 캐시 로그인으로 바로 진입 시에도 브리핑 확인 팝업 표시
  const [pendingBriefing, setPendingBriefing] = useState(() => {
    const cached = localStorage.getItem("ts_user")
    if (!cached) return null
    try {
      const user = JSON.parse(cached)
      return { name: user.name || '관제사', gu: '강남구' }
    } catch { return null }
  })

  const [isMuted, setIsMuted] = useState(false)
  const toggleMute = () => {
    _ttsMuted = !_ttsMuted
    if (_ttsMuted) stopAllTTS()
    setIsMuted(_ttsMuted)
  }

  // WebSocket으로 받은 교차로 신호 데이터 배열
  // MainDashboard와 MapDashboard가 같은 데이터를 공유해야 하므로
  // 공통 부모인 App에서 관리하고 props로 내려줌
  const [wsData, setWsData] = useState([])
  const { wsStatus, lastUpdate } = useWebSocket(setWsData)

  // 통합 대시보드에서 구를 클릭했을 때 해당 구의 좌표 저장
  // 지도 페이지로 이동할 때 initialCenter로 전달해 카카오맵 초기 중심을 설정
  const [mapCenter, setMapCenter] = useState(null)

  // 선택된 구 — App 레벨에서 유지해야 페이지 이동 후 복귀 시 대시보드가 비지 않음
  // 기본값: 강남구 (로그인 직후 자동 fetch-area 호출됨)
  const [selectedGu, setSelectedGu] = useState(() => GU_LIST.find(g => g.name === "강남구"))

  /**
   * goMap — 지도 페이지로 이동하는 함수
   * @param {Object} center - 이동할 구의 좌표 { lat, lon, name }
   *
   * MainDashboard에서 구 클릭 시 호출됨.
   * center가 있으면 mapCenter에 저장 후 'map' 페이지로 전환.
   * center 없이 호출하면 이전 좌표(또는 null) 유지.
   */
  const goMap = (center) => tryNav(() => {
    if (center) setMapCenter(center)
    setPage('map')
  })

  const handleSelectGu = (gu) => {
    if (isAnalyzing) { blockNav(); return }
    setSelectedGu(gu)
    setMapCenter(gu)
    const name = JSON.parse(localStorage.getItem('ts_user') || '{}').name || '관제사'
    // LLM 바로 호출 대신 확인 팝업
    speakAsync(`${gu.name} 분석을 시작할까요?`)
    setPendingBriefing({ name, gu: gu.name })
  }

  const [stations, setStations] = useState([])

  // ── 구 클릭 브리핑 오버레이 (gu-click 전용) ───────────────
  const [briefing, setBriefing] = useState({ active: false, steps: [], status: 'loading', emailReady: false, report: '', district: '' })

  // ── 음성 어시스턴트 팝업 (박수/로그인 트리거) ────────────────
  const [voiceUI, setVoiceUI] = useState({
    active: false,
    messages: [],
    steps: [],
    status: 'idle',
    report: '',
  })
  const [voiceMinimized, setVoiceMinimized] = useState(false)
  const [voiceSTTActive, setVoiceSTTActive] = useState(false)
  const [navBlockMsg, setNavBlockMsg] = useState('')

  // voiceUI, briefing 선언 이후에 위치 (TDZ 방지)
  // 실제 AI 추론 중일 때만 차단 — TTS 재생(speaking)·대기(listening) 중엔 이동 허용
  const isAnalyzing =
    (voiceUI.active && voiceUI.status === 'thinking') ||
    (briefing.active && briefing.status === 'loading')

  const blockNav = () => {
    setNavBlockMsg('분석 중에는 다른 페이지로 이동할 수 없습니다.')
    setTimeout(() => setNavBlockMsg(''), 2500)
  }
  const tryNav = (fn) => { if (isAnalyzing) { blockNav(); return } fn() }
  const voiceMsgEndRef       = useRef(null)
  const emailConfirmRef      = useRef(null)
  const voiceInputRef        = useRef(null)  // STT 결과 resolver (버튼·자동 공용)
  const voiceSessionRef      = useRef(null)
  const briefingAbortRef     = useRef(null)
  const runBriefingRef       = useRef(null)  // pendingBriefing STT에서 참조

  const sttRecRef = useRef(null)  // 현재 실행 중인 SpeechRecognition 인스턴스

  // 마이크 STT 시작/중단 토글
  const startVoiceSTT = () => {
    // AI가 처리 중이면 마이크 불가
    const blockedStatus = ['thinking', 'speaking', 'greeting', 'email_confirm']
    if (blockedStatus.includes(voiceUI.status)) return

    // 이미 켜져 있으면 중단
    if (voiceSTTActive) {
      sttRecRef.current?.abort()
      sttRecRef.current = null
      setVoiceSTTActive(false)
      setVoiceUI(prev => ({ ...prev, status: 'idle' }))
      return
    }

    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const r = new SR()
    r.lang = 'ko-KR'; r.maxAlternatives = 1
    sttRecRef.current = r
    setVoiceSTTActive(true)
    setVoiceUI(prev => ({ ...prev, status: 'listening' }))
    r.onresult = (e) => {
      const text = e.results[0][0].transcript
      sttRecRef.current = null
      setVoiceSTTActive(false)
      setVoiceUI(prev => ({ ...prev, status: 'idle' }))
      if (voiceInputRef.current) { voiceInputRef.current(text); voiceInputRef.current = null }
    }
    r.onerror = () => {
      sttRecRef.current = null
      setVoiceSTTActive(false)
      setVoiceUI(prev => ({ ...prev, status: 'idle' }))
    }
    r.onend = () => {
      // 결과 없이 종료 — 상태 초기화
      if (sttRecRef.current) { sttRecRef.current = null }
      setVoiceSTTActive(false)
      setVoiceUI(prev => prev.status === 'listening' ? { ...prev, status: 'idle' } : prev)
    }
    r.start()
  }

  // STT 결과를 Promise로 받기 — 버튼으로도, 자동으로도 resolve 가능
  const waitForVoiceInput = (autoStartMs = 600) => new Promise(resolve => {
    voiceInputRef.current = resolve
    setTimeout(() => {
      if (voiceInputRef.current) startVoiceSTT()  // 일정 시간 후 자동 시작
    }, autoStartMs)
  })

  // ── 전역 박수 감지 ──────────────────────────────────────
  useClapDetection({
    enabled: true,
    onDoubleClap: useCallback(() => {
      if (window.__chatbotSpeaking) return
      if (page === 'map') return  // 지도 페이지는 챗봇 hook이 처리
      const isPlaying = !!(window.__currentBriefingAudio && !window.__currentBriefingAudio.paused)
      if (isPlaying) {
        stopAllTTS()
        return
      }
      if (briefing.active) return  // gu-click 브리핑 중엔 무시
      if (voiceUI.active && voiceUI.status === 'thinking') return  // AI 추론 중엔 새 세션 금지
      // 열려있는 팝업 자동 닫기 (아니요 처리)
      if (pendingBriefing) setPendingBriefing(null)
      if (voiceUI.active) {
        emailConfirmRef.current?.(false)
        stopAllTTS()
        setVoiceUI({ active: false, messages: [], steps: [], status: 'idle', report: '' })
      }
      voiceSessionRef.current?.()
    }, [page, briefing.active, pendingBriefing, voiceUI.active]),
  })

  // ── 이메일 확인 버튼 클릭 핸들러 ──────────────────────────
  const handleEmailConfirmClick = (confirmed) => {
    emailConfirmRef.current?.(confirmed)
    emailConfirmRef.current = null
  }

  // ── 음성 어시스턴트 팝업 닫기 ──────────────────────────────
  const closeVoiceUI = () => {
    stopAllTTS()
    emailConfirmRef.current?.(false)
    emailConfirmRef.current = null
    setVoiceUI({ active: false, messages: [], steps: [], status: 'idle', report: '' })
    setVoiceMinimized(false)
  }
  const minimizeVoiceUI = () => setVoiceMinimized(true)
  const expandVoiceUI  = () => setVoiceMinimized(false)

  // ── 박수 → 음성 어시스턴트 세션 (GPT형 팝업) ──────────────
  const runVoiceSession = async () => {
    if (briefing.active) return
    const user  = JSON.parse(localStorage.getItem('ts_user') || '{}')
    const name  = user.name  || '관제사'
    const email = user.email || null

    const greeting = `안녕하세요 ${name}님, 교통 관제 도우미 에이전트입니다. 필요한 게 있으신가요?`

    // 1. 팝업 열기 + 인사 TTS (완료 후 STT 시작)
    setVoiceUI({ active: true, messages: [{ role: 'ai', text: greeting }], steps: [], status: 'greeting', report: '' })
    await speakAsync(greeting)

    // 2. 사용자 발화 수집 — TTS 끝나면 자동 STT, 마이크 버튼으로도 가능
    const question = await waitForVoiceInput(600)
    if (!question) {
      setVoiceUI(prev => ({ ...prev, status: 'idle' }))
      return
    }

    setVoiceUI(prev => ({
      ...prev,
      messages: [...prev.messages, { role: 'user', text: question }],
      steps: [], status: 'thinking',
    }))

    // 3. 이메일 미리 확인
    let finalQuestion = question
    if (email) {
      const emailAskMsg = '분석 결과를 이메일로도 받아보시겠어요?'
      await speakAsync(emailAskMsg)
      setVoiceUI(prev => ({
        ...prev,
        messages: [...prev.messages, { role: 'ai', text: emailAskMsg }],
        status: 'email_confirm',
      }))
      const wantsEmail = await Promise.race([
        new Promise(res => { emailConfirmRef.current = res }),
        waitForVoiceInput(300).then(r => r && /네|응|보내|받아|좋아|줘/.test(r)),
      ])
      emailConfirmRef.current = null
      setVoiceUI(prev => ({ ...prev, status: 'thinking' }))
      if (wantsEmail) {
        finalQuestion = `${question}\n\n분석 완료 후 반드시 send_email_report 도구를 사용해서 ${email}로 이메일을 발송해줘.`
        setVoiceUI(prev => ({ ...prev, messages: [...prev.messages, { role: 'user', text: '네, 이메일로 보내주세요' }] }))
      }
    }

    // 4. AI 스트리밍
    let reportText = ''
    try {
      const res = await fetch(`${PYTHON_BASE}/api/agent/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: finalQuestion, userEmail: email }),
      })
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let emailSentByAI = false  // AI가 send_email_report 도구로 이미 보냈는지

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let data
          try { data = JSON.parse(line.slice(6)) } catch { continue }

          if (data.type === 'action' && data.label) {
            if (data.tool === 'send_email_report') emailSentByAI = true
            setVoiceUI(prev => ({ ...prev, steps: [...prev.steps, data] }))
            speakAsync(data.label, 1.4)
          } else if (data.type === 'observation') {
            setVoiceUI(prev => ({ ...prev, steps: [...prev.steps, data] }))
          } else if (data.type === 'answer') {
            reportText = data.content
            setVoiceUI(prev => ({
              ...prev,
              messages: [...prev.messages, { role: 'ai', text: reportText }],
              steps: [],
              status: 'speaking',
              report: reportText,
            }))
            speakAsync(reportText)
          }
        }
      }
    } catch {
      setVoiceUI(prev => ({ ...prev, messages: [...prev.messages, { role: 'ai', text: '처리 중 오류가 발생했습니다.' }], status: 'idle' }))
      await speakAsync('처리 중 오류가 발생했습니다.')
      return
    }

    // 4. 이메일 확인 — AI가 이미 send_email_report 도구로 보낸 경우 스킵
    if (emailSentByAI) {
      setVoiceUI(prev => ({ ...prev, status: 'done' }))
      return
    }
    const emailMsg = '마지막 보고서 내용을 사용자님의 이메일로 보내드릴까요?'
    speakAsync(emailMsg).then(async () => {
      setVoiceUI(prev => ({
        ...prev,
        messages: [...prev.messages, { role: 'ai', text: emailMsg }],
        status: 'email_confirm',
      }))

      // 버튼 클릭 OR STT 중 먼저 오는 것으로 결정
      const confirmed = await Promise.race([
        new Promise(res => { emailConfirmRef.current = res }),
        listenOnce(6000).then(r => r && /네|응|보내|발송|좋아|맞아|그래/.test(r)),
      ])
      emailConfirmRef.current = null

      if (confirmed && email) {
        await fetch(`${API_BASE}/api/email/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ to: email, subject: '[TrafficSync] 교통 관제 리포트', body: reportText }),
        })
        setVoiceUI(prev => ({ ...prev, messages: [...prev.messages, { role: 'user', text: '네' }, { role: 'ai', text: '이메일을 발송했습니다.' }], status: 'done' }))
        await speakAsync('이메일을 발송했습니다.')
      } else {
        setVoiceUI(prev => ({ ...prev, messages: [...prev.messages, { role: 'user', text: '아니요' }, { role: 'ai', text: '알겠습니다.' }], status: 'done' }))
        await speakAsync('알겠습니다.')
      }
    })
  }
  voiceSessionRef.current = runVoiceSession

  // ── AI 브리핑 실행 ─────────────────────────────────────
  const runBriefing = async (name, gu, isGuClick = false) => {
    setBriefing({ active: true, steps: [], status: 'loading', emailReady: false, report: '', district: gu })

    const intro = isGuClick
      ? `${gu} 교통 현황을 분석하겠습니다.`
      : `안녕하세요 ${name}님. ${gu} 교통 현황을 분석하겠습니다.`
    speakAsync(intro)

    const abortCtrl = new AbortController()
    briefingAbortRef.current = abortCtrl

    try {
      const res = await fetch(`${PYTHON_BASE}/api/agent/district-report/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ district: gu }),
        signal: abortCtrl.signal,
      })
      const reader  = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let reportText = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          let data
          try { data = JSON.parse(line.slice(6)) } catch { continue }

          if (data.type === 'action' && data.label) {
            setBriefing(prev => ({ ...prev, steps: [...prev.steps, data] }))
            speakAsync(data.label, 1.4)  // 전역 큐에 순서대로 쌓임 — 겹침 없음
          } else if (data.type === 'observation') {
            setBriefing(prev => ({ ...prev, steps: [...prev.steps, data] }))
          } else if (data.type === 'answer') {
            reportText = data.content
            setBriefing(prev => ({ ...prev, steps: [...prev.steps, data], status: 'done' }))
            speakAsync(reportText).then(async () => {
              setBriefing(prev => ({ ...prev, report: reportText }))
              await speakAsync('리포트를 이메일로 발송하시겠어요?')
              setBriefing(prev => ({ ...prev, emailReady: true }))
              // 버튼 클릭으로만 처리 (STT 없음)
            })
          }
        }
      }

    } catch (err) {
      if (err.name === 'AbortError') return
      await speakAsync('교통 데이터 분석 중 오류가 발생했습니다.')
      setBriefing(prev => ({ ...prev, status: 'done' }))  // 오류 시에도 창 유지
    } finally {
      briefingAbortRef.current = null
    }
  }
  runBriefingRef.current = runBriefing  // pendingBriefing STT에서 참조

  // Hook은 조건부 리턴 전에 모두 선언해야 함
  useEffect(() => {
    voiceMsgEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [voiceUI.messages, voiceUI.steps])

  // pendingBriefing 팝업 — TTS 끝나면 자동 STT 시작 (버튼도 동시 지원)
  useEffect(() => {
    const pb = pendingBriefing
    if (!pb) return
    let alive = true
    _ttsChain.then(async () => {
      if (!alive) return
      await new Promise(r => setTimeout(r, 400))
      if (!alive) return
      const said = await listenOnce(6000)
      if (!alive || !said) return
      if (/네|응|시작|분석|좋아|알았/.test(said)) {
        setPendingBriefing(null)
        runBriefingRef.current?.(pb.name, pb.gu)
      } else if (/아니|나중|괜찮/.test(said)) {
        speakAsync('알겠습니다.')
        setPendingBriefing(null)
      }
    })
    return () => { alive = false }
  }, [pendingBriefing])

  // ── 페이지 조건부 렌더링 ──────────────────────────────

  // 로그인 페이지
  if (page === 'login') return (
    <LoginPage onLoginSuccess={(data) => {
      const name = data.name || '관제사'
      const gu   = selectedGu?.name || '강남구'
      const now  = new Date()
      const h    = now.getHours()
      const tl   = h < 6 ? '새벽' : h < 12 ? '오전' : h < 18 ? '오후' : '저녁'
      // 환영 인사 TTS + 구 분석 팝업 (음성 어시스턴트는 박수로만)
      speakAsync(`안녕하세요 ${name}님. ${tl} ${h}시입니다.`)
      setPendingBriefing({ name, gu })
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

  // ── AI 브리핑 오버레이 ────────────────────────────────
  const closeBriefing = (aborted = false) => {
    // fetch 진행 중이면 중단
    if (briefingAbortRef.current) {
      briefingAbortRef.current.abort()
      briefingAbortRef.current = null
    }
    stopAllTTS()
    if (aborted) {
      // 종료 메시지를 잠깐 보여준 뒤 닫기
      setBriefing(prev => ({ ...prev, status: 'done', steps: [...prev.steps, { type: 'answer', content: '요청이 종료되었습니다.' }] }))
      setTimeout(() => setBriefing({ active: false, steps: [], status: 'loading', emailReady: false, report: '', district: '' }), 1500)
    } else {
      setBriefing({ active: false, steps: [], status: 'loading', emailReady: false, report: '', district: '' })
    }
  }

  const sendBriefingEmail = async () => {
    const email = JSON.parse(localStorage.getItem('ts_user') || '{}').email
    if (email) {
      await fetch(`${API_BASE}/api/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: email, subject: `[TrafficSync] ${briefing.district} 교통 리포트`, body: briefing.report }),
      })
      await speakAsync('이메일을 발송했습니다.')
    } else {
      await speakAsync('등록된 이메일이 없습니다.')
    }
    closeBriefing()
  }

  const listenForEmailConfirm = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) return
    const r = new SR()
    r.lang = 'ko-KR'
    r.maxAlternatives = 1
    r.onresult = async (e) => {
      const said = e.results[0][0].transcript
      if (/네|응|보내|발송|좋아|맞아|그래/.test(said)) {
        await sendBriefingEmail()
      } else {
        await speakAsync('알겠습니다.')
        closeBriefing()
      }
    }
    r.onerror = () => closeBriefing()
    r.start()
  }

  const VOICE_STATUS_LABEL = {
    greeting: 'AI 안내 중', listening: '🎤 듣는 중...', thinking: '분석 중...',
    speaking: '🔊 응답 중', email_confirm: '이메일 발송 확인', done: '완료', idle: '',
  }

  // 통합 대시보드 (기본 페이지 — page === 'main')
  return (
    <>
    {/* 네비게이션 차단 토스트 */}
    {navBlockMsg && (
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
        ⚠ {navBlockMsg}
      </div>
    )}
    {/* ── 음성 어시스턴트 GPT형 팝업 ── */}
    {voiceUI.active && !voiceMinimized && (
      <div style={{
        position: 'fixed', bottom: 90, right: 28, zIndex: 10000,
        width: 390, maxHeight: '68vh',
        display: 'flex', flexDirection: 'column',
        background: 'rgba(9,9,11,0.97)',
        backdropFilter: 'blur(24px)', WebkitBackdropFilter: 'blur(24px)',
        border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18,
        overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.75)',
        animation: 'brSlideIn .28s ease',
        fontFamily: 'system-ui,-apple-system,sans-serif',
      }}>
        {/* 헤더 */}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'11px 14px', borderBottom:'1px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
          <div style={{ width:26, height:26, borderRadius:'50%', background:'rgba(255,255,255,0.06)', border:'1px solid rgba(255,255,255,0.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, flexShrink:0 }}>✦</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:600, color:'rgba(255,255,255,0.82)' }}>AI 교통 어시스턴트</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:1 }}>{VOICE_STATUS_LABEL[voiceUI.status]}</div>
          </div>
          {/* 🎤 마이크 버튼 — 토글 (AI 처리 중엔 비활성) */}
          {(() => {
            const blocked = ['thinking','speaking','greeting','email_confirm'].includes(voiceUI.status)
            return (
              <button onClick={startVoiceSTT} title={voiceSTTActive ? '마이크 중단' : '마이크로 말하기'}
                disabled={blocked}
                style={{
                  background: voiceSTTActive ? 'rgba(255,60,60,0.2)' : blocked ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.05)',
                  border: voiceSTTActive ? '1px solid rgba(255,60,60,0.5)' : '1px solid rgba(255,255,255,0.12)',
                  borderRadius:6, padding:'4px 9px',
                  cursor: blocked ? 'not-allowed' : 'pointer',
                  color: voiceSTTActive ? 'rgba(255,100,100,0.9)' : blocked ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.5)',
                  fontSize:11, display:'flex', alignItems:'center', gap:4,
                  animation: voiceSTTActive ? 'micPulse 1s ease infinite' : 'none',
                  opacity: blocked ? 0.4 : 1,
              }}>
                {voiceSTTActive ? '🔴 중단' : '🎤'}
              </button>
            )
          })()}
          {/* TTS 정지 버튼 */}
          <button onClick={() => stopAllTTS()} title="TTS 중지" style={{
            background:'rgba(255,60,60,0.1)', border:'1px solid rgba(255,60,60,0.25)',
            borderRadius:6, padding:'4px 9px', color:'rgba(255,110,110,0.8)',
            fontSize:11, cursor:'pointer', display:'flex', alignItems:'center', gap:4,
          }}>
            <span style={{ width:7, height:7, borderRadius:1, background:'rgba(255,100,100,0.85)', display:'inline-block' }} /> TTS 정지
          </button>
          {/* 최소화 */}
          <button onClick={minimizeVoiceUI} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.28)', fontSize:16, cursor:'pointer', padding:'0 2px', lineHeight:1 }}>−</button>
          {/* 닫기 */}
          <button onClick={closeVoiceUI} style={{ background:'none', border:'none', color:'rgba(255,255,255,0.28)', fontSize:16, cursor:'pointer', padding:'0 2px', lineHeight:1 }}>✕</button>
        </div>

        {/* 메시지 영역 */}
        <div style={{ flex:1, overflowY:'auto', padding:'14px 16px', display:'flex', flexDirection:'column', gap:10 }}>
          {voiceUI.messages.map((m, i) => (
            <div key={i} style={{ display:'flex', justifyContent: m.role==='user' ? 'flex-end' : 'flex-start' }}>
              <div style={{
                maxWidth:'84%', padding:'9px 13px', fontSize:13, lineHeight:1.75,
                color:'rgba(255,255,255,0.78)', whiteSpace:'pre-line', wordBreak:'break-word',
                borderRadius: m.role==='user' ? '12px 12px 3px 12px' : '3px 12px 12px 12px',
                background: m.role==='user' ? 'rgba(255,255,255,0.09)' : 'rgba(255,255,255,0.04)',
                border:'1px solid rgba(255,255,255,0.07)',
              }}>{m.text}</div>
            </div>
          ))}

          {/* 실시간 추론 단계 */}
          {voiceUI.steps.length > 0 && voiceUI.status === 'thinking' && (
            <div style={{ display:'flex', flexDirection:'column', gap:4, padding:'4px 2px' }}>
              {voiceUI.steps.map((s, i) => (
                <div key={i} style={{ display:'flex', gap:8, alignItems:'flex-start' }}>
                  <span style={{ fontSize:12, opacity:.65, flexShrink:0, marginTop:1 }}>{s.type==='action' ? '🔧' : '↳'}</span>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.35)', lineHeight:1.5, wordBreak:'break-all' }}>{(s.label||s.content||'').slice(0,80)}</span>
                </div>
              ))}
            </div>
          )}

          {/* 상태 인디케이터 */}
          {voiceUI.status === 'listening' && (
            <div style={{ display:'flex', alignItems:'center', gap:8, color:'rgba(255,100,100,0.85)', fontSize:13, padding:'6px 0' }}>
              <span style={{ animation:'micPulse 1s ease infinite', fontSize:16 }}>🎤</span>
              말씀해주세요...
            </div>
          )}
          {(voiceUI.status === 'thinking' || voiceUI.status === 'speaking') && (
            <div style={{ display:'flex', gap:4, alignItems:'center', padding:'6px 0' }}>
              {[0,1,2].map(i=><span key={i} style={{ width:5, height:5, borderRadius:'50%', background:'rgba(255,255,255,0.3)', animation:`brDot 1.2s ease ${i*.2}s infinite`, display:'inline-block' }}/>)}
              <span style={{ fontSize:12, color:'rgba(255,255,255,0.3)', marginLeft:6 }}>{voiceUI.status==='thinking' ? '분석 중...' : '읽는 중...'}</span>
            </div>
          )}

          <div ref={voiceMsgEndRef} />
        </div>

        {/* 이메일 확인 버튼 */}
        {voiceUI.status === 'email_confirm' && (
          <div style={{ padding:'12px 16px', borderTop:'1px solid rgba(255,255,255,0.06)', display:'flex', gap:8, flexShrink:0 }}>
            <button onClick={() => handleEmailConfirmClick(true)} style={{ flex:1, padding:'9px 0', borderRadius:8, fontSize:13, fontWeight:600, background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.15)', color:'rgba(255,255,255,0.85)', cursor:'pointer', fontFamily:'inherit' }}>네</button>
            <button onClick={() => handleEmailConfirmClick(false)} style={{ flex:1, padding:'9px 0', borderRadius:8, fontSize:13, background:'transparent', border:'1px solid rgba(255,255,255,0.07)', color:'rgba(255,255,255,0.35)', cursor:'pointer', fontFamily:'inherit' }}>아니요</button>
          </div>
        )}

        {/* 진행 바 */}
        {(voiceUI.status === 'thinking' || voiceUI.status === 'speaking') && (
          <div style={{ height:2, background:'rgba(255,255,255,0.04)', flexShrink:0 }}>
            <div style={{ height:'100%', background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.22),transparent)', animation:'brProgress 1.8s ease infinite' }}/>
          </div>
        )}
      </div>
    )}

    {/* ── AI 플로팅 버튼 — 항상 표시, 클릭 시 패널 열기/닫기 ── */}
    <button
      onClick={() => {
        if (!voiceUI.active) {
          voiceSessionRef.current?.()
        } else {
          setVoiceMinimized(prev => !prev)
        }
      }}
      title="AI 교통 어시스턴트"
      style={{
        position: 'fixed', bottom: 28, right: 28, zIndex: 9998,
        width: 56, height: 56, borderRadius: '50%',
        background: voiceUI.active ? 'rgba(30,30,35,0.97)' : 'rgba(20,20,24,0.95)',
        border: voiceUI.active
          ? '1.5px solid rgba(255,255,255,0.2)'
          : '1.5px solid rgba(255,255,255,0.1)',
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
      {voiceUI.active && !voiceMinimized ? '−' : 'AI'}
    </button>

    {pendingBriefing && !briefing.active && (
      <div style={{
        position: 'fixed', bottom: 28, right: 28,
        zIndex: 9999, width: 360,
        background: 'rgba(12,12,14,0.96)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
        animation: 'brSlideIn .28s ease',
        fontFamily: 'system-ui,-apple-system,sans-serif',
      }}>
        {/* 헤더 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '13px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, flexShrink: 0,
          }}>✦</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
              안녕하세요, {pendingBriefing.name}님
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>
              AI 교통 어시스턴트
            </div>
          </div>
          <button onClick={() => { speakAsync('알겠습니다.'); setPendingBriefing(null) }} style={{
            background: 'none', border: 'none', color: 'rgba(255,255,255,0.25)',
            fontSize: 16, cursor: 'pointer', padding: '0 2px',
          }}>✕</button>
        </div>

        {/* 본문 */}
        <div style={{ padding: '14px 16px 16px' }}>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 14, lineHeight: 1.6 }}>
            {pendingBriefing.gu} 교통 현황 분석을 시작할까요?
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={() => { setPendingBriefing(null); runBriefing(pendingBriefing.name, pendingBriefing.gu) }}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
                background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
                color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontFamily: 'inherit',
              }}>
              시작
            </button>
            <button
              onClick={() => { speakAsync('알겠습니다.'); setPendingBriefing(null) }}
              style={{
                flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 13,
                background: 'transparent', border: '1px solid rgba(255,255,255,0.07)',
                color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontFamily: 'inherit',
              }}>
              나중에
            </button>
          </div>
        </div>
      </div>
    )}
    {briefing.active && (
      <div style={{
        position: 'fixed', bottom: 28, right: 28,
        zIndex: 9999, width: 420,
        background: 'rgba(12,12,14,0.96)',
        backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        border: '1px solid rgba(255,255,255,0.09)', borderRadius: 14,
        overflow: 'hidden',
        boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
        animation: 'brSlideIn .28s ease',
        fontFamily: 'system-ui,-apple-system,sans-serif',
      }}>
        {/* 헤더 */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '13px 16px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
        }}>
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.1)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 13, flexShrink: 0,
          }}>
            {briefing.status === 'done' ? '✦' : (
              <span style={{ display: 'inline-flex', gap: 3 }}>
                {[0,1,2].map(i => (
                  <span key={i} style={{
                    width: 4, height: 4, borderRadius: '50%',
                    background: 'rgba(255,255,255,0.5)',
                    animation: `brDot 1.2s ease ${i*0.2}s infinite`,
                  }}/>
                ))}
              </span>
            )}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
              AI 교통 어시스턴트 · {briefing.district}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>
              {briefing.emailReady ? '🎙 이메일 발송할까요?' : briefing.status === 'done' ? '분석 완료' : '분석 중...'}
            </div>
          </div>
          <button onClick={() => closeBriefing(true)} style={{
            background: 'none', border: 'none',
            color: 'rgba(255,255,255,0.25)', fontSize: 16,
            cursor: 'pointer', padding: '0 2px',
          }}>✕</button>
        </div>

        {/* 스텝 목록 */}
        <div style={{ maxHeight: 320, overflowY: 'auto', padding: '14px 16px' }}>
          {briefing.steps.filter(s => s.type !== 'thought').map((step, i) => {
            const ICONS = { get_traffic_data:'🚦', get_bottleneck_list:'🚨', get_district_traffic:'📊', search_crossroad_by_name:'🔍', get_simulation_context:'⚙️', send_email_report:'📧', send_alert:'🔔', search_project_docs:'📚' }
            const isAction = step.type === 'action'
            const isObs    = step.type === 'observation'
            const isAnswer = step.type === 'answer'
            const allSteps = briefing.steps.filter(s => s.type !== 'thought')
            const isLast   = i === allSteps.length - 1

            if (isAnswer) return (
              <div key={i} style={{
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 10, padding: '12px 14px',
                fontSize: 12, color: 'rgba(255,255,255,0.75)',
                lineHeight: 1.75, whiteSpace: 'pre-line',
                animation: 'brFadeIn .2s ease',
              }}>{step.content}</div>
            )

            return (
              <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 6, animation: 'brFadeIn .2s ease' }}>
                <span style={{ fontSize: isAction ? 14 : 11, flexShrink: 0, marginTop: 1, opacity: isObs ? 0.4 : 0.85 }}>
                  {isAction ? (ICONS[step.tool] || '🔧') : '↳'}
                </span>
                <div style={{ flex: 1 }}>
                  {isAction && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
                        {step.label || step.tool}
                      </span>
                      {isLast && briefing.status === 'loading'
                        ? <span style={{ display:'inline-flex', gap:3 }}>{[0,1,2].map(j=><span key={j} style={{width:3,height:3,borderRadius:'50%',background:'rgba(255,255,255,0.45)',animation:`brDot 1.2s ease ${j*0.2}s infinite`}}/>)}</span>
                        : <span style={{ fontSize:10, color:'rgba(100,220,100,0.6)' }}>✓</span>
                      }
                    </div>
                  )}
                  {(step.content || step.args) && (
                    <div style={{ fontSize: 11, color: isObs ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.45)', lineHeight: 1.5, wordBreak: 'break-all' }}>
                      {(step.args || step.content || '').slice(0, 100)}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* 이메일 확인 버튼 */}
        {briefing.emailReady && (
          <div style={{ padding: '12px 16px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', gap: 8 }}>
            <button onClick={sendBriefingEmail} style={{
              flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 13, fontWeight: 600,
              background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)',
              color: 'rgba(255,255,255,0.85)', cursor: 'pointer', fontFamily: 'inherit',
            }}>📧 이메일 발송</button>
            <button onClick={closeBriefing} style={{
              flex: 1, padding: '9px 0', borderRadius: 8, fontSize: 13,
              background: 'transparent', border: '1px solid rgba(255,255,255,0.07)',
              color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontFamily: 'inherit',
            }}>괜찮아요</button>
          </div>
        )}

        {/* 진행 바 */}
        {briefing.status === 'loading' && (
          <div style={{ height: 2, background: 'rgba(255,255,255,0.04)' }}>
            <div style={{ height:'100%', background:'linear-gradient(90deg,transparent,rgba(255,255,255,0.25),transparent)', animation:'brProgress 1.8s ease infinite' }}/>
          </div>
        )}
      </div>
    )}

    <style>{`
      @keyframes brSlideIn { from{opacity:0;transform:translateY(12px)} to{opacity:1;transform:translateY(0)} }
      @keyframes brFadeIn  { from{opacity:0;transform:translateY(4px)}  to{opacity:1;transform:translateY(0)} }
      @keyframes brDot     { 0%,100%{opacity:1} 50%{opacity:0.2} }
      @keyframes brProgress { 0%{width:0%;margin-left:0} 50%{width:60%;margin-left:20%} 100%{width:0%;margin-left:100%} }
    `}</style>
    <MainDashboard
      onGoMap={goMap}
      onGoCctv={() => tryNav(() => setPage('cctv'))}
      onGoNews={() => tryNav(() => setPage('news'))}
      onGoSimulation={() => tryNav(() => setPage('simulation'))}
      onGoMyPage={() => tryNav(() => setPage('mypage'))}
      onLogout={() => tryNav(() => setPage('login'))}
      wsData={wsData}
      setWsData={setWsData}
      stations={stations}
      setStations={setStations}
      selectedGu={selectedGu}
      onSelectGu={handleSelectGu}
      isMuted={isMuted}
      onToggleMute={toggleMute}
    />
    </>
  )
}

