/**
 * MainDashboard — 통합 대시보드 페이지
 * ==================================================================
 * 헤더(탭/구배지/시계) + KPI 4종 + 실시간 속도 패널 + 서울 SVG 지도 +
 * 위험도 패널 + 시간대별 예측 차트로 구성된 메인 화면.
 *
 * 표시용 하위 컴포넌트(카드/차트/드롭다운)는 components/dashboard/로,
 * 위험도 계산 로직은 utils/riskUtils.js로 분리했다.
 *
 * 데이터 흐름:
 *   구 선택 → POST /api/fetch-area (스프링이 V2X 수집)
 *           → WebSocket 브로드캐스트 → wsData 갱신 (App에서 prop으로 전달)
 *   예측    → GET /api/stations, GET /api/forecast/station/{id}
 */
import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { calcDistKm } from "../constants/seoulGeoData";
import { V } from "../constants/theme";
import {
  hasRiskScore, hasRiskGrade, riskGradeValue,
  riskRank, riskColor, riskLevel, riskPercent,
} from "../utils/riskUtils";
import SeoulSvgMap from "../components/map/SeoulSvgMap";
import ReActToastContainer from "../components/common/ReActToast";
import BottleneckEmailBtn from "../components/dashboard/BottleneckEmailBtn";
import KpiCard from "../components/dashboard/KpiCard";
import LivCard from "../components/dashboard/LivCard";
import DonutChart from "../components/dashboard/DonutChart";
import ForecastChart from "../components/dashboard/ForecastChart";
import { StationPredictDropdown, SpeedDropdown, RiskDropdown } from "../components/dashboard/Dropdowns";

// 스프링 REST API 주소 (.env의 VITE_API_URL)
const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8080").replace(/\/+$/, "");

// 속도 카드 3개에 순서대로 할당되는 색상 (빨강 → 주황 → 초록)
const CARD_COLORS = [V.red, V.org, V.grn];

// 속도 히스토리 초기 배열 — 실제 속도가 있으면 그 값 하나로 시작, 없으면 빈 배열
function makeSpark(base) {
  return Number.isFinite(base) ? [base] : [];
}

