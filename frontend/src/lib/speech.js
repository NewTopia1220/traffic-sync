/**
 * 음성 인식(STT) 헬퍼 — Web Speech API 래퍼
 * ------------------------------------------------------------------
 * listenOnce: 마이크를 한 번 켜서 한 문장을 듣고 결과 텍스트를 반환한다.
 *             결과가 없거나 오류/타임아웃이면 null을 반환한다.
 */

/**
 * 한 번 듣고 인식된 텍스트를 반환한다.
 * @param {number} timeoutMs  최대 대기 시간(ms). 초과하면 abort 후 null 반환
 * @returns {Promise<string|null>}
 */
export function listenOnce(timeoutMs = 8000) {
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
    setTimeout(() => { try { r.abort() } catch { /* 무시 */ } finish(null) }, timeoutMs)
    r.start()
  })
}
