import { useState, useEffect, useCallback, useRef } from "react";
import SimulationMapView from "../components/map/SimulationMapView";
import AppHeader from "../components/common/AppHeader";
import SimSliderPanel from "../components/simulation/SimSliderPanel";
import VehicleSignalPanel from "../components/simulation/VehicleSignalPanel";
import {
  RoutePointCard, MetricBox, WaypointSlideControl, AnalysisLoadingBlock,
  cardStyle, tabButtonStyle,
} from "../components/simulation/SimUIComponents";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8080").replace(/\/+$/, "");

function formatSec(sec) {
  if (sec == null) return "-";
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

function formatDistance(meters) {
  if (!meters) return "-";
  return meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${meters} m`;
}

function resolveSegments(segments) {
  if (!segments?.length) return [];
  return segments
    .map(seg => {
      const speed = seg.selectedTraffic ?? seg.up;
      if (!speed?.speedKph) return null;
      return { fromIntNo: seg.fromIntNo, toIntNo: seg.toIntNo, axisName: seg.axisName, speedKph: speed.speedKph, congestion: speed.congestion };
    })
    .filter(Boolean);
}

export default function SimulationDashboard({ onGoMain, onGoMap, onGoNews, onGoCctv, onGoComplaints, onGoMyPage, onLogout, selectedGu, isMuted, onToggleMute, isMicActive, onToggleMic, }) {
  const [selectedList, setSelectedList] = useState([]);
  const [isOptimized, setIsOptimized] = useState(false);
  const [stats, setStats] = useState(null);
  const [originPhaseIdx, setOriginPhaseIdx] = useState(null);
  const [waypointPhaseIdx, setWaypointPhaseIdx] = useState(null);
  const [destPhaseIdx, setDestPhaseIdx] = useState(null);
  const [simPhases, setSimPhases] = useState(null);
  const [simPhaseTarget, setSimPhaseTarget] = useState(null);
  const [originContext, setOriginContext] = useState(null);
  const [waypointContext, setWaypointContext] = useState(null);
  const [destContext, setDestContext] = useState(null);
  const [autoWaypoints, setAutoWaypoints] = useState([]);
  const [selectedWaypointIndex, setSelectedWaypointIndex] = useState(0);
  const [selectedBottleneckIndex, setSelectedBottleneckIndex] = useState(0);
  const [sliderTarget, setSliderTarget] = useState("end");
  const [currentVehicleSignal, setCurrentVehicleSignal] = useState(null);
  const [routeTraffic, setRouteTraffic] = useState(null);
  const [routeAnalysis, setRouteAnalysis] = useState(null);
  const [routeReport, setRouteReport] = useState(null);
  const [routeAnalysisLoading, setRouteAnalysisLoading] = useState(false);
  const [aiAdjustment, setAiAdjustment] = useState(null);
  const [aiAdjustKey, setAiAdjustKey] = useState(0);
  const [aiAdjustmentsMap, setAiAdjustmentsMap] = useState({});
  const [appliedIntNos, setAppliedIntNos] = useState(new Set());
  const [speedUnavailable, setSpeedUnavailable] = useState(false);
  const [bottleneckCrossroads, setBottleneckCrossroads] = useState([]);
  const [bottleneckContextMap, setBottleneckContextMap] = useState({});
  const [driveView, setDriveView] = useState(false);
  const llmCalledRouteRef = useRef(null);
  const llmTimerRef = useRef(null);

  const start = selectedList[0] ?? null;
  const end = selectedList.length >= 2 ? selectedList[selectedList.length - 1] : null;
  const waypointList = autoWaypoints || [];
  const clampedWaypointIndex = waypointList.length ? Math.min(Math.max(selectedWaypointIndex, 0), waypointList.length - 1) : 0;
  const selectedWaypoint = waypointList[clampedWaypointIndex] ?? null;
  const clampedBottleneckIndex = bottleneckCrossroads.length ? Math.min(Math.max(selectedBottleneckIndex, 0), bottleneckCrossroads.length - 1) : 0;
  const selectedBottleneck = bottleneckCrossroads[clampedBottleneckIndex] ?? null;

  const sliderCrossroad = sliderTarget === "start" ? start
    : sliderTarget === "waypoint" ? selectedWaypoint
    : sliderTarget === "bottleneck" ? selectedBottleneck
    : end;

  const activeSignalKey = sliderTarget === "waypoint" && sliderCrossroad
    ? `waypoint:${sliderCrossroad.intNo}`
    : sliderTarget === "bottleneck" && sliderCrossroad
      ? `bottleneck:${sliderCrossroad.intNo}`
      : sliderTarget;

  const canOptimize = !!start && !!end && !!stats;

  const getVehicleSignalForCrossroad = useCallback((crossroad) => {
    if (!crossroad || !currentVehicleSignal) return null;
    const byIntNo = currentVehicleSignal.byIntNo || {};
    const mapped = byIntNo[String(crossroad.intNo)];
    if (mapped) return mapped;
    if (String(currentVehicleSignal.intNo) === String(crossroad.intNo)) return currentVehicleSignal;
    return null;
  }, [currentVehicleSignal]);

  const selectedSignalConfig = {
    start: { icon: "🟢", label: "출발지", signalTitle: "출발지 신호체계", adjustTitle: "출발지 신호 조정", crossroad: start, emptyText: "출발지를 먼저 선택하세요", onPhaseChange: setOriginPhaseIdx, onContextChange: setOriginContext },
    waypoint: { icon: "🟠", label: "병목 경유지", signalTitle: "병목 경유지 신호체계", adjustTitle: "병목 경유지 신호 조정", crossroad: selectedWaypoint, emptyText: "자동 경유지가 잡히면 경유지 신호체계가 표시됩니다", onPhaseChange: setWaypointPhaseIdx, onContextChange: setWaypointContext },
    bottleneck: { icon: "🟡", label: "병목지", signalTitle: "병목지 신호체계", adjustTitle: "병목지 신호 조정", crossroad: selectedBottleneck, emptyText: "병목지가 탐색되면 신호체계가 표시됩니다", onPhaseChange: setWaypointPhaseIdx, onContextChange: (ctx) => { setWaypointContext(ctx); if (selectedBottleneck?.intNo && ctx?.phases?.length) setBottleneckContextMap(prev => ({ ...prev, [String(selectedBottleneck.intNo)]: ctx })); } },
    end: { icon: "🔴", label: "목적지", signalTitle: "목적지 신호체계", adjustTitle: "목적지 신호 조정", crossroad: end, emptyText: "목적지를 선택하면 신호체계가 표시됩니다", onPhaseChange: setDestPhaseIdx, onContextChange: setDestContext },
  };

  const activeSignal = selectedSignalConfig[sliderTarget] ?? selectedSignalConfig.end;
  const hasActiveSignalCrossroad = !!activeSignal.crossroad;
  const bottleneckSignalKey = selectedBottleneck ? `bottleneck:${selectedBottleneck.intNo}` : "bottleneck";

  // VehicleSignalPanel이 이미 가져온 context → 슬라이더 기준값으로 사용 (DB 중복 fetch 제거)
  const activeContext = sliderTarget === "start" ? originContext
    : sliderTarget === "end" ? destContext
    : waypointContext;

  // 현재 슬라이더 교차로에 AI 제안값이 있으면 추출
  const aiSuggestedValues = (() => {
    if (!sliderCrossroad) return null;
    const adj = aiAdjustmentsMap[String(sliderCrossroad.intNo)]
      || (aiAdjustment && String(aiAdjustment.intNo) === String(sliderCrossroad.intNo) ? aiAdjustment : null);
    if (!adj) return null;
    return Object.fromEntries(adj.phases.map(p => [p.no, p.sec]));
  })();

  // AI 조정 결과를 슬라이더 타겟 교차로에 반영
  const applyAdjustment = useCallback((adj) => {
    if (!adj?.intNo || !adj?.phases?.length) return;
    setAiAdjustment(adj);
    const adjIntNo = String(adj.intNo);
    const bIdx = bottleneckCrossroads.findIndex(b => String(b.intNo) === adjIntNo);
    if (bIdx !== -1) { setSliderTarget("bottleneck"); setSelectedBottleneckIndex(bIdx); }
    else if (end && String(end.intNo) === adjIntNo) { setSliderTarget("end"); }
    else if (start && String(start.intNo) === adjIntNo) { setSliderTarget("start"); }
    else {
      const wpIdx = waypointList.findIndex(w => String(w.intNo) === adjIntNo);
      if (wpIdx !== -1) { setSliderTarget("waypoint"); setSelectedWaypointIndex(wpIdx); }
    }
    setAiAdjustKey(k => k + 1);
  }, [bottleneckCrossroads, end, start, waypointList]);

  // 경로 병목 구간 AI 분석
  const callLLM = useCallback((resolved) => {
    if (!end?.intNo) return;
    const _bottleneckContextMap = bottleneckContextMap;
    // Spring은 List<String> 기대 → 반드시 문자열로 변환
    const bottleneckIntNos = resolved
      .filter(seg => Number(seg.speedKph) < 15)
      .map(seg => String(seg.toIntNo))
      .filter((v, i, arr) => arr.indexOf(v) === i);

    setAiAdjustment(null);
    setAiAdjustmentsMap({});
    setAppliedIntNos(new Set());
    setAiAdjustKey(0);
    setSpeedUnavailable(false);

    if (bottleneckIntNos.length === 0) {
      setRouteAnalysis("현재 경로에 15km/h 이하 병목구간이 없습니다. AI 신호 개입이 필요하지 않습니다.");
      setRouteAnalysisLoading(false);
      return;
    }

    setRouteAnalysis(null);
    setRouteReport(null);
    setRouteAnalysisLoading(true);

    // Spring 백엔드 /api/simulation-chat → 내부적으로 Python agent(8001)로 프록시
    fetch(`${API_BASE}/api/simulation-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: "각 병목 교차로의 신호계획을 분석해서 15km/h 이하 구간 전체의 신호를 최적화해줘. 분석 결과와 추천 신호 조정값만 반환하고, 실제 적용은 관제사 승인 이후 진행됩니다.",
        routeTraffic: resolved,
        bottleneckIntNos,
        contexts: bottleneckIntNos.map(id => _bottleneckContextMap[String(id)]).filter(Boolean),
        userEmail: JSON.parse(localStorage.getItem("ts_user") || "{}").email || null,
      }),
    })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => {
        const rawAnswer = data.answer ?? null;
        const cleanAnswer = rawAnswer
          ? rawAnswer.replace(/^###\s*/gm, "• ").replace(/^##\s*/gm, "• ").replace(/^#\s*/gm, "• ")
          : null;
        setRouteAnalysis(cleanAnswer);
        setRouteReport(data.report ?? null);
        const adjs = data.adjustments?.length ? data.adjustments
          : data.adjustment?.intNo ? [data.adjustment] : [];
        if (adjs.length > 0) {
          const map = {};
          adjs.forEach(adj => { if (adj?.intNo && adj?.phases?.length) map[String(adj.intNo)] = adj; });
          setAiAdjustmentsMap(map);
        } else {
          setAiAdjustmentsMap({});
        }
      })
      .catch((e) => {
        setRouteAnalysis(`AI 병목 분석 중 오류가 발생했습니다. (${e.message}) 다시 시도해주세요.`);
        setAiAdjustmentsMap({});
      })
      .finally(() => setRouteAnalysisLoading(false));
  }, [end, bottleneckContextMap]);

  // 경로 확정 시 속도 수집 타임아웃
  useEffect(() => {
    if (!end?.intNo || !stats?.distanceMeters) return;
    setSpeedUnavailable(false);
    setRouteAnalysis(null);
    setRouteReport(null);
    setRouteAnalysisLoading(false);
    setAiAdjustment(null);
    setAiAdjustmentsMap({});
    setAiAdjustKey(0);
    setIsOptimized(false);
    llmCalledRouteRef.current = null;

    if (llmTimerRef.current) clearTimeout(llmTimerRef.current);
    llmTimerRef.current = setTimeout(() => {
      llmTimerRef.current = null;
      if (routeTraffic?.segments?.length) return;
      setSpeedUnavailable(true);
      setRouteAnalysisLoading(false);
    }, 10000);

    return () => { if (llmTimerRef.current) { clearTimeout(llmTimerRef.current); llmTimerRef.current = null; } };
  }, [start?.intNo, end?.intNo, stats?.distanceMeters]);

  // 속도 데이터 도착 시 타임아웃 취소
  useEffect(() => {
    if (!routeTraffic || !end?.intNo) return;
    if (llmTimerRef.current) { clearTimeout(llmTimerRef.current); llmTimerRef.current = null; }
    const resolved = resolveSegments(routeTraffic.segments);
    if (!resolved.length) { setSpeedUnavailable(true); setRouteAnalysisLoading(false); return; }
    setSpeedUnavailable(false);
    setRouteAnalysisLoading(false);
  }, [routeTraffic, end?.intNo]);

  // 실시간 속도 도착 시 stats 재계산
  useEffect(() => {
    if (!routeTraffic?.segments?.length || !stats?.distanceMeters) return;
    const resolved = resolveSegments(routeTraffic.segments);
    const speeds = resolved.map(seg => Number(seg.speedKph)).filter(s => Number.isFinite(s) && s > 0);
    if (!speeds.length) return;

    const distance = stats.distanceMeters;
    const avgSpeed = speeds.reduce((a, b) => a + b, 0) / speeds.length;
    const slowSegs = speeds.filter(s => s < 15);
    const bottleneckCount = slowSegs.length;
    const beforeSec = Math.round(distance / (avgSpeed / 3.6));
    const improvedSpeeds = speeds.map(s => (s < 15 ? Math.min(s * 1.35, 50) : s));
    const afterAvg = improvedSpeeds.reduce((a, b) => a + b, 0) / improvedSpeeds.length;
    const afterSec = Math.round(distance / (afterAvg / 3.6));

    setStats(prev => ({
      ...prev,
      beforeSec,
      afterSec: isOptimized ? afterSec : null,
      savedSec: isOptimized ? Math.max(0, beforeSec - afterSec) : null,
      beforeSpeedKph: Math.round(avgSpeed * 10) / 10,
      afterSpeedKph: isOptimized ? Math.round(afterAvg * 10) / 10 : null,
      bottleneckCount,
    }));

    const nodeMap = {};
    (routeTraffic.requestedRouteNodes || []).forEach(n => { nodeMap[String(n.intNo)] = n; });

    const bCrossroads = resolved
      .filter(seg => Number(seg.speedKph ?? 999) < 15)
      .map(seg => ({ intNo: seg.toIntNo, intNm: nodeMap[String(seg.toIntNo)]?.intNm || `교차로 ${seg.toIntNo}`, speedKph: seg.speedKph }))
      .filter((v, i, arr) => arr.findIndex(x => String(x.intNo) === String(v.intNo)) === i);

    setBottleneckCrossroads(bCrossroads);
    // 병목 교차로 context 미리 fetch (DB fallback) — VehicleSignalPanel이 본 교차로는 덮어쓰지 않음
    setBottleneckContextMap({});
    bCrossroads.forEach(cr => {
      fetch(`${API_BASE}/api/signal/simulation/context/${cr.intNo}`)
        .then(r => r.json())
        .then(ctx => {
          if (!ctx.error) setBottleneckContextMap(prev =>
            prev[String(cr.intNo)] ? prev : { ...prev, [String(cr.intNo)]: ctx }
          );
        })
        .catch(() => {});
    });
  }, [routeTraffic, stats?.distanceMeters, isOptimized]);

  // 출발지/목적지 변경 시 상태 초기화
  useEffect(() => {
    setSimPhases(null);
    setSimPhaseTarget(null);
    setOriginContext(null);
    setWaypointContext(null);
    setDestContext(null);
    if (selectedWaypointIndex >= waypointList.length) setSelectedWaypointIndex(Math.max(0, waypointList.length - 1));
    if (!waypointList.length && sliderTarget === "waypoint") setSliderTarget(end ? "end" : "start");
    if (!selectedBottleneck && sliderTarget === "bottleneck") setSliderTarget(end ? "end" : start ? "start" : "end");
    if (!end && sliderTarget === "end") setSliderTarget(start ? "start" : "end");
    if (!start) setSliderTarget("end");
  }, [start?.intNo, end?.intNo, waypointList.map(item => item.intNo).join("|")]);

  const handleSelect = (cr) => {
    setSelectedList(prev => {
      setIsOptimized(false);
      setStats(null);
      setSimPhases(null);
      setSimPhaseTarget(null);
      setRouteAnalysis(null);
    setRouteReport(null);
      setRouteAnalysisLoading(false);
      setAiAdjustment(null);
      setAiAdjustKey(0);
      setAiAdjustmentsMap({});
      setAppliedIntNos(new Set());
      setSpeedUnavailable(false);
      setBottleneckCrossroads([]);
      setCurrentVehicleSignal(null);
      llmCalledRouteRef.current = null;
      if (llmTimerRef.current) { clearTimeout(llmTimerRef.current); llmTimerRef.current = null; }

      if (prev.length === 0) { setSliderTarget("start"); return [cr]; }
      const clickedIndex = prev.findIndex(item => String(item.intNo) === String(cr.intNo));
      if (clickedIndex !== -1) {
        if (clickedIndex === 0) { setSliderTarget("start"); return prev; }
        if (clickedIndex === prev.length - 1) { setSliderTarget("end"); return prev; }
        setSliderTarget("waypoint");
        setSelectedWaypointIndex(Math.max(0, clickedIndex - 1));
        return prev;
      }
      setSliderTarget("end");
      return [...prev, cr];
    });
  };

  const resetSimulation = () => {
    setSelectedList([]);
    setIsOptimized(false);
    setStats(null);
    setSimPhases(null);
    setSimPhaseTarget(null);
    setOriginContext(null);
    setWaypointContext(null);
    setDestContext(null);
    setAutoWaypoints([]);
    setSelectedWaypointIndex(0);
    setSliderTarget("end");
    setCurrentVehicleSignal(null);
    setRouteTraffic(null);
    setRouteAnalysis(null);
    setRouteReport(null);
    setRouteAnalysisLoading(false);
    setAiAdjustment(null);
    setAiAdjustKey(0);
    setAiAdjustmentsMap({});
    setAppliedIntNos(new Set());
    setSpeedUnavailable(false);
    setBottleneckCrossroads([]);
    setDriveView(false);
    llmCalledRouteRef.current = null;
    if (llmTimerRef.current) { clearTimeout(llmTimerRef.current); llmTimerRef.current = null; }
  };

  const handleManualSave = (simulation) => {
    setSimPhases(simulation);
    setSimPhaseTarget(activeSignalKey);
    setIsOptimized(true);
  };

  const runAiBottleneckAnalysis = () => {
    if (!canOptimize || routeAnalysisLoading) return;
    const resolved = resolveSegments(routeTraffic?.segments);
    if (!resolved.length) { setRouteAnalysis("속도 API 매핑 결과가 없어 AI 병목 분석을 실행할 수 없습니다."); setSpeedUnavailable(true); return; }
    const bottleneckSegments = resolved.filter(seg => seg.speedKph < 15);
    if (!bottleneckSegments.length) { setRouteAnalysis("현재 경로에 15km/h 이하 병목구간이 없습니다. AI 신호 개입이 필요하지 않습니다."); setAiAdjustmentsMap({}); return; }
    setIsOptimized(false);
    callLLM(resolved);
  };

  const applySignalControl = () => {
    if (!canOptimize || routeAnalysisLoading) return;
    const adjustments = Object.values(aiAdjustmentsMap || {});
    if (!adjustments.length) { setRouteAnalysis("먼저 AI 병목 분석 버튼을 눌러 추천 신호 조정값을 받아주세요."); return; }

    // 아직 미적용된 조정값 중 현재 선택된 병목지 우선, 없으면 첫 번째 미적용
    const unapplied = adjustments.filter(adj => !appliedIntNos.has(String(adj.intNo)));
    const target = (selectedBottleneck && aiAdjustmentsMap[String(selectedBottleneck.intNo)] && !appliedIntNos.has(String(selectedBottleneck.intNo)))
      ? aiAdjustmentsMap[String(selectedBottleneck.intNo)]
      : unapplied[0];

    if (!target?.intNo || !target?.phases?.length) {
      // 모두 적용 완료
      setIsOptimized(true);
      return;
    }

    applyAdjustment(target);
    setAppliedIntNos(prev => new Set([...prev, String(target.intNo)]));

    // 모두 적용됐으면 완료 처리
    if (unapplied.length <= 1) setIsOptimized(true);
  };

  const handleAutoApplied = (simulation) => {
    setSimPhases(simulation);
    setSimPhaseTarget(activeSignalKey);
  };
  const handleBottleneckManualSave = (simulation) => {
    setSimPhases(simulation); setSimPhaseTarget(bottleneckSignalKey); setIsOptimized(true);
  };
  const handleBottleneckAutoApplied = (simulation) => {
    setSimPhases(simulation);
    setSimPhaseTarget(bottleneckSignalKey);
  };

  const panelTitle = activeSignal.adjustTitle;
  const activeSignalPhaseOverride = simPhaseTarget === activeSignalKey ? simPhases : null;

  return (
    <div style={{ fontFamily: "'Noto Sans KR','Malgun Gothic',sans-serif", background: "#12100a", color: "#e2e8f0", height: "100vh", display: "flex", flexDirection: "column", overflow: "hidden" }}>
      <AppHeader
        activePage="simulation"
        selectedGu={selectedGu}
        statusText={start && end ? (isOptimized ? "신호제어 적용 중" : "현행 신호 운영") : "경로 선택 대기"}
        statusLive={!!(start && end && isOptimized)}
        onGoMain={onGoMain} onGoMap={onGoMap} onGoNews={onGoNews} onGoCctv={onGoCctv}
        onGoSimulation={() => {}} onGoComplaints={onGoComplaints} onGoMyPage={onGoMyPage} onLogout={onLogout}
        rightExtra={(
          <>
            {onToggleMic && (
              <button
                onClick={onToggleMic}
                title={isMicActive ? "AI 음성 끄기" : "AI 음성 켜기"}
                style={{
                  background: isMicActive ? "rgba(255,60,60,0.15)" : "transparent",
                  border: 0, borderRadius: 999, width: 32, height: 32, display: "flex", alignItems: "center",
                  justifyContent: "center", cursor: "pointer", flexShrink: 0,
                }}
              >
                <img
                  src={isMicActive ? "/icons/microphone.png" : "/icons/microphone_off.png"}
                  alt=""
                  style={{
                    width: 18, height: 18, objectFit: "contain", filter: "invert(1)", opacity: isMicActive ? 1 : 0.75,
                  }}
                />
              </button>
            )}

            {onToggleMute && (
              <button
                onClick={onToggleMute}
                title={isMuted ? "음소거 해제" : "음소거"}
                style={{
                  background: isMuted ? "#1a0a0a" : "transparent",
                  border: 0, borderRadius: 999, width: 32, height: 32, display: "flex",
                  alignItems: "center", justifyContent: "center", cursor: "pointer", flexShrink: 0,
                }}
              >
                <img
                  src={isMuted ? "/icons/mute.png" : "/icons/speaker.png"}
                  alt=""
                  style={{
                    width: 18, height: 18, objectFit: "contain", filter: "invert(1)", opacity: isMuted ? 1 : 0.9,
                  }}
                />
              </button>
            )}
          </>
  )}

      />
      <div style={{ flex: 1, display: "grid", gridTemplateColumns: driveView ? "minmax(0, 1fr) 400px" : "minmax(0, 1fr) 330px 400px", minHeight: 0 }}>

        {/* 지도 영역 */}
        <div style={{ padding: "10px 6px 10px 10px", minHeight: 0, position: "relative" }}>
          <div style={{ height: "100%", borderRadius: 11, overflow: "hidden", border: `1px solid ${isOptimized ? "rgba(34,197,94,0.3)" : "rgba(255,255,255,0.08)"}`, boxShadow: isOptimized ? "0 0 20px rgba(34,197,94,0.1)" : "none" }}>
            <SimulationMapView
              selectedList={selectedList} selectedGu={selectedGu} onSelect={handleSelect}
              isOptimized={isOptimized} onStatsChange={setStats} onAutoWaypointsChange={setAutoWaypoints}
              onRouteTrafficChange={setRouteTraffic} onCurrentSignalChange={setCurrentVehicleSignal}
              onResetRoute={resetSimulation} routeTraffic={routeTraffic}
              onDriveViewChange={setDriveView}
            />
          </div>
        </div>

        {/* 경로/병목 패널 */}
        {!driveView && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 6px 10px 4px", overflowY: "auto" }}>
            <div style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <div style={{ fontWeight: 800, color: "#ffffff", fontSize: 15 }}>목적지 기반 시뮬레이션</div>
                <button onClick={resetSimulation} style={{ background: "transparent", border: "1px solid #334155", color: "#94a3b8", borderRadius: 4, padding: "4px 8px", cursor: "pointer", fontSize: 11 }}>초기화</button>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8 }}>
                <RoutePointCard type="start" title="출발지" crossroad={start} empty="지도에서 첫 번째 마커를 클릭하세요" />
                {bottleneckCrossroads.length > 0
                  ? bottleneckCrossroads.map((cr, i) => <RoutePointCard key={cr.intNo} type="waypoint" title={`병목 ${i + 1} (${cr.speedKph}km/h)`} crossroad={cr} empty="" />)
                  : <RoutePointCard type="waypoint" title="병목 경유지" crossroad={null} empty={end ? "속도 수집 후 표시됩니다" : "목적지를 선택하면 자동 탐색됩니다"} />
                }
                <RoutePointCard type="end" title="목적지" crossroad={end} empty="지도에서 두 번째 마커를 클릭하세요" />
              </div>
            </div>

            {/* 병목구간 분석 */}
            <div style={cardStyle}>
              <div style={{ fontWeight: 800, color: "#ffffff", fontSize: 14, marginBottom: 10 }}>병목구간 분석</div>
              {stats ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
                    <MetricBox label="전체 거리" value={formatDistance(stats.distanceMeters)} />
                    <MetricBox label="병목구간" value={stats.bottleneckCount != null ? `${stats.bottleneckCount}개` : routeAnalysisLoading ? "수집 중..." : "-"} />
                  </div>
                  <div style={{ padding: 10, borderRadius: 5, fontSize: 12, lineHeight: 1.6, whiteSpace: "pre-wrap", background: routeAnalysisLoading ? "rgba(96,165,250,0.06)" : isOptimized ? "rgba(34,197,94,0.08)" : "rgba(239,68,68,0.08)", border: `1px solid ${routeAnalysisLoading ? "rgba(96,165,250,0.2)" : isOptimized ? "rgba(34,197,94,0.28)" : "rgba(239,68,68,0.25)"}`, color: isOptimized ? "#bbf7d0" : "#fecaca" }}>
                    {speedUnavailable
                      ? <span style={{ color: "#64748b" }}>속도 수집 불가 — TOPIS 미수집 구간입니다. 신호계획 기반으로 수동 조정하세요.</span>
                      : routeAnalysisLoading ? <AnalysisLoadingBlock />
                      : routeAnalysis ? routeAnalysis
                      : isOptimized ? "관제사가 병목구간의 직진 신호 시간을 늘려 통과속도가 개선된 상태입니다."
                      : "경로 중간 구간에서 속도 저하가 발생했습니다. 신호제어를 적용하면 예상 도착시간을 줄일 수 있습니다."}
                  </div>
                </>
              ) : (
                <div style={{ color: "#64748b", fontSize: 13, lineHeight: 1.7 }}>출발지와 목적지를 모두 선택하면 경로와 병목구간이 표시됩니다.</div>
              )}
            </div>

            {/* 도착시간 비교 */}
            <div style={cardStyle}>
              <div style={{ fontWeight: 800, color: "#ffffff", fontSize: 14, marginBottom: 10 }}>도착시간 비교</div>
              {stats?.beforeSec != null ? (
                <>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
                    <MetricBox label="제어 전" value={formatSec(stats.beforeSec)} color="#ef4444" sub={`${stats.beforeSpeedKph}km/h`} animate />
                    <MetricBox label="제어 후" value={formatSec(stats.afterSec)} color="#22c55e" sub={`${stats.afterSpeedKph}km/h`} animate />
                  </div>
                  <div style={{ padding: "12px 10px", borderRadius: 5, background: "rgba(34,197,94,0.10)", border: "1px solid rgba(34,197,94,0.35)", textAlign: "center" }}>
                    <div style={{ fontSize: 11, color: "#94a3b8", marginBottom: 4 }}>예상 단축 시간</div>
                    <div style={{ fontSize: 24, color: "#22c55e", fontWeight: 900 }}>{formatSec(stats.savedSec)}</div>
                  </div>
                </>
              ) : (
                <div style={{ color: "#64748b", fontSize: 13 }}>{stats ? "속도 데이터 수집 후 표시됩니다." : "경로 선택 후 비교 결과가 표시됩니다."}</div>
              )}
            </div>

            {/* AI 분석 / 신호제어 버튼 */}
            {(() => {
              const totalAdj = Object.keys(aiAdjustmentsMap || {}).length;
              const appliedCount = appliedIntNos.size;
              const remaining = totalAdj - appliedCount;
              const allApplied = totalAdj > 0 && remaining <= 0;
              const ctrlDisabled = !canOptimize || routeAnalysisLoading || totalAdj === 0 || (isOptimized && allApplied);
              return (
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <button
                    onClick={runAiBottleneckAnalysis}
                    disabled={!canOptimize || routeAnalysisLoading || speedUnavailable || !routeTraffic?.segments?.length}
                    style={{ border: "none", borderRadius: 6, padding: "14px 12px", textAlign: "center", background: routeAnalysisLoading ? "rgba(96,165,250,0.12)" : "#2563eb", color: routeAnalysisLoading ? "#60a5fa" : "#fff", fontSize: 14, fontWeight: 900, cursor: (!canOptimize || routeAnalysisLoading || speedUnavailable || !routeTraffic?.segments?.length) ? "not-allowed" : "pointer", opacity: (!canOptimize || speedUnavailable || !routeTraffic?.segments?.length) ? 0.45 : 1 }}
                  >
                    {routeAnalysisLoading ? "AI 분석 중..." : "AI 병목 분석"}
                  </button>
                  <button
                    onClick={applySignalControl}
                    disabled={ctrlDisabled}
                    style={{ border: "none", borderRadius: 6, padding: "14px 12px", textAlign: "center", background: allApplied ? "#166534" : "#16a34a", color: "#fff", fontSize: 13, fontWeight: 900, cursor: ctrlDisabled ? "not-allowed" : "pointer", opacity: ctrlDisabled ? 0.45 : 1, lineHeight: 1.3 }}
                  >
                    {allApplied
                      ? `✓ ${totalAdj}개 교차로 완료`
                      : totalAdj > 0 && appliedCount > 0
                        ? `병목신호 제어 (${appliedCount}/${totalAdj})`
                        : "관제사 병목신호 제어"}
                  </button>
                </div>
              );
            })()}

            {/* 단계 상태 표시 */}
            {(() => {
              const totalAdj = Object.keys(aiAdjustmentsMap || {}).length;
              const appliedCount = appliedIntNos.size;
              const allApplied = totalAdj > 0 && appliedCount >= totalAdj;
              return (
                <div style={{ border: "none", borderRadius: 6, padding: "12px 14px", textAlign: "center", background: allApplied ? "#166534" : routeAnalysisLoading ? "rgba(96,165,250,0.1)" : "#1f2937", color: allApplied ? "#fff" : routeAnalysisLoading ? "#60a5fa" : "#94a3b8", fontSize: 13, fontWeight: 900 }}>
                  {allApplied ? `✓ ${totalAdj}개 교차로 제어 완료 — AI 분석 포함 이메일 발송됨`
                    : routeAnalysisLoading ? "● AI 병목 분석 중..."
                    : totalAdj > 0 && appliedCount > 0 ? `병목지 ${appliedCount}/${totalAdj} 적용 완료 — 나머지 병목지를 선택 후 제어하세요`
                    : totalAdj > 0 ? `AI 분석 완료 (${totalAdj}개 교차로) — 병목지 선택 후 관제사 제어 버튼 클릭`
                    : routeTraffic?.segments?.length ? "병목구간 확인 완료 — AI 병목 분석을 실행하세요"
                    : "출발지와 목적지를 선택하면 속도 API 기반 병목구간을 표시합니다"}
                </div>
              );
            })()}

            {/* 사용 방법 */}
            <div style={{ ...cardStyle, flexShrink: 0 }}>
              <div style={{ fontWeight: 800, color: "#cbd5e1", fontSize: 13, marginBottom: 8 }}>사용 방법</div>
              <ol style={{ margin: 0, paddingLeft: 18, color: "#94a3b8", fontSize: 12, lineHeight: 1.8 }}>
                <li>지도에서 첫 번째 마커를 클릭해 출발지를 선택합니다.</li>
                <li>두 번째 마커를 클릭하면 목적지와 경로가 생성됩니다.</li>
                <li>가운데 패널에서 속도 API 기반 병목구간을 먼저 확인합니다.</li>
                <li>AI 병목 분석 버튼으로 원인과 추천 신호 조정값을 확인합니다.</li>
                <li>오른쪽 패널에서 신호를 조정하고 저장하면 AI 분석 내용이 이메일로 자동 발송됩니다.</li>
              </ol>
            </div>
          </div>
        )}

        {/* 신호체계 패널 */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "10px 10px 10px 4px", overflowY: "auto" }}>
          <div style={cardStyle}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div style={{ fontWeight: 900, color: "#ffffff", fontSize: 15 }}>출발지/경유지/병목지/목적지 신호체계</div>
              <div style={{ fontSize: 11, color: "#64748b" }}>선택 확인</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 6 }}>
              <button onClick={() => setSliderTarget("start")} disabled={!start} style={tabButtonStyle(sliderTarget === "start", !!start)}>출발지</button>
              <button onClick={() => setSliderTarget("waypoint")} disabled={!waypointList.length} style={tabButtonStyle(sliderTarget === "waypoint", !!waypointList.length)}>경유지</button>
              <button onClick={() => setSliderTarget("bottleneck")} disabled={!bottleneckCrossroads.length} style={tabButtonStyle(sliderTarget === "bottleneck", !!bottleneckCrossroads.length)}>병목지</button>
              <button onClick={() => setSliderTarget("end")} disabled={!end} style={tabButtonStyle(sliderTarget === "end", !!end)}>목적지</button>
            </div>
          </div>

          {sliderTarget === "waypoint" && waypointList.length > 1 && (
            <WaypointSlideControl waypoints={waypointList} currentIndex={clampedWaypointIndex} onChange={setSelectedWaypointIndex} label="경유지" />
          )}

          {sliderTarget === "bottleneck" && bottleneckCrossroads.length > 1 && (
            <WaypointSlideControl waypoints={bottleneckCrossroads} currentIndex={clampedBottleneckIndex} onChange={setSelectedBottleneckIndex} label="병목지" />
          )}

          {hasActiveSignalCrossroad && (
            <div style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
                <div style={{ fontWeight: 800, color: "#ffffff", fontSize: 13 }}>
                  {activeSignal.icon} {sliderTarget === "waypoint" ? `경유지 ${clampedWaypointIndex + 1} 신호체계` : activeSignal.signalTitle}
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{activeSignal.crossroad.intNm}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8, color: "#94a3b8", fontSize: 11 }}>
                <span>🟢 현재 켜진 현시</span>
                <span>🚗 차량 추종 예정 현시</span>
              </div>
              <VehicleSignalPanel
                key={`signal-${activeSignalKey}`}
                intNo={activeSignal.crossroad.intNo} intNm={activeSignal.crossroad.intNm}
                onPhaseChange={activeSignal.onPhaseChange} phaseOverride={activeSignalPhaseOverride}
                onContextChange={activeSignal.onContextChange}
                currentVehicleSignal={getVehicleSignalForCrossroad(activeSignal.crossroad)}
              />
            </div>
          )}

          {hasActiveSignalCrossroad && (
            <div style={cardStyle}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{ fontWeight: 800, color: "#ffffff", fontSize: 13 }}>
                  {activeSignal.icon} {sliderTarget === "waypoint" ? `경유지 ${clampedWaypointIndex + 1} 신호 조정` : panelTitle}
                </div>
                <div style={{ fontSize: 11, color: "#64748b" }}>{sliderCrossroad.intNm}</div>
              </div>
              <SimSliderPanel
                key={`slider-${activeSignalKey}`}
                intNo={sliderCrossroad.intNo} intNm={sliderCrossroad.intNm}
                onSave={handleManualSave}
                onAutoApplied={handleAutoApplied}
                aiSuggestedValues={aiSuggestedValues}
                aiAdjustKey={aiAdjustKey}
                initialPhases={activeContext?.phases ?? null}
                initialCycleVal={activeContext?.cycleVal ?? null}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