export default function MainDashboard({ onGoMap, onGoCctv, onGoNews, onGoSimulation, onGoMyPage, onLogout, wsData, stations=[], setStations, selectedGu, onSelectGu, isMuted, onToggleMute }) {
  const [time, setTime] = useState(new Date());
  const [loading, setLoading] = useState(false);
  // "송파구 · 12개 교차로 수집됨" 같은 임시 메시지 (3초 후 사라짐)
  const [fetchMsg, setFetchMsg] = useState(null);

  // 속도 카드: 드롭다운에서 선택한 교차로 최대 3개
  const [speedSelected, setSpeedSelected] = useState([]);
  // 교차로ID → 속도 히스토리 배열 (ref: setState 없이 직접 push/shift)
  const sparkRef = useRef({});
  // 교차로ID → 마지막으로 그래프에 반영한 스냅샷 키
  const sparkSampleKeyRef = useRef({});

  // 관심 교차로 목록 (최대 8개, 수동 등록)
  const [watchList, setWatchList] = useState([]);
  // 위험도 패널에서 현재 선택된 슬롯 인덱스
  const [riskIdx, setRiskIdx] = useState(0);

  // 예측 차트: 선택 지점 ID + 예측 데이터 { up, down, name, isLoaded }
  const [predictStationId, setPredictStationId] = useState("");
  const [forecast, setForecast] = useState({ up: [], down: [], name: "—" });

  // 헤더 시계: 1초마다 갱신
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  // 로그인 직후 (wsData가 비어있을 때) 강남구 자동 fetch — 한 번만 실행
  const autoFetchedRef = useRef(false);
  useEffect(() => {
    if (!autoFetchedRef.current && wsData.length === 0 && selectedGu) {
      autoFetchedRef.current = true;
      handleSelectGu(selectedGu);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // sparkline 히스토리 최대 보관 개수
  const LIV_MAX = 720;

  // WebSocket/REST로 새 스냅샷이 들어올 때만 속도 히스토리에 추가한다.
  // 5초마다 같은 speed를 반복 저장하면 변화가 없는데도 관측수가 늘어나는 착시가 생긴다.
  useEffect(() => {
    let changed = false;
    wsData.forEach(c => {
      if (!Number.isFinite(c.speed)) return;

      const sampleKey = `${c.serverTimeMs ?? ""}:${c.totDt ?? ""}:${c.speed}`;
      if (sparkSampleKeyRef.current[c.crsrdId] === sampleKey) return;

      const arr = sparkRef.current[c.crsrdId] ?? [];
      arr.push(c.speed);
      if (arr.length > LIV_MAX) arr.shift();
      sparkRef.current[c.crsrdId] = arr;
      sparkSampleKeyRef.current[c.crsrdId] = sampleKey;
      changed = true;
    });

    if (changed) setTime(new Date()); // 강제 리렌더 (sparkRef는 ref라 자동 리렌더 안 됨)
  }, [wsData]);

  /**
   * handleSelectGu — 서울 SVG 지도에서 구 클릭 시 호출
   * 1. POST /api/fetch-area → 스프링이 해당 구 V2X 데이터 수집
   * 2. 스프링 → WebSocket 브로드캐스트 → wsData 업데이트 (자동)
   * 3. onSelectGu로 App 상태 갱신, fetchMsg 3초 표시
   */
  const handleSelectGu = useCallback(async (gu) => {
    setLoading(true);
    setFetchMsg(null);
    try {
      const params = new URLSearchParams({
        guName: gu.name, lat: String(gu.lat), lon: String(gu.lon), radius: "2.5",
      });
      const res = await fetch(`${API_BASE}/api/fetch-area?${params.toString()}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        // 503: V2X API 타임아웃 — 캐시는 유지됨
        setFetchMsg(`⚠ ${data.message ?? `${gu.name} 수집 실패`}`);
        return;
      }
      onSelectGu(gu);       // App level 상태 업데이트 (페이지 이동 후에도 유지)
      setRiskIdx(0);
      setWatchList([]);
      setSpeedSelected([]);
      setFetchMsg(`${gu.name} · ${data.count ?? 0}개 교차로 수집됨`);
    } catch {
      setFetchMsg(`${gu.name} 데이터 수집 실패`);
    } finally {
      setLoading(false);
      setTimeout(() => setFetchMsg(null), 3000);
    }
  }, [onSelectGu]);

  // ── 활성 데이터 계산 ────────────────────────────────────────────
  const lastNonEmptyDataRef = useRef([]);

  const guData = selectedGu
    ? wsData.filter(c => c.lat && c.lon && calcDistKm(c.lat, c.lon, selectedGu.lat, selectedGu.lon) <= 2.5)
    : wsData;

  // 새 구 데이터가 WebSocket으로 오기 전 빈 배열이 되는 순간을 이전 데이터로 커버
  const activeData = useMemo(() => {
    const filtered = selectedGu ? guData : wsData;
    if (filtered.length > 0) {
      lastNonEmptyDataRef.current = filtered;
      return filtered;
    }
    return lastNonEmptyDataRef.current.length > 0 ? lastNonEmptyDataRef.current : wsData;
  }, [guData, wsData, selectedGu]);

  const isLive = wsData.length > 0;

  // ── 교통량 지점 구별 필터링 ─────────────────────────────────────
  const filteredStations = useMemo(() => {
    if (!selectedGu || !stations || stations.length === 0) return stations || [];
    return stations.filter(st => {
      const lat = st.latitude || st.lat;
      const lng = st.longitude || st.lng;
      if (!lat || !lng) return false;
      return calcDistKm(lat, lng, selectedGu.lat, selectedGu.lon) <= 2.5;
    });
  }, [stations, selectedGu]);

  // 구가 바뀌면 해당 구의 첫 번째 지점을 자동 선택
  useEffect(() => {
    if (filteredStations.length > 0) setPredictStationId(filteredStations[0].stationId);
  }, [filteredStations]);

  // ── KPI 계산 ────────────────────────────────────────────────────
  const validSpeeds = activeData.map(c => c.speed).filter(Number.isFinite);
  const avgSpeed  = validSpeeds.length ? Math.round(validSpeeds.reduce((a, v) => a + v, 0) / validSpeeds.length) : "—";
  const riskReadyData = activeData.filter(c => hasRiskScore(c.riskScore) || hasRiskGrade(c.riskGrade));
  const highRisk  = riskReadyData.filter(c => (riskGradeValue(c.riskGrade) ?? 0) >= 3).length;
  const sortedByRisk = [...activeData].sort((a, b) => riskRank(b) - riskRank(a));
  const maxRiskItem  = [...riskReadyData].sort((a, b) => riskRank(b) - riskRank(a))[0];
  const maxRisk      = maxRiskItem?.riskScore ?? "—";
  const guLabel      = selectedGu ? `${selectedGu.name} 반경 2.5km` : "전체";
  const speedStatus  = typeof avgSpeed === "number" ? (avgSpeed >= 40 ? "정상" : avgSpeed >= 20 ? "서행" : "혼잡") : "대기";
  const maxRiskGrade = riskReadyData.reduce((max, c) => Math.max(max, riskGradeValue(c.riskGrade) ?? 0), 0);
  const riskStatus   = riskReadyData.length === 0 ? "대기" : maxRiskGrade >= 4 ? "심각" : maxRiskGrade >= 3 ? "위험" : maxRiskGrade >= 2 ? "주의" : "정상";

  // ── 위험도 리스트 (드롭다운 검색 + 그리드 슬롯용) ───────────────
  const riskData = sortedByRisk.map(c => ({
    name: c.crsrdNm, score: hasRiskScore(c.riskScore) ? c.riskScore : null,
    grade: c.riskGrade, speed: c.speed, congestion: c.congestion ?? "—", id: c.crsrdId,
  }));

  // watchList 항목에 실시간 점수 반영
  const watchListLive = watchList.map(w => riskData.find(r => r.id === w.id) ?? w);

  // 8개 슬롯이 채워지지 않으면 위험도 상위 순으로 자동 채움
  const autoFill = riskData.filter(r => !watchListLive.some(w => w.id === r.id)).slice(0, 8 - watchListLive.length);
  const displayWatch = [...watchListLive, ...autoFill].slice(0, 8);
  const selectedRisk = displayWatch[riskIdx] ?? displayWatch[0];

  // 관심 교차로 등록/해제 토글 (최대 8개)
  const toggleWatch = (item) => {
    setWatchList(prev => {
      const exists = prev.some(w => w.id === item.id);
      if (exists) return prev.filter(w => w.id !== item.id);
      if (prev.length >= 8) return prev;
      return [...prev, item];
    });
    setRiskIdx(0);
  };

  // ── 속도 카드 데이터 ────────────────────────────────────────────
  const speedOptions = activeData.map(c => ({ id: c.crsrdId, name: c.crsrdNm, speed: c.speed }));
  const speedCardSource = activeData.filter(c => Number.isFinite(c.speed));

  // 드롭다운 선택 있으면 그것, 없으면 속도 하위 3개 자동, wsData 없으면 빈 카드 틀
  const displayCards = speedSelected.length > 0
    ? speedSelected.map((s, i) => {
        const live = activeData.find(c => c.crsrdId === s.id);
        const spd = live?.speed ?? s.speed;
        return { name: s.name, color: CARD_COLORS[i % 3], speed: spd, sparkData: sparkRef.current[s.id] ?? makeSpark(spd) };
      })
    : speedCardSource.length > 0
    ? [...speedCardSource].sort((a, b) => a.speed - b.speed).slice(0, 3).map((c, i) => ({
        name: c.crsrdNm, color: CARD_COLORS[i], speed: c.speed,
        sparkData: sparkRef.current[c.crsrdId] ?? makeSpark(c.speed),
      }))
    : activeData.length > 0
    ? activeData.slice(0, 3).map((c, i) => ({ name: c.crsrdNm, color: CARD_COLORS[i], speed: null, sparkData: [] }))
    : [
        { name: "수집 대기", color: V.red, speed: null, sparkData: [] },
        { name: "수집 대기", color: V.org, speed: null, sparkData: [] },
        { name: "수집 대기", color: V.grn, speed: null, sparkData: [] },
      ];

  // 속도 카드 드롭다운 토글 (최대 3개, 초과 시 가장 오래된 항목 제거 FIFO)
  const toggleSpeedCard = (opt) => {
    setSpeedSelected(prev => {
      const exists = prev.some(s => s.id === opt.id);
      if (exists) return prev.filter(s => s.id !== opt.id);
      if (prev.length >= 3) return [...prev.slice(1), opt];
      return [...prev, opt];
    });
  };

  // ── 교통량 예측 데이터 로드 ─────────────────────────────────────
  // 페이지 시작 시 DB에서 지점 목록 가져오기
  useEffect(() => {
    fetch(`${API_BASE}/api/stations`)
      .then(res => res.json())
      .then(data => {
        setStations(data);
        if (data.length > 0) setPredictStationId(data[0].stationId);
      })
      .catch(err => console.error("지점 목록 로드 실패:", err));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 지점 선택 시 파이썬 예측 모델 결과 요청 (스프링 경유)
  useEffect(() => {
    if (!predictStationId) return;
    setForecast(prev => ({ ...prev, isLoaded: false }));

    fetch(`${API_BASE}/api/forecast/station/${predictStationId}`)
      .then((r) => { if (!r.ok) throw new Error("서버 응답 에러"); return r.json(); })
      .then((d) => {
        if (d.up && d.down) {
          setForecast({ up: d.up, down: d.down, name: d.stationNm || "예측 지점", isLoaded: true, isDummy: false });
        }
      })
      .catch((err) => {
        console.error("예측 데이터 로드 실패:", err);
        setForecast(prev => ({ ...prev, isLoaded: false }));
      });
  }, [predictStationId]);

  // ── 위험도 breakdown 아이템 ─────────────────────────────────────
  // 선택된 교차로의 위험도·속도·혼잡도를 수평 프로그레스 바로 표시
  const bdItems = selectedRisk ? [
    { label: "도로 위험도", sub: "교차로 구조 · 사고 이력 종합", value: hasRiskScore(selectedRisk.score) ? selectedRisk.score : "—", unit: "점", color: riskColor(selectedRisk.score, selectedRisk.grade), pct: riskPercent(selectedRisk.score) },
    { label: "실시간 평균 속도", sub: "TOPIS 수집 · 낮을수록 위험", value: selectedRisk.speed ?? "—", unit: "km/h", color: V.org, pct: selectedRisk.speed == null ? 0 : Math.min((selectedRisk.speed / 80) * 100, 100) },
    { label: "혼잡 상태", sub: "현재 구간 추정", value: selectedRisk.congestion, unit: "", color: V.blu, pct: 50 },
  ] : [];

  // ── 렌더링 ──────────────────────────────────────────────────────
  return (
    <div style={{ fontFamily: V.sans, background: V.bg0, color: V.ink0, minHeight: "100vh", display: "flex", flexDirection: "column", overflowY: "auto" }}>

      <ReActToastContainer />

      {/* ── 헤더 (sticky) ── */}
      <div style={{ background: V.bg0, borderBottom: `1px solid ${V.line}`, padding: "0 24px", height: 72, display: "flex", alignItems: "center", gap: 18, flexShrink: 0, position: "sticky", top: 0, zIndex: 100 }}>
        {/* 로고 영역 */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 260 }}>
          <div style={{ width: 28, height: 28, borderRadius: 4, display: "grid", placeItems: "center", background: "#0a0a0a", border: `1px solid ${V.line}` }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: V.grn, display: "block" }} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 19 }}>Traffic-Sync 관제 시스템</div>
            <div style={{ fontSize: 13, color: V.ink2 }}>V2X 공공 API 기반 실시간 교통 관제 플랫폼</div>
          </div>
        </div>

        {/* 페이지 탭 */}
        <div style={{ display: "flex", gap: 2, background: V.bg0, border: `1px solid ${V.line}`, borderRadius: 2, padding: 3 }}>
          {[["통합 대시보드", "main"], ["실시간 지도", "map"], ["뉴스 감성 분석", "news"], ["CCTV 관제", "cctv"], ["🚦 신호 시뮬레이션", "simulation"]].map(([label, tab]) => {
            const isActive = tab === "main";
            const onClick = tab === "map" ? () => onGoMap(selectedGu)
              : tab === "cctv" ? onGoCctv
              : tab === "news" ? onGoNews
              : tab === "simulation" ? onGoSimulation
              : undefined;
            return (
              <button key={tab} onClick={onClick}
                style={{ appearance: "none", border: 0, background: isActive ? "#141414" : "transparent", color: isActive ? "#fff" : tab === "simulation" ? "#60a5fa" : tab === "news" ? V.org : V.ink1, padding: "7px 15px", borderRadius: 2, fontSize: 15, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 6, boxShadow: isActive ? "inset 0 0 0 1px #2a2a2a" : "none", fontFamily: V.sans }}>
                <span style={{ width: 6, height: 6, borderRadius: "50%", background: isActive ? V.blu : V.ink3, display: "inline-block" }} />
                {label}
              </button>
            );
          })}
        </div>

        {/* 선택된 구 배지 */}
        {selectedGu && (
          <div style={{ display: "inline-flex", alignItems: "center", gap: 7, padding: "5px 13px", borderRadius: 2, background: "#1a1206", border: "1px solid #3a2a14", color: V.org, fontSize: 12, fontWeight: 600 }}>
            <span style={{ width: 6, height: 6, borderRadius: "50%", background: V.org, display: "inline-block" }} />
            {selectedGu.name} 선택됨
          </div>
        )}
        {selectedGu && <BottleneckEmailBtn district={selectedGu.name} />}

        {/* 음소거 토글 버튼 */}
        {onToggleMute && (
          <button onClick={onToggleMute} title={isMuted ? '소리 켜기' : 'TTS 음소거'} style={{
            display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 2,
            background: isMuted ? '#1a0a0a' : '#1a1206',
            border: `1px solid ${isMuted ? '#5a1a1a' : '#3a2a14'}`,
            color: isMuted ? '#e05555' : '#888', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
          }}>
            {isMuted ? '🔇 음소거 중' : '🔊 소리 켜짐'}
          </button>
        )}

        {/* 데이터 수집 결과 메시지 (3초 표시) */}
        {fetchMsg && (
          <div style={{ fontSize: 12, color: V.grn, padding: "3px 10px", borderRadius: 2, border: "1px solid #1a3a24", background: "#0c1a12", fontFamily: V.mono }}>✓ {fetchMsg}</div>
        )}

        {/* 우측: LIVE 배지 + 시계 + 마이페이지 + 로그아웃 */}
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
          {isLive && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "5px 10px", border: `1px solid ${V.line}`, background: V.bg0, borderRadius: 2, fontFamily: V.mono, fontSize: 12, color: V.ink1 }}>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: V.grn, display: "inline-block" }} />
              LIVE · V2X 연결됨
            </span>
          )}
          <span style={{ fontFamily: V.mono, fontSize: 13, color: V.ink0, letterSpacing: ".3px" }}>
            <span style={{ color: V.ink2, marginRight: 6 }}>{time.toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric", weekday: "short" })}</span>
            {time.toLocaleTimeString("ko-KR")}
          </span>
          <button onClick={onGoMyPage} style={{ background: "transparent", border: `1px solid ${V.line}`, borderRadius: 2, padding: "5px 12px", color: V.ink2, fontSize: 12, cursor: "pointer", fontFamily: V.mono, letterSpacing: ".3px" }}>
            👤 마이페이지
          </button>
          <button onClick={() => { localStorage.removeItem("ts_user"); onLogout(); }} style={{ background: "transparent", border: `1px solid #3a1820`, borderRadius: 2, padding: "5px 12px", color: "#ff5566", fontSize: 12, cursor: "pointer", fontFamily: V.mono, letterSpacing: ".3px" }}>
            로그아웃
          </button>
        </div>
      </div>

      {/* ── KPI 카드 4개 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, padding: "8px 14px" }}>
        <KpiCard value={activeData.length || 0} unit="개" label="모니터링 교차로" sub={guLabel} status="정상" />
        <KpiCard value={riskReadyData.length ? highRisk : "—"} unit={riskReadyData.length ? "개" : ""} label="위험 교차로" sub={riskReadyData.length ? "등급 3 이상" : "위험도 수집 대기"} status={riskStatus} />
        <KpiCard value={avgSpeed} unit="km/h" label="현재 평균 속도" sub="전 교차로 추정" status={speedStatus === "혼잡" ? "혼잡" : speedStatus === "서행" ? "서행" : "정상"} />
        <KpiCard value={maxRisk} unit={hasRiskScore(maxRisk) ? "점" : ""} label="최고 위험도" sub={maxRiskItem?.crsrdNm ?? "위험도 수집 대기"} status={maxRiskItem ? riskLevel(maxRiskItem.riskScore, maxRiskItem.riskGrade) : "대기"} />
      </div>

      {/* ── 2행: 실시간 속도 + 서울 지도 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, padding: "0 14px", alignItems: "stretch" }}>

        {/* 실시간 구간 속도 패널 */}
        <div style={{ background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${V.line}`, background: "#080808", flexWrap: "wrap", flexShrink: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
              <span style={{ color: V.ink3, marginRight: 8, fontSize: 11 }}>▪</span>실시간 구간 속도
            </span>
            <SpeedDropdown options={speedOptions} selected={speedSelected} onToggle={toggleSpeedCard} />
            <div style={{ marginLeft: "auto", fontFamily: V.mono, fontSize: 12, color: isLive ? V.grn : V.ink2, padding: "3px 8px", border: `1px solid ${isLive ? "#1a3a24" : V.line}`, borderRadius: 2, background: isLive ? "#0c1a12" : V.bg0 }}>
              {isLive ? "● LIVE · 수집 중" : "대기 중"}
            </div>
          </div>
          <div style={{ padding: 12, flex: 1, display: "flex", flexDirection: "column" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 10, flex: 1 }}>
              {displayCards.map((c, i) => <LivCard key={i} {...c} />)}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, padding: "9px 12px", background: V.bg0, border: `1px solid ${V.line}`, borderRadius: 2, fontFamily: V.mono, fontSize: 12, color: V.ink2, flexShrink: 0 }}>
              <span>마지막 갱신 {isLive ? time.toLocaleTimeString("ko-KR") : "—"}</span>
              <span style={{ color: V.ink3 }}>·</span>
              <span>누적 —분 / 최대 60분</span>
              <span style={{ marginLeft: "auto", color: "#5a6378" }}>5초 간격 샘플링 · localStorage 보관</span>
            </div>
          </div>
        </div>

        {/* 서울 SVG 지도 */}
        <div style={{ background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, display: "flex", flexDirection: "column", minHeight: 460 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", borderBottom: `1px solid ${V.line}`, background: "#080808", flexShrink: 0 }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
              <span style={{ color: V.ink3, marginRight: 8, fontSize: 11 }}>▪</span>서울 교통 현황
            </span>
            <button onClick={() => onGoMap(selectedGu)} style={{ marginLeft: "auto", fontFamily: V.mono, fontSize: 11, color: V.ink1, padding: "3px 8px", border: `1px solid ${V.line}`, borderRadius: 2, background: V.bg0, cursor: "pointer" }}>
              실시간 지도 →
            </button>
          </div>
          <div style={{ flex: 1, minHeight: 0 }}>
            <SeoulSvgMap onGoMap={onGoMap} selectedGu={selectedGu} onSelectGu={handleSelectGu} loading={loading} />
          </div>
        </div>

      </div>

      {/* ── 3행: 위험도 패널 + 예측 차트 ── */}
      <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 8, padding: "8px 14px 24px", alignItems: "stretch" }}>

        {/* 위험도 패널 */}
        <div style={{ background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "11px 14px", borderBottom: `1px solid ${V.line}`, background: "#080808" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
              <span style={{ color: V.ink3, marginRight: 8, fontSize: 11 }}>▪</span>교차로별 위험도
            </span>
            <span style={{ marginLeft: "auto", fontFamily: V.mono, fontSize: 12, color: isLive ? V.grn : V.ink2, padding: "3px 8px", border: `1px solid ${isLive ? "#1a3a24" : V.line}`, borderRadius: 2, background: isLive ? "#0c1a12" : V.bg0 }}>
              {isLive ? "● 실시간" : "참고값"}
            </span>
          </div>
          <div style={{ padding: 12 }}>
            {/* 관심 교차로 등록 바 */}
            <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "10px 14px", background: V.bg0, border: `1px solid ${V.line}`, borderRadius: 2, marginBottom: 12 }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: "#fff" }}>
                <span style={{ color: V.ink3, marginRight: 8, fontSize: 11 }}>◉</span>관심 교차로 등록
              </span>
              <RiskDropdown options={riskData} selectedIdx={-1} onChange={i => toggleWatch(riskData[i])} watchIds={watchList.map(w => w.id)} />
              <span style={{ marginLeft: "auto", fontFamily: V.mono, fontSize: 11, color: V.ink2 }}>{watchList.length}/8 등록됨 · 최대 8개</span>
            </div>

            {/* 8슬롯 그리드 (클릭 → 도넛/예측 차트 연동) */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", border: `1px solid ${V.line}`, borderRadius: 2, background: V.bg1, marginBottom: 12, overflow: "hidden" }}>
              {Array.from({ length: 8 }).map((_, i) => {
                const d = displayWatch[i];
                const isManual = d && watchList.some(w => w.id === d.id);
                const color = d ? riskColor(d.score, d.grade) : V.line;
                const isSel = i === riskIdx;
                return d ? (
                  <div key={i} onClick={() => setRiskIdx(i)} style={{
                    display: "grid", gridTemplateColumns: "auto 1fr auto", alignItems: "center", gap: 10,
                    padding: "14px 16px", background: isSel ? "#141414" : "transparent",
                    borderRight: `1px solid ${V.line}`, borderBottom: `1px solid ${V.line}`,
                    cursor: "pointer", boxShadow: isSel ? `inset 2px 0 0 ${color}` : "none",
                  }}>
                    <span style={{ fontFamily: V.mono, fontSize: 12, color: isSel ? "#fff" : V.ink2, fontWeight: 700 }}>#{i + 1}</span>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#d8dde8", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d.name}</span>
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                      <span style={{ fontFamily: V.mono, fontSize: 16, fontWeight: 700, color: "#fff" }}>{hasRiskScore(d.score) ? d.score : "—"}</span>
                      {isManual && (
                        <span onClick={e => { e.stopPropagation(); toggleWatch(d); }}
                          style={{ fontSize: 9, color: V.ink2, cursor: "pointer", padding: "1px 4px", border: `1px solid ${V.line}`, borderRadius: 2 }}>✕</span>
                      )}
                    </div>
                  </div>
                ) : (
                  <div key={i} style={{ padding: "14px 16px", borderRight: `1px solid ${V.line}`, borderBottom: `1px solid ${V.line}`, display: "flex", alignItems: "center", justifyContent: "center", border: `1px dashed ${V.line}`, color: V.ink3, fontSize: 11, fontFamily: V.mono }}>
                    #{i + 1} 빈 슬롯
                  </div>
                );
              })}
            </div>

            {/* 도넛 차트 + 위험도 breakdown */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
              <DonutChart name={selectedRisk?.name} score={selectedRisk?.score} grade={selectedRisk?.grade} />
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {bdItems.map((b, i) => (
                  <div key={i} style={{ background: V.bg0, border: `1px solid ${V.line}`, borderRadius: 2, padding: "16px 18px", display: "grid", gridTemplateColumns: "1fr auto", rowGap: 12 }}>
                    <div style={{ fontSize: 14, color: "#fff", fontWeight: 600 }}>
                      {b.label}
                      <small style={{ display: "block", color: V.ink2, fontSize: 11, fontFamily: V.mono, fontWeight: 500, marginTop: 3 }}>{b.sub}</small>
                    </div>
                    <div style={{ fontFamily: V.mono, fontWeight: 700, fontSize: 28, color: "#fff", textAlign: "right", alignSelf: "end" }}>
                      {b.value}<em style={{ fontStyle: "normal", fontSize: 13, color: V.ink2, marginLeft: 3 }}>{b.unit}</em>
                    </div>
                    <div style={{ gridColumn: "1/3", height: 6, background: "#141414" }}>
                      <div style={{ height: "100%", width: `${b.pct}%`, background: b.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* 시간대별 교통량 예측 */}
        <div style={{ background: V.bg1, border: `1px solid ${V.line}`, borderRadius: 2, display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "11px 14px", borderBottom: `1px solid ${V.line}`, background: "#080808" }}>
            <span style={{ fontSize: 15, fontWeight: 700, color: "#fff" }}>
              <span style={{ color: V.ink3, marginRight: 8, fontSize: 11 }}>▪</span>시간대별 교통량 예측
            </span>
            <span style={{
              marginLeft: "auto", fontFamily: V.mono, fontSize: 11,
              color: forecast.isLoaded ? V.grn : V.org,
              padding: "3px 8px", border: `1px solid ${forecast.isLoaded ? "#1a3a24" : "#3a2a14"}`,
              borderRadius: 2, background: forecast.isLoaded ? "#0c1a12" : "#1a1206",
            }}>
              {forecast.isLoaded ? "● 예측 모델" : "로드 중/데이터 없음"}
            </span>
          </div>

          {/* DB 지점 드롭다운 */}
          <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderBottom: `1px solid ${V.line}`, background: "#060606" }}>
            <span style={{ fontSize: 12, color: V.ink2, fontFamily: V.mono }}>지점 선택</span>
            <StationPredictDropdown stations={filteredStations} selectedId={predictStationId} onSelect={setPredictStationId} />
          </div>

          <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 12, flex: 1, minHeight: 0 }}>
            <ForecastChart up={forecast.up} down={forecast.down} name={forecast.name} />
          </div>
        </div>
      </div>

    </div>
  );
}
