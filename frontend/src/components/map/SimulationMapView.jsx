import { useState, useEffect, useRef } from "react";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8080").replace(/\/+$/, "");
const VWORLD_KEY = import.meta.env.VITE_VWORLD_API_KEY || "";
const CAR_MODEL_URI = "/models/car.glb";
const CAR_MODEL_SCALE = 0.06;
const CAR_MODEL_HEADING_OFFSET_DEG = -90; // 차량 모델 방향이 맞지 않으면 90, -90, 180 중 하나로 조정

function getVWorldApiKey() {
  const raw = String(VWORLD_KEY || "").trim();
  if (!raw) return "";

  if (raw.startsWith("http")) {
    try {
      return new URL(raw).searchParams.get("apiKey") || raw;
    } catch {
      return raw;
    }
  }

  return raw;
}

function getVWorldScriptUrl() {
  const raw = String(VWORLD_KEY || "").trim();
  if (raw.startsWith("http")) return raw;
  return `https://map.vworld.kr/js/webglMapInit.js.do?version=3.0&apiKey=${encodeURIComponent(raw)}`;
}

function toCoord(val) {
  const n = parseInt(val, 10);
  if (!n || isNaN(n)) return null;
  return n / 1e7;
}

function getCrLonLat(cr) {
  const lon = cr?.lon ?? toCoord(cr?.xCoord);
  const lat = cr?.lat ?? toCoord(cr?.yCoord);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return { lon, lat };
}

function distanceMeters(a, b) {
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function metersToDegrees(meters, lat) {
  const latDeg = meters / 111320;
  const lonDeg = meters / (111320 * Math.cos(lat * Math.PI / 180) || 1);
  return { lon: lonDeg, lat: latDeg };
}

function offsetPointByMeters(point, bearingDeg, meters) {
  const rad = bearingDeg * Math.PI / 180;
  const dLat = (Math.cos(rad) * meters) / 111320;
  const dLon = (Math.sin(rad) * meters) / (111320 * Math.cos(point.lat * Math.PI / 180) || 1);
  return {
    lon: point.lon + dLon,
    lat: point.lat + dLat,
  };
}

function lonLatToLocalMeters(point, originLat) {
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos(originLat * Math.PI / 180);
  return { x: point.lon * metersPerDegLon, y: point.lat * metersPerDegLat };
}

function perpendicularDistanceToSegmentMeters(point, start, end) {
  const originLat = (start.lat + end.lat) / 2;
  const p = lonLatToLocalMeters(point, originLat);
  const a = lonLatToLocalMeters(start, originLat);
  const b = lonLatToLocalMeters(end, originLat);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const qx = a.x + dx * t;
  const qy = a.y + dy * t;
  return { distance: Math.hypot(p.x - qx, p.y - qy), progress: t };
}

function routeBearingDeg(a, b) {
  const originLat = (a.lat + b.lat) / 2;
  const am = lonLatToLocalMeters(a, originLat);
  const bm = lonLatToLocalMeters(b, originLat);
  return (Math.atan2(bm.x - am.x, bm.y - am.y) * 180 / Math.PI + 360) % 360;
}

function angleDiffDeg(a, b) {
  const diff = Math.abs(((a - b + 540) % 360) - 180);
  return Math.min(diff, 360 - diff);
}

// 현재 progress 기준 차량 진행 방향 계산
function getCarBearingDeg(points, progress) {
  const totalLen = routeLengthMeters(points);
  if (!totalLen || points.length < 2) return null;

  let walked = 0;
  const target = progress * totalLen;

  for (let i = 0; i < points.length - 1; i++) {
    const segLen = distanceMeters(points[i], points[i + 1]);
    if (walked + segLen >= target) {
      return routeBearingDeg(points[i], points[i + 1]);
    }
    walked += segLen;
  }

  return routeBearingDeg(points[points.length - 2], points[points.length - 1]);
}

// 신호 판단: 현재 시각 기준으로 차량 진행 방향이 초록불인지 반환
function calcIsGreen(signalCtx, nowMs, carBearingDeg = null) {
  if (!signalCtx?.phases?.length) return true;

  const phases = signalCtx.phases;
  const cycleVal = signalCtx.cycleVal || phases.reduce((sum, phase) => sum + Number(phase.sec || 0), 0) || 120;
  const planStartSec = signalCtx.planStartSec ?? 0;
  const nowSec = Math.floor(nowMs / 1000) % 86400;
  const elapsed = ((nowSec - planStartSec) % cycleVal + cycleVal) % cycleVal;

  let acc = 0;
  let currentPhaseNo = phases[0].no;

  for (const phase of phases) {
    acc += Number(phase.sec || 0);
    if (elapsed < acc) {
      currentPhaseNo = phase.no;
      break;
    }
  }

  const currentPhase = phases.find(phase => phase.no === currentPhaseNo);
  if (!currentPhase) return true;

  const dirs = currentPhase.dirs || [];

  if (dirs.every(dir => dir === "전적색")) return false;
  if (dirs.includes("보행")) return false;

  // 방향 정보를 판단할 수 없으면 차량 통행 현시가 하나라도 있으면 초록으로 처리
  if (carBearingDeg === null) {
    return dirs.some(dir => dir !== "전적색" && dir !== "보행");
  }

  return dirs.some(dir => isDirMatchingBearing(dir, carBearingDeg));
}

// "동↔서 직진", "남→북 좌회전" 같은 문자열과 차량 진행 방향을 비교
function isDirMatchingBearing(dir, carBearingDeg) {
  if (!dir || dir === "전적색" || dir === "보행" || dir === "미확인") return false;

  const compassToDeg = {
    "북": 0,
    "북동": 45,
    "동": 90,
    "남동": 135,
    "남": 180,
    "남서": 225,
    "서": 270,
    "북서": 315,
  };

  const fromMatch = dir.match(/^([가-힣]+)[↔→]/);
  if (!fromMatch) return false;

  const fromDir = fromMatch[1];
  const fromDeg = compassToDeg[fromDir];

  if (fromDeg === undefined) return false;

  if (dir.includes("↔")) {
    const toMatch = dir.match(/↔([가-힣]+)/);
    if (toMatch) {
      const toDeg = compassToDeg[toMatch[1]];
      if (toDeg !== undefined && angleDiffDeg(carBearingDeg, toDeg) < 45) return true;
    }
  }

  return angleDiffDeg(carBearingDeg, fromDeg) < 45;
}

async function buildRouteViaNearbyCrossroads(startCr, endCr, crossroads) {
  const start = getCrLonLat(startCr);
  const end = getCrLonLat(endCr);
  if (!start || !end) return { points: [], viaCrossroads: [] };

  const totalDist = distanceMeters(start, end);
  if (!crossroads?.length || totalDist < 80) {
    return { points: [], viaCrossroads: [] };
  }

  const markerRoute = buildMarkerGraphRoute(startCr, endCr, crossroads, totalDist);

  console.log("markerRoute result", {
    points: markerRoute.points.length,
    via: markerRoute.viaCrossroads.length,
    names: markerRoute.viaCrossroads.map(cr => cr.intNm),
  });

  if (markerRoute.points.length >= 2 && markerRoute.viaCrossroads.length > 0) {
    return markerRoute;
  }

  return { points: [], viaCrossroads: [] };
}

function buildMarkerGraphRoute(startCr, endCr, crossroads, totalDist) {
  const start = getCrLonLat(startCr);
  const end = getCrLonLat(endCr);
  if (!start || !end) return { points: [], viaCrossroads: [] };

  const edgeLimits = [220, 320, 450, 600];

  for (const maxEdgeMeters of edgeLimits) {
    const route = tryBuildMarkerGraphRoute(startCr, endCr, crossroads, totalDist, maxEdgeMeters);
    if (route.points.length >= 2 && route.viaCrossroads.length > 0) return route;
  }

  return { points: [], viaCrossroads: [] };
}

function tryBuildMarkerGraphRoute(startCr, endCr, crossroads, totalDist, maxEdgeMeters) {
  const start = getCrLonLat(startCr);
  const end = getCrLonLat(endCr);
  if (!start || !end) return { points: [], viaCrossroads: [] };

  const maxNodeCount = 1200;
  const neighborLimit = 24;
  const detourLimit = Math.max(totalDist * 8, totalDist + 3500);
  const bboxPad = metersToDegrees(Math.max(800, totalDist * 0.95), (start.lat + end.lat) / 2);

  const minLon = Math.min(start.lon, end.lon) - bboxPad.lon;
  const maxLon = Math.max(start.lon, end.lon) + bboxPad.lon;
  const minLat = Math.min(start.lat, end.lat) - bboxPad.lat;
  const maxLat = Math.max(start.lat, end.lat) + bboxPad.lat;

  const startNode = {
    key: `start-${startCr.intNo}`,
    cr: startCr,
    ll: start,
    kind: "start",
    projected: { distance: 0, progress: 0 },
    detour: totalDist,
  };

  const endNode = {
    key: `end-${endCr.intNo}`,
    cr: endCr,
    ll: end,
    kind: "end",
    projected: { distance: 0, progress: 1 },
    detour: totalDist,
  };

  const middleNodes = crossroads
    .filter(cr => cr.intNo !== startCr?.intNo && cr.intNo !== endCr?.intNo)
    .map(cr => {
      const ll = getCrLonLat(cr);
      if (!ll) return null;
      if (ll.lon < minLon || ll.lon > maxLon || ll.lat < minLat || ll.lat > maxLat) return null;

      const fromStart = distanceMeters(start, ll);
      const toEnd = distanceMeters(ll, end);
      const detour = fromStart + toEnd;
      if (detour > detourLimit) return null;

      const projected = perpendicularDistanceToSegmentMeters(ll, start, end);
      const score =
        Math.max(0, detour - totalDist) * 0.18 +
        projected.distance * 0.28 +
        Math.abs(projected.progress - 0.5) * 4;

      return {
        key: `cr-${cr.intNo}`,
        cr,
        ll,
        kind: "via",
        fromStart,
        toEnd,
        detour,
        projected,
        score,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score)
    .slice(0, maxNodeCount);

  const nodes = [startNode, ...middleNodes, endNode];
  const endIndex = nodes.length - 1;
  const edges = Array.from({ length: nodes.length }, () => []);

  for (let i = 0; i < nodes.length; i++) {
    const current = nodes[i];
    const candidates = [];

    for (let j = 0; j < nodes.length; j++) {
      if (i === j) continue;
      if (j === 0) continue;

      const next = nodes[j];
      const d = distanceMeters(current.ll, next.ll);
      if (d > maxEdgeMeters) continue;

      if (i === 0 && j === endIndex && middleNodes.length > 0 && totalDist > maxEdgeMeters * 0.9) {
        continue;
      }

      if (j === endIndex && i !== 0 && d > maxEdgeMeters * 0.9) {
        continue;
      }

      const currentToEnd = distanceMeters(current.ll, end);
      const nextToEnd = distanceMeters(next.ll, end);

      if (j !== endIndex && i !== 0 && nextToEnd > currentToEnd + maxEdgeMeters * 2.8) {
        continue;
      }

      const bearingPenalty = (() => {
        if (i === 0 || j === endIndex) return 0;
        const currentBearing = routeBearingDeg(current.ll, end);
        const edgeBearing = routeBearingDeg(current.ll, next.ll);
        return angleDiffDeg(currentBearing, edgeBearing) * 0.2;
      })();

      const longEdgePenalty = Math.max(0, d - 90) * 7;
      const detourPenalty = Math.max(0, (next.detour ?? totalDist) - totalDist) * 0.04;
      const offLinePenalty = (next.projected?.distance ?? 0) * 0.01;
      const backtrackPenalty =
        current.projected && next.projected
          ? Math.max(0, current.projected.progress - next.projected.progress) * 80
          : 0;

      candidates.push({
        to: j,
        weight: d + longEdgePenalty + detourPenalty + offLinePenalty + backtrackPenalty + bearingPenalty,
      });
    }

    candidates.sort((a, b) => a.weight - b.weight);
    edges[i] = candidates.slice(0, neighborLimit);
  }

  const dist = Array(nodes.length).fill(Infinity);
  const prev = Array(nodes.length).fill(-1);
  const visited = Array(nodes.length).fill(false);
  dist[0] = 0;

  for (let step = 0; step < nodes.length; step++) {
    let u = -1;
    let best = Infinity;

    for (let i = 0; i < nodes.length; i++) {
      if (!visited[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }

    if (u === -1 || u === endIndex) break;
    visited[u] = true;

    for (const edge of edges[u]) {
      const alt = dist[u] + edge.weight;
      if (alt < dist[edge.to]) {
        dist[edge.to] = alt;
        prev[edge.to] = u;
      }
    }
  }

  if (!Number.isFinite(dist[endIndex]) || prev[endIndex] === -1) {
    return { points: [], viaCrossroads: [] };
  }

  const pathIndexes = [];
  let cur = endIndex;
  while (cur !== -1) {
    pathIndexes.push(cur);
    cur = prev[cur];
  }
  pathIndexes.reverse();

  if (pathIndexes.length <= 2) return { points: [], viaCrossroads: [] };

  const pathNodes = pathIndexes.map(idx => nodes[idx]);
  const points = pathNodes.map(node => node.ll);
  const routeTotal = routeLengthMeters(points) || totalDist;

  let acc = 0;
  const viaCrossroads = [];

  for (let i = 1; i < pathNodes.length - 1; i++) {
    acc += distanceMeters(points[i - 1], points[i]);
    viaCrossroads.push({
      ...pathNodes[i].cr,
      routeProgress: acc / routeTotal,
      routeDistanceMeters: Math.round(distanceMeters(points[i - 1], points[i])),
    });
  }

  return { points, viaCrossroads };
}

function interpolateRoute(points, progress) {
  if (!points?.length) return null;
  if (points.length === 1) return points[0];

  const segments = [];
  let total = 0;

  for (let i = 0; i < points.length - 1; i++) {
    const len = distanceMeters(points[i], points[i + 1]);
    segments.push({ from: points[i], to: points[i + 1], len });
    total += len;
  }

  if (total <= 0) return points[0];

  let target = Math.max(0, Math.min(1, progress)) * total;

  for (const seg of segments) {
    if (target <= seg.len) {
      const t = seg.len === 0 ? 0 : target / seg.len;
      return {
        lon: seg.from.lon + (seg.to.lon - seg.from.lon) * t,
        lat: seg.from.lat + (seg.to.lat - seg.from.lat) * t,
      };
    }
    target -= seg.len;
  }

  return points[points.length - 1];
}

function extractRouteSegment(points, startProgress, endProgress) {
  if (!points?.length) return [];

  const totalLen = routeLengthMeters(points);
  if (!totalLen) return [];

  const startDist = startProgress * totalLen;
  const endDist = endProgress * totalLen;

  const result = [];
  let acc = 0;

  const startPoint = interpolateRoute(points, startProgress);
  const endPoint = interpolateRoute(points, endProgress);

  if (startPoint) result.push(startPoint);

  for (let i = 1; i < points.length - 1; i++) {
    acc += distanceMeters(points[i - 1], points[i]);
    if (acc > startDist && acc < endDist) {
      result.push(points[i]);
    }
  }

  if (endPoint) result.push(endPoint);

  return result;
}

function routeLengthMeters(points) {
  if (!points || points.length < 2) return 0;

  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    total += distanceMeters(points[i], points[i + 1]);
  }

  return total;
}

function estimateTrip(routePoints, isOptimized) {
  const distance = routeLengthMeters(routePoints);
  if (!distance) return null;

  const normalSpeedKph = 28;
  const bottleneckSpeedKph = isOptimized ? 24 : 10;
  const normalRatio = 0.72;
  const bottleneckRatio = 0.28;

  const normalSec = (distance * normalRatio) / (normalSpeedKph / 3.6);
  const bottleneckSec = (distance * bottleneckRatio) / (bottleneckSpeedKph / 3.6);
  const waitSec = isOptimized ? 20 : 75;
  const totalSec = Math.round(normalSec + bottleneckSec + waitSec);

  return {
    distance,
    totalSec,
    avgSpeedKph: Math.round((distance / Math.max(totalSec, 1)) * 3.6),
  };
}

export default function SimulationMapView({
  selectedList = [],
  onSelect,
  isOptimized = false,
  onStatsChange,
  onAutoWaypointsChange,
  onCurrentSignalChange,
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const vworldMapRef = useRef(null);
  const markerEntitiesRef = useRef({});
  const overlayEntitiesRef = useRef([]);
  const roadOverlayPrimitivesRef = useRef([]);
  const carEntityRef = useRef(null);
  const signalIndicatorRef = useRef(null);
  const animationRef = useRef(null);
  const progressRef = useRef(0);
  const lastTickRef = useRef(null);

  // 신호 기반 정지/출발용 refs
  const signalCacheRef = useRef({});
  const stoppedAtRef = useRef(null);
  const stopProgressRef = useRef(null);
  const currentSignalStatusRef = useRef(null);
  const routePointsRef = useRef([]);
  const viaCrossroadsRef = useRef([]);
  const startRef = useRef(null);
  const endRef = useRef(null);

  const [crossroads, setCrossroads] = useState([]);
  const [cesiumReady, setCesiumReady] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [driveView, setDriveView] = useState(false);
  const [status, setStatus] = useState("VWorld 3D 지도 로딩 중...");
  const [routePlan, setRoutePlan] = useState({ points: [], viaCrossroads: [] });

  const start = selectedList[0] ?? null;
  const end = selectedList.length >= 2 ? selectedList[selectedList.length - 1] : null;
  const startLL = getCrLonLat(start);
  const endLL = getCrLonLat(end);
  const routePoints = routePlan.points;
  const viaCrossroads = routePlan.viaCrossroads;

  useEffect(() => {
    if (selectedList.length < 2) {
      setRoutePlan({ points: [], viaCrossroads: [] });
      return;
    }

    // setRoutePlan(buildRouteFromSelectedList(selectedList));
    setRoutePlan(buildRouteFromSelectedList(selectedList, crossroads));
  // }, [selectedList]);
  // }, [selectedList, crossroads]);
  }, [
    selectedList.map(item => item.intNo).join("|"),
    crossroads.length,
  ]);


  useEffect(() => {
    onAutoWaypointsChange?.(viaCrossroads);
  }, [start?.intNo, end?.intNo, viaCrossroads.map(cr => cr.intNo).join("|"), onAutoWaypointsChange]);

  useEffect(() => {
    routePointsRef.current = routePoints;
    viaCrossroadsRef.current = viaCrossroads;
    startRef.current = start;
    endRef.current = end;
  }, [
    routePoints,
    viaCrossroads,
    start?.intNo,
    end?.intNo,
  ]);

  useEffect(() => {
    // VWorld WebGL 3D API(webglMapInit.js.do)는 내부에서 document.write를 사용합니다.
    // React 컴포넌트가 마운트된 뒤 동적으로 script를 넣으면 Chrome에서
    // "Failed to execute document.write" 오류가 나면서 지도가 로딩되지 않습니다.
    // 그래서 이 컴포넌트에서는 동적 로딩하지 않고, index.html에서 먼저 로드된
    // window.vw/window.Cesium 객체만 기다립니다.
    const apiKey = getVWorldApiKey();
    if (!apiKey) {
      setStatus("VWorld API 키가 없습니다. .env의 VITE_VWORLD_API_KEY를 확인하세요.");
      return;
    }

    let alive = true;
    let count = 0;
    const maxCount = 80;

    const waitForVWorld = () => {
      if (!alive) return;

      if (window.vw && window.Cesium) {
        setCesiumReady(true);
        return;
      }

      count += 1;
      if (count >= maxCount) {
        setStatus("VWorld WebGL 3D API가 아직 로드되지 않았습니다. index.html에 webglMapInit.js.do script를 추가하세요.");
        return;
      }

      setTimeout(waitForVWorld, 150);
    };

    waitForVWorld();

    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    fetch(`${API_BASE}/api/signal/crossroads`)
      .then(r => r.json())
      .then(data => {
        const valid = data.filter(c => toCoord(c.xCoord) && toCoord(c.yCoord));
        setCrossroads(valid);
      })
      .catch(() => setStatus("교차로 데이터 로드 실패"));
  }, []);

  useEffect(() => {
    if (!cesiumReady || !containerRef.current || viewerRef.current) return;
    if (!window.vw) return;

    const Cesium = window.Cesium;
    const vw = window.vw;

    const center = startLL || { lon: 127.0396, lat: 37.5126 };
    const previousCallback = vw.ws3dInitCallBack;

    const completeInit = () => {
      const viewer = window.ws3d?.viewer;
      if (!viewer) {
        setStatus("VWorld 3D viewer 초기화 대기 중...");
        setTimeout(completeInit, 200);
        return;
      }

      viewer.scene.globe.enableLighting = false;
      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#0a0f1e");
      viewer.scene.screenSpaceCameraController.enableRotate = true;
      viewer.scene.screenSpaceCameraController.enableTilt = true;
      viewer.scene.screenSpaceCameraController.enableZoom = true;

      try {
        vworldMapRef.current?.getElementById?.("facility_build")?.show?.();
        vworldMapRef.current?.getElementById?.("poi_road")?.hide?.();
        vworldMapRef.current?.getElementById?.("poi_base")?.hide?.();
        vworldMapRef.current?.getElementById?.("poi_bound")?.hide?.();
      } catch (err) {
        console.warn("VWorld 기본 레이어 설정 실패", err);
      }

      viewer.camera.setView({
        destination: Cesium.Cartesian3.fromDegrees(center.lon, center.lat, 1200),
        orientation: {
          heading: Cesium.Math.toRadians(0),
          pitch: Cesium.Math.toRadians(-45),
          roll: 0,
        },
      });

      viewerRef.current = viewer;
      setMapReady(true);
      setStatus(null);
    };

    try {
      const options = {
        mapId: containerRef.current.id,
        initPosition: new vw.CameraPosition(
          new vw.CoordZ(center.lon, center.lat, 1200),
          new vw.Direction(0, -45, 0)
        ),
        logo: true,
        navigation: true,
      };

      vw.ws3dInitCallBack = () => {
        previousCallback?.();
        completeInit();
      };

      const map = new vw.Map();
      map.setOption(options);
      map.start();
      vworldMapRef.current = map;

      setTimeout(completeInit, 600);
    } catch (err) {
      console.error(err);
      setStatus(`VWorld 3D 지도 초기화 실패: ${err.message}`);
    }

    return () => {
      stopAnimation();
      clearOverlays();
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed?.()) {
        Object.values(markerEntitiesRef.current).forEach(e => viewer.entities.remove(e));
      }
      markerEntitiesRef.current = {};
      viewerRef.current = null;
      vworldMapRef.current = null;
      setMapReady(false);
      vw.ws3dInitCallBack = previousCallback;
    };
  }, [cesiumReady]);

  useEffect(() => {
    if (!mapReady || !viewerRef.current || crossroads.length === 0) return;

    const Cesium = window.Cesium;
    const viewer = viewerRef.current;

    Object.values(markerEntitiesRef.current).forEach(e => viewer.entities.remove(e));
    markerEntitiesRef.current = {};

    crossroads.forEach(cr => {
      const lon = toCoord(cr.xCoord);
      const lat = toCoord(cr.yCoord);
      if (!lon || !lat) return;

      const isStart = start?.intNo === cr.intNo;
      const isEnd = end?.intNo === cr.intNo;
      const viaIndex = viaCrossroads.findIndex(item => item.intNo === cr.intNo);
      const isVia = viaIndex >= 0;

      // 주행뷰에서는 전체 파란 교차로 노드가 화면을 가리므로
      // 선택된 출발지/도착지/경유지만 표시합니다.
      if (driveView && !isStart && !isEnd && !isVia) return;

      const color = isStart ? "#22c55e" : isEnd ? "#ef4444" : isVia ? "#f59e0b" : "rgba(96,165,250,0.55)";
      const size = isStart || isEnd ? 18 : isVia ? 13 : 9;
      const markerText = isStart ? "출" : isEnd ? "도" : isVia ? String(viaIndex + 1) : "";

      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 10),
        billboard: {
          image: createMarkerCanvas(color, size, markerText),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: (isStart || isEnd || isVia) ? {
          text: isVia ? `경유 ${viaIndex + 1} · ${cr.intNm}` : `${isStart ? "출발" : "도착"} · ${cr.intNm}`,
          font: "bold 12px Malgun Gothic",
          fillColor: Cesium.Color.fromCssColorString(isStart ? "#22c55e" : isEnd ? "#ef4444" : "#f59e0b"),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -32),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        } : undefined,
        properties: {
          intNo: cr.intNo,
          intNm: cr.intNm,
          xCoord: cr.xCoord,
          yCoord: cr.yCoord,
        },
      });

      markerEntitiesRef.current[cr.intNo] = entity;
    });

    if (!viewer._routeSimClickHandler) {
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      viewer._routeSimClickHandler = handler;
      handler.setInputAction(click => {
        const picked = viewer.scene.pick(click.position);

        if (picked?.id?.properties) {
          const intNo = picked.id.properties.intNo?.getValue();
          const intNm = picked.id.properties.intNm?.getValue();
          const xCoord = picked.id.properties.xCoord?.getValue();
          const yCoord = picked.id.properties.yCoord?.getValue();

          if (intNo) {
            onSelect?.({ intNo, intNm, xCoord, yCoord });
            return;
          }
        }

        const cartesian = viewer.scene.pickPosition?.(click.position)
          || viewer.camera.pickEllipsoid(click.position, viewer.scene.globe.ellipsoid);

        if (!cartesian) return;

        const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
        const lon = Cesium.Math.toDegrees(cartographic.longitude);
        const lat = Cesium.Math.toDegrees(cartographic.latitude);

        onSelect?.({
          intNo: `manual-${Date.now()}`,
          intNm: "수동 경유지",
          lon,
          lat,
          isManualWaypoint: true,
        });
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
    }
  }, [
    crossroads,
    start?.intNo,
    end?.intNo,
    viaCrossroads.map(cr => cr.intNo).join("|"),
    driveView,
    cesiumReady,
    mapReady,
    onSelect,
  ]);


  function buildRouteFromSelectedList(selectedList, crossroads) {
    if (!selectedList || selectedList.length < 2) {
      return { points: [], viaCrossroads: [] };
    }

    const finalPoints = [];
    const finalVia = [];
    const seenVia = new Set();

    for (let i = 0; i < selectedList.length - 1; i++) {
      const from = selectedList[i];
      const to = selectedList[i + 1];

      const fromLL = getCrLonLat(from);
      const toLL = getCrLonLat(to);
      if (!fromLL || !toLL) continue;

      const totalDist = distanceMeters(fromLL, toLL);
      const segmentRoute = buildMarkerGraphRoute(from, to, crossroads, totalDist);

      const segmentPoints = segmentRoute.points.length >= 2
        ? segmentRoute.points
        : [fromLL, toLL];

      if (finalPoints.length === 0) {
        finalPoints.push(segmentPoints[0]);
      }

      finalPoints.push(...segmentPoints.slice(1));

      const segmentVia = [
        from,
        ...segmentRoute.viaCrossroads,
        to,
      ];

      segmentVia.forEach((cr, idx) => {
        const isFirstWholeStart = i === 0 && idx === 0;
        const isLastWholeEnd = i === selectedList.length - 2 && idx === segmentVia.length - 1;

        if (isFirstWholeStart || isLastWholeEnd) return;

        const key = String(cr.intNo);
        if (seenVia.has(key)) return;
        seenVia.add(key);

        finalVia.push({
          ...cr,
          routeDistanceMeters: cr.routeDistanceMeters ?? 0,
        });
      });
    }

    const routeTotal = routeLengthMeters(finalPoints);

    let acc = 0;
    const viaCrossroads = finalVia.map(cr => {
      const ll = getCrLonLat(cr);
      if (!ll || !routeTotal) {
        return { ...cr, routeProgress: 0 };
      }

      let bestProgress = 0;
      let bestDistance = Infinity;
      let walked = 0;

      for (let i = 0; i < finalPoints.length - 1; i++) {
        const seg = perpendicularDistanceToSegmentMeters(ll, finalPoints[i], finalPoints[i + 1]);
        const segLen = distanceMeters(finalPoints[i], finalPoints[i + 1]);

        if (seg.distance < bestDistance) {
          bestDistance = seg.distance;
          bestProgress = (walked + seg.progress * segLen) / routeTotal;
        }

        walked += segLen;
      }

      return {
        ...cr,
        routeProgress: bestProgress,
        routeDistanceMeters: Math.round(bestDistance),
      };
    }).sort((a, b) => a.routeProgress - b.routeProgress);

    return {
      points: finalPoints,
      viaCrossroads,
    };
  }


  useEffect(() => {
    if (!mapReady || !viewerRef.current || !window.Cesium) return;

    clearOverlays();
    stopAnimation();

    if (!startLL) {
      onStatsChange?.(null);
      return;
    }

    flyToSelectedArea();

    if (!endLL || routePoints.length < 2) {
      onStatsChange?.(null);
      return;
    }

    routePointsRef.current = routePoints;
    viaCrossroadsRef.current = viaCrossroads;
    startRef.current = start;
    endRef.current = end;

    renderRouteSimulation();
    prefetchSignals(viaCrossroads, start, end);
    startCarAnimation();

    const before = estimateTrip(routePoints, false);
    const after = estimateTrip(routePoints, true);

    if (!before || !after) {
      onStatsChange?.(null);
      return;
    }

    onStatsChange?.({
      distanceMeters: Math.round(before.distance),
      beforeSec: before.totalSec,
      afterSec: after.totalSec,
      savedSec: Math.max(0, before.totalSec - after.totalSec),
      beforeSpeedKph: before.avgSpeedKph,
      afterSpeedKph: after.avgSpeedKph,
      bottleneckCount: 1,
      viaCount: viaCrossroads.length,
    });
  }, [selectedList, isOptimized, cesiumReady, mapReady, routePlan, driveView]);


  useEffect(() => {
    if (!mapReady || !viewerRef.current || !window.Cesium || !routePoints.length) return;
    if (driveView) {
      const p = interpolateRoute(routePoints, progressRef.current || 0.02);
      const next = interpolateRoute(routePoints, Math.min((progressRef.current || 0.02) + 0.012, 1));
      if (p && next) {
        const Cesium = window.Cesium;
        const headingDeg = routeBearingDeg(p, next);
        const cameraPos = offsetPointByMeters(p, headingDeg + 180, 52);

        viewerRef.current.camera.flyTo({
          destination: Cesium.Cartesian3.fromDegrees(cameraPos.lon, cameraPos.lat, 44),
          orientation: {
            heading: Cesium.Math.toRadians(headingDeg),
            pitch: Cesium.Math.toRadians(-13),
            roll: 0,
          },
          duration: 0.6,
        });
      }
    } else {
      flyToSelectedArea();
    }
  }, [driveView, mapReady]);


  function prefetchSignals(viaList, startCr, endCr) {
    const targets = [
      startCr,
      ...viaList,
      endCr,
    ].filter(Boolean);

    targets.forEach(cr => fetchSignalCtx(cr.intNo));
  }

  async function fetchSignalCtx(intNo) {
    if (!intNo) return null;

    const cached = signalCacheRef.current[intNo];
    if (cached && Date.now() - cached.fetchedAt < 30000) {
      return cached.ctx;
    }

    try {
      const res = await fetch(`${API_BASE}/api/signal/simulation/context/${intNo}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      signalCacheRef.current[intNo] = {
        ctx: data,
        fetchedAt: Date.now(),
      };
      return data;
    } catch (err) {
      console.warn("신호 데이터 로드 실패", intNo, err);
      return null;
    }
  }

  function getRouteNodeType(node) {
    if (!node) return "unknown";
    if (startRef.current?.intNo === node.intNo) return "start";
    if (endRef.current?.intNo === node.intNo) return "end";

    const viaIndex = viaCrossroadsRef.current.findIndex(item => item.intNo === node.intNo);
    if (viaIndex >= 0) {
      const bottleneckIndex = viaCrossroadsRef.current.reduce((bestIdx, item, idx, arr) => {
        const best = arr[bestIdx];
        return Math.abs((item.routeProgress ?? 0.5) - 0.54) < Math.abs((best.routeProgress ?? 0.5) - 0.54)
          ? idx
          : bestIdx;
      }, 0);

      return viaIndex === bottleneckIndex ? "bottleneck" : "waypoint";
    }

    return "unknown";
  }

  function emitCurrentSignalStatus(nextNode, isRedLight, cachedCtx = null, carBearing = null) {
    if (!onCurrentSignalChange) return;

    if (!nextNode) {
      const emptyKey = "none";
      if (currentSignalStatusRef.current !== emptyKey) {
        currentSignalStatusRef.current = emptyKey;
        onCurrentSignalChange(null);
      }
      return;
    }

    const status = {
      intNo: nextNode.intNo,
      intNm: nextNode.intNm,
      type: nextNode.type,
      metersAhead: Math.max(0, Math.round(nextNode.metersAhead ?? 0)),
      isRed: !!isRedLight,
      isGreen: !isRedLight,
      stateText: isRedLight ? "빨간불 정지/감속" : "초록불 통과",
      phaseNo: cachedCtx?.ctx?.phases?.find?.(() => false)?.no ?? null,
      carBearingDeg: carBearing == null ? null : Math.round(carBearing),
      updatedAt: Date.now(),
    };

    const key = [
      status.intNo,
      status.type,
      status.isRed ? "red" : "green",
      status.metersAhead,
      status.carBearingDeg ?? "",
    ].join("|");

    if (currentSignalStatusRef.current !== key) {
      currentSignalStatusRef.current = key;
      onCurrentSignalChange(status);
    }
  }

  function getNodeRouteProgress(node) {
    const ll = getCrLonLat(node);
    const points = routePointsRef.current;

    if (!ll || points.length < 2) return null;

    const totalLen = routeLengthMeters(points);
    if (!totalLen) return null;

    let bestProgress = null;
    let bestDistance = Infinity;
    let walked = 0;

    for (let i = 0; i < points.length - 1; i++) {
      const seg = perpendicularDistanceToSegmentMeters(ll, points[i], points[i + 1]);
      const segLen = distanceMeters(points[i], points[i + 1]);

      if (seg.distance < bestDistance) {
        bestDistance = seg.distance;
        bestProgress = (walked + seg.progress * segLen) / totalLen;
      }

      walked += segLen;
    }

    if (bestProgress === null) return null;

    return {
      progress: bestProgress,
      distanceToRoute: bestDistance,
    };
  }

  function findNextSignalNode(currentProgress) {
    const points = routePointsRef.current;
    const totalLen = routeLengthMeters(points);

    if (!totalLen) return null;

    const allNodes = [
      ...viaCrossroadsRef.current,
      endRef.current,
    ].filter(Boolean);

    let nearest = null;

    for (const node of allNodes) {
      const routeInfo = getNodeRouteProgress(node);
      if (!routeInfo) continue;

      const progressDiff = routeInfo.progress - currentProgress;
      const metersAhead = progressDiff * totalLen;

      // 차량 앞쪽 20~90m 범위의 교차로 신호를 확인합니다.
      if (metersAhead > 0 && metersAhead < 90) {
        if (!nearest || metersAhead < nearest.metersAhead) {
          nearest = {
            intNo: node.intNo,
            intNm: node.intNm,
            type: getRouteNodeType(node),
            node,
            progress: routeInfo.progress,
            metersAhead,
          };
        }
      }
    }

    return nearest;
  }

  function clearOverlays() {
    const viewer = viewerRef.current;
    if (!viewer) return;

    overlayEntitiesRef.current.forEach(entity => viewer.entities.remove(entity));
    overlayEntitiesRef.current = [];

    roadOverlayPrimitivesRef.current.forEach(p => {
      try { viewer.scene.groundPrimitives.remove(p); } catch (_) {}
    });
    roadOverlayPrimitivesRef.current = [];

    if (carEntityRef.current) {
      viewer.entities.remove(carEntityRef.current);
      carEntityRef.current = null;
    }

    if (signalIndicatorRef.current) {
      viewer.entities.remove(signalIndicatorRef.current);
      signalIndicatorRef.current = null;
    }
  }

  function stopAnimation() {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    lastTickRef.current = null;
    progressRef.current = 0;
  }

  function flyToSelectedArea() {
    if (!viewerRef.current || !window.Cesium || !startLL || driveView) return;

    const Cesium = window.Cesium;

    if (endLL && routePoints.length >= 2) {
      const mid = interpolateRoute(routePoints, 0.5);
      if (!mid) return;

      const dist = routeLengthMeters(routePoints);

      viewerRef.current.camera.flyToBoundingSphere(
        new Cesium.BoundingSphere(
          Cesium.Cartesian3.fromDegrees(mid.lon, mid.lat, 0),
          Math.max(120, dist * 0.45)
        ),
        {
          offset: new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(0),
            Cesium.Math.toRadians(-42),
            Math.max(900, Math.min(2600, dist * 1.5))
          ),
          duration: 1.1,
        }
      );
      return;
    }

    viewerRef.current.camera.flyToBoundingSphere(
      new Cesium.BoundingSphere(
        Cesium.Cartesian3.fromDegrees(startLL.lon, startLL.lat, 0),
        80
      ),
      {
        offset: new Cesium.HeadingPitchRange(
          Cesium.Math.toRadians(0),
          Cesium.Math.toRadians(-40),
          650
        ),
        duration: 1.0,
      }
    );
  }

  // 경로 포인트 배열로 도로 폭만큼 좌우로 오프셋한 폴리곤 좌표를 생성합니다.
  function buildRoadPolygonCoords(points, halfWidthMeters) {
    if (points.length < 2) return null;
    const left = [];
    const right = [];

    for (let i = 0; i < points.length; i++) {
      const prev = points[i - 1] ?? points[i];
      const next = points[i + 1] ?? points[i];
      const bearing = routeBearingDeg(prev, next);
      left.push(offsetPointByMeters(points[i], bearing - 90, halfWidthMeters));
      right.push(offsetPointByMeters(points[i], bearing + 90, halfWidthMeters));
    }

    // 외곽 링: 왼쪽 순방향 + 오른쪽 역방향으로 닫힌 폴리곤
    const ring = [...left, ...[...right].reverse(), left[0]];
    return ring.flatMap(p => [p.lon, p.lat]);
  }

  function renderRouteSimulation() {
    const Cesium = window.Cesium;
    const viewer = viewerRef.current;
    if (!viewer || routePoints.length < 2) return;

    // ── 도로 위 반투명 오버레이 ──────────────────────────────────────────
    // 위성지도의 실제 차량을 가리고 시뮬레이션 도로처럼 보이게 합니다.
    // 경로 전체를 도로 폭(약 16m)으로 덮는 반투명 다크 레이어를 깔고,
    // 그 위에 얇은 도로 중심선 텍스처를 올려 실제 도로처럼 보이게 합니다.

    const roadCoords = buildRoadPolygonCoords(routePoints, 14); // 왕복 2차선 폭 ≈ 28m
    if (roadCoords && roadCoords.length >= 6) {
      // 기본 아스팔트 레이어 (어두운 회색, 불투명도 약 70%)
      const asphaltPrimitive = new Cesium.GroundPrimitive({
        geometryInstances: new Cesium.GeometryInstance({
          geometry: new Cesium.PolygonGeometry({
            polygonHierarchy: new Cesium.PolygonHierarchy(
              Cesium.Cartesian3.fromDegreesArray(roadCoords)
            ),
            vertexFormat: Cesium.EllipsoidSurfaceAppearance.VERTEX_FORMAT,
          }),
          attributes: {
            color: Cesium.ColorGeometryInstanceAttribute.fromColor(
              Cesium.Color.fromCssColorString("#1c1c1e").withAlpha(0.72)
            ),
          },
        }),
        appearance: new Cesium.PerInstanceColorAppearance({
          flat: true,
          translucent: true,
        }),
        classificationType: Cesium.ClassificationType.TERRAIN,
      });
      viewer.scene.groundPrimitives.add(asphaltPrimitive);
      roadOverlayPrimitivesRef.current.push(asphaltPrimitive);

      // 도로 중앙 라인 레이어 (약간 밝은 회색, 경로 중심 강조)
      const centerCoords = buildRoadPolygonCoords(routePoints, 1.2);
      if (centerCoords && centerCoords.length >= 6) {
        const centerLinePrimitive = new Cesium.GroundPrimitive({
          geometryInstances: new Cesium.GeometryInstance({
            geometry: new Cesium.PolygonGeometry({
              polygonHierarchy: new Cesium.PolygonHierarchy(
                Cesium.Cartesian3.fromDegreesArray(centerCoords)
              ),
              vertexFormat: Cesium.EllipsoidSurfaceAppearance.VERTEX_FORMAT,
            }),
            attributes: {
              color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                Cesium.Color.fromCssColorString("#e2c94a").withAlpha(0.55)
              ),
            },
          }),
          appearance: new Cesium.PerInstanceColorAppearance({
            flat: true,
            translucent: true,
          }),
          classificationType: Cesium.ClassificationType.TERRAIN,
        });
        viewer.scene.groundPrimitives.add(centerLinePrimitive);
        roadOverlayPrimitivesRef.current.push(centerLinePrimitive);
      }

      // 도로 가장자리 라인 (왼쪽/오른쪽 경계선)
      const leftEdgeCoords = buildRoadPolygonCoords(routePoints, 14);
      const rightEdgeCoords = buildRoadPolygonCoords(routePoints, 14);
      [leftEdgeCoords, rightEdgeCoords].forEach((edgeCoords, side) => {
        if (!edgeCoords || edgeCoords.length < 6) return;
        const edgeHalf = side === 0 ? 13 : 14;
        const innerCoords = buildRoadPolygonCoords(routePoints, edgeHalf - 0.8);
        if (!innerCoords || innerCoords.length < 6) return;

        // 폴리곤 hole로 내부를 뚫어서 edge line만 남기기
        const edgePrimitive = new Cesium.GroundPrimitive({
          geometryInstances: new Cesium.GeometryInstance({
            geometry: new Cesium.PolygonGeometry({
              polygonHierarchy: new Cesium.PolygonHierarchy(
                Cesium.Cartesian3.fromDegreesArray(edgeCoords),
                [new Cesium.PolygonHierarchy(
                  Cesium.Cartesian3.fromDegreesArray(innerCoords)
                )]
              ),
              vertexFormat: Cesium.EllipsoidSurfaceAppearance.VERTEX_FORMAT,
            }),
            attributes: {
              color: Cesium.ColorGeometryInstanceAttribute.fromColor(
                Cesium.Color.fromCssColorString("#ffffff").withAlpha(0.28)
              ),
            },
          }),
          appearance: new Cesium.PerInstanceColorAppearance({
            flat: true,
            translucent: true,
          }),
          classificationType: Cesium.ClassificationType.TERRAIN,
        });
        viewer.scene.groundPrimitives.add(edgePrimitive);
        roadOverlayPrimitivesRef.current.push(edgePrimitive);
      });
    }
    // ────────────────────────────────────────────────────────────────────

    overlayEntitiesRef.current.push(viewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(routePoints.flatMap(p => [p.lon, p.lat])),
        width: 9,
        clampToGround: true,
        material: new Cesium.PolylineGlowMaterialProperty({
          glowPower: 0.18,
          taperPower: 0.7,
          color: Cesium.Color.fromCssColorString(isOptimized ? "#22c55e" : "#38bdf8").withAlpha(0.82),
        }),
        zIndex: 20,
      },
    }));

    const signalNodePoints = [
      startLL,
      ...viaCrossroads.map(getCrLonLat).filter(Boolean),
      endLL,
    ].filter(Boolean);

    if (signalNodePoints.length >= 2) {
      overlayEntitiesRef.current.push(viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(signalNodePoints.flatMap(p => [p.lon, p.lat])),
          width: 3,
          clampToGround: true,
          material: Cesium.Color.fromCssColorString("#fbbf24").withAlpha(0.55),
          zIndex: 35,
        },
      }));
    }

    // 경유지 마커는 위쪽 crossroads 마커 렌더링에서 이미 표시됩니다.
    // 여기에 별도 point 마커를 한 번 더 올리면 특정 경유지가 겹쳐져 크게 보일 수 있어 제거했습니다.

    const bottleneckSegment = extractRouteSegment(routePoints, 0.46, 0.62);

    if (bottleneckSegment.length >= 2) {
      overlayEntitiesRef.current.push(viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray(bottleneckSegment.flatMap(p => [p.lon, p.lat])),
          width: 14,
          clampToGround: true,
          material: new Cesium.PolylineGlowMaterialProperty({
            glowPower: 0.32,
            taperPower: 0.7,
            color: Cesium.Color.fromCssColorString(isOptimized ? "#22c55e" : "#ef4444").withAlpha(0.95),
          }),
          zIndex: 25,
        },
      }));
    }

    const bottleneckPoint = interpolateRoute(routePoints, 0.54);
    if (bottleneckPoint) {
      overlayEntitiesRef.current.push(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(bottleneckPoint.lon, bottleneckPoint.lat, 20),
        billboard: {
          image: createBottleneckCanvas(isOptimized),
          width: 118,
          height: 42,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }));
    }

    const first = routePoints[0];
    const second = routePoints[1] ?? interpolateRoute(routePoints, 0.02);
    if (first) {
      const position = Cesium.Cartesian3.fromDegrees(first.lon, first.lat, 2.2);
      const heading = second ? Cesium.Math.toRadians(routeBearingDeg(first, second) + CAR_MODEL_HEADING_OFFSET_DEG) : 0;

      carEntityRef.current = viewer.entities.add({
        position,
        orientation: Cesium.Transforms.headingPitchRollQuaternion(
          position,
          new Cesium.HeadingPitchRoll(heading, 0, 0)
        ),
        model: {
          uri: CAR_MODEL_URI,
          scale: CAR_MODEL_SCALE,
          minimumPixelSize: 22,
          maximumScale: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          shadows: Cesium.ShadowMode.DISABLED,
          runAnimations: false,
        },
      });
    }
  }

  function startCarAnimation(timestamp = performance.now()) {
    if (!viewerRef.current || !carEntityRef.current || routePointsRef.current.length < 2) return;

    const Cesium = window.Cesium;
    const viewer = viewerRef.current;
    const points = routePointsRef.current;
    const totalLen = routeLengthMeters(points);

    const dt = lastTickRef.current ? Math.min((timestamp - lastTickRef.current) / 1000, 0.08) : 0.016;
    lastTickRef.current = timestamp;

    const baseSpeed = isOptimized ? 0.055 : 0.035;
    const inBottleneck = progressRef.current > 0.45 && progressRef.current < 0.64;

    const nextNode = findNextSignalNode(progressRef.current);
    const currentBearing = getCarBearingDeg(points, progressRef.current);
    let isRedLight = false;
    let activeCachedSignal = nextNode ? signalCacheRef.current[nextNode.intNo] : null;

    // 빨간불 접근: 교차로 35m 앞에서 정지하도록 감속합니다.
    if (nextNode && !stoppedAtRef.current) {
      const cached = signalCacheRef.current[nextNode.intNo];
      activeCachedSignal = cached;

      if (cached?.ctx) {
        const green = calcIsGreen(cached.ctx, Date.now(), currentBearing);

        if (!green && totalLen) {
          const stopProgress = Math.max(0, nextNode.progress - (35 / totalLen));

          if (stopProgress > progressRef.current) {
            isRedLight = true;
            stoppedAtRef.current = nextNode.intNo;
            stopProgressRef.current = stopProgress;
          }
        }
      } else {
        fetchSignalCtx(nextNode.intNo);
      }
    }

    // 정지 중이면 같은 교차로의 신호가 초록으로 바뀌었는지 계속 확인합니다.
    if (stoppedAtRef.current) {
      const cached = signalCacheRef.current[stoppedAtRef.current];
      activeCachedSignal = cached;

      if (cached?.ctx) {
        const green = calcIsGreen(cached.ctx, Date.now(), currentBearing);

        if (green) {
          stoppedAtRef.current = null;
          stopProgressRef.current = null;
          isRedLight = false;
        } else {
          isRedLight = true;
        }
      } else {
        isRedLight = true;
      }

      if (!cached || Date.now() - cached.fetchedAt > 10000) {
        fetchSignalCtx(stoppedAtRef.current);
      }
    }

    emitCurrentSignalStatus(nextNode, isRedLight, activeCachedSignal, currentBearing);

    if (isRedLight && stopProgressRef.current !== null) {
      if (stopProgressRef.current > progressRef.current) {
        const approachSpeed = baseSpeed * 0.28;
        progressRef.current = Math.min(stopProgressRef.current, progressRef.current + approachSpeed * dt);
      }
      // 이미 정지 위치에 도달한 경우 progress를 유지합니다.
    } else {
      const speed = inBottleneck ? baseSpeed * (isOptimized ? 0.95 : 0.38) : baseSpeed;
      progressRef.current += speed * dt;

      if (progressRef.current > 1) {
        progressRef.current = 0;
        stoppedAtRef.current = null;
        stopProgressRef.current = null;
        emitCurrentSignalStatus(null, false, null, null);
      }
    }

    const p = interpolateRoute(points, progressRef.current);

    if (p) {
      const next = interpolateRoute(points, Math.min(progressRef.current + 0.012, 1));
      const position = Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 2.2);
      const routeHeadingDeg = next ? routeBearingDeg(p, next) : Cesium.Math.toDegrees(viewer.camera.heading);
      const modelHeading = Cesium.Math.toRadians(routeHeadingDeg + CAR_MODEL_HEADING_OFFSET_DEG);

      carEntityRef.current.position = position;
      carEntityRef.current.orientation = Cesium.Transforms.headingPitchRollQuaternion(
        position,
        new Cesium.HeadingPitchRoll(modelHeading, 0, 0)
      );

      updateSignalIndicator(isRedLight, p);

      if (driveView) {
        // 차량 뒤쪽에서 따라가는 추적 카메라입니다.
        // heading 반대 방향으로 물러나고 높이를 조금 올려 차량과 전방 도로가 함께 보이도록 했습니다.
        const cameraPos = offsetPointByMeters(p, routeHeadingDeg + 180, 42);
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(cameraPos.lon, cameraPos.lat, 44),
          orientation: {
            heading: Cesium.Math.toRadians(routeHeadingDeg),
            pitch: Cesium.Math.toRadians(-13),
            roll: 0,
          },
        });
      }
    }

    viewer.scene.requestRender();
    animationRef.current = requestAnimationFrame(startCarAnimation);
  }

  function updateSignalIndicator(isRedLight, carPos) {
    if (!viewerRef.current || !window.Cesium || !carPos) return;

    const Cesium = window.Cesium;
    const viewer = viewerRef.current;
    const indicatorHeight = 38;

    if (!signalIndicatorRef.current) {
      signalIndicatorRef.current = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(carPos.lon, carPos.lat, indicatorHeight),
        billboard: {
          image: createSignalCanvas(isRedLight),
          width: 30,
          height: 30,
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.NONE,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      return;
    }

    signalIndicatorRef.current.position = Cesium.Cartesian3.fromDegrees(carPos.lon, carPos.lat, indicatorHeight);
    signalIndicatorRef.current.billboard.image = createSignalCanvas(isRedLight);
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#0a0f1e" }}>
      <div id="vworld-simulation-map" ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {status && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#93c5fd", background: "rgba(10,15,30,0.85)", zIndex: 5 }}>
          {status}
        </div>
      )}

      <div style={{ position: "absolute", top: 14, left: 14, zIndex: 10, padding: "10px 14px", borderRadius: 6, background: "rgba(18,16,10,0.88)", border: "1px solid rgba(255,255,255,0.12)", color: "#dbeafe", fontSize: 12 }}>
        <div style={{ fontWeight: 800, color: "#60a5fa", marginBottom: 4 }}>VWorld WebGL 3D 신호 시뮬레이션</div>
        <div>1. 출발지 마커 클릭 → 2. 목적지 마커 클릭</div>
        <div style={{ color: "#fbbf24", marginTop: 3 }}>기존 노드 경로 유지 · 주행뷰 · VWorld 3D 건물</div>
      </div>



      <div style={{ position: "absolute", right: 16, bottom: 14, zIndex: 12, display: "flex", gap: 8 }}>
        <button
          onClick={() => setDriveView(false)}
          style={{
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 999,
            padding: "9px 14px",
            cursor: "pointer",
            color: "#fff",
            fontWeight: 800,
            background: !driveView ? "#3b82f6" : "rgba(15,23,42,0.82)",
            boxShadow: "0 8px 20px rgba(0,0,0,0.28)",
          }}
        >
          3D 조감도
        </button>
        <button
          onClick={() => setDriveView(true)}
          disabled={!routePoints.length}
          style={{
            border: "1px solid rgba(255,255,255,0.18)",
            borderRadius: 999,
            padding: "9px 14px",
            cursor: routePoints.length ? "pointer" : "not-allowed",
            color: "#fff",
            fontWeight: 800,
            opacity: routePoints.length ? 1 : 0.45,
            background: driveView ? "#22c55e" : "rgba(15,23,42,0.82)",
            boxShadow: "0 8px 20px rgba(0,0,0,0.28)",
          }}
        >
          주행뷰
        </button>
      </div>

      {start && !end && (
        <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 10, padding: "8px 14px", borderRadius: 999, background: "rgba(34,197,94,0.16)", border: "1px solid rgba(34,197,94,0.4)", color: "#bbf7d0", fontSize: 12, fontWeight: 800 }}>
          출발지 선택됨: {start.intNm} · 목적지를 클릭하세요
        </div>
      )}

      {start && end && (
        <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 10, padding: "8px 14px", borderRadius: 999, background: isOptimized ? "rgba(34,197,94,0.16)" : "rgba(239,68,68,0.13)", border: `1px solid ${isOptimized ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.4)"}`, color: isOptimized ? "#bbf7d0" : "#fecaca", fontSize: 12, fontWeight: 800 }}>
          {isOptimized ? "신호제어 적용: 병목 완화 구간 통과 중" : "현행 운영: 병목구간 발생"}
          {viaCrossroads.length > 0 ? ` · 자동 경유 ${viaCrossroads.length}개` : ""}
        </div>
      )}
    </div>
  );
}

function createMarkerCanvas(color, size = 12, text = "") {
  const canvas = document.createElement("canvas");
  canvas.width = 72;
  canvas.height = 72;
  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, 72, 72);
  ctx.beginPath();
  ctx.arc(36, 34, size, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.lineWidth = 3;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.stroke();

  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  ctx.arc(36, 34, size + 4, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.stroke();
  ctx.shadowBlur = 0;

  if (text) {
    ctx.fillStyle = "#fff";
    ctx.font = "bold 15px Malgun Gothic";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, 36, 34);
  }

  return canvas.toDataURL();
}

function createCarCanvas() {
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 60;
  const ctx = canvas.getContext("2d");

  ctx.translate(48, 30);

  ctx.fillStyle = "#facc15";
  roundRect(ctx, -28, -12, 56, 24, 8);
  ctx.fill();

  ctx.fillStyle = "#111827";
  roundRect(ctx, -14, -17, 28, 12, 5);
  ctx.fill();

  ctx.fillStyle = "#38bdf8";
  ctx.fillRect(-9, -15, 18, 8);

  ctx.fillStyle = "#111827";
  ctx.beginPath();
  ctx.arc(-18, 13, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(18, 13, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#fff";
  ctx.font = "bold 11px Arial";
  ctx.textAlign = "center";
  ctx.fillText("AI", 0, 5);

  return canvas.toDataURL();
}

function createSignalCanvas(isRed) {
  const canvas = document.createElement("canvas");
  canvas.width = 36;
  canvas.height = 36;
  const ctx = canvas.getContext("2d");
  const color = isRed ? "#ef4444" : "#22c55e";

  ctx.clearRect(0, 0, 36, 36);
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(18, 18, 13, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.lineWidth = 3;
  ctx.strokeStyle = "#ffffff";
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(18, 18, 16, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();

  return canvas.toDataURL();
}

function createBottleneckCanvas(isOptimized) {
  const canvas = document.createElement("canvas");
  canvas.width = 236;
  canvas.height = 84;
  const ctx = canvas.getContext("2d");

  const bg = isOptimized ? "rgba(22,101,52,0.92)" : "rgba(127,29,29,0.92)";
  const bd = isOptimized ? "#22c55e" : "#ef4444";

  roundRect(ctx, 4, 4, 228, 76, 16);
  ctx.fillStyle = bg;
  ctx.fill();

  ctx.lineWidth = 3;
  ctx.strokeStyle = bd;
  ctx.stroke();

  ctx.fillStyle = "#fff";
  ctx.font = "bold 24px Malgun Gothic";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(isOptimized ? "병목 완화" : "병목 구간", 118, 32);

  ctx.font = "bold 17px Malgun Gothic";
  ctx.fillStyle = isOptimized ? "#bbf7d0" : "#fecaca";
  ctx.fillText(isOptimized ? "신호제어 적용" : "속도 저하", 118, 58);

  return canvas.toDataURL();
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}