import { useState, useEffect, useRef } from "react";

const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8080";
const VWORLD_KEY = import.meta.env.VITE_VWORLD_API_KEY || "";

// 좌표 변환: 1270647846 → 127.0647846
function toCoord(val) {
  const n = parseInt(val);
  if (!n) return null;
  return n / 1e7;
}

// 차량 GLB (로컬 public 폴더)
const SIM_DIRECTIONS = [
  { heading: 0, start: [0, -0.0022], end: [0, 0.0022], lane: [0.000055, 0] },
  { heading: 180, start: [0, 0.0022], end: [0, -0.0022], lane: [-0.000055, 0] },
  { heading: 90, start: [-0.0022, 0], end: [0.0022, 0], lane: [0, -0.000055] },
  { heading: 270, start: [0.0022, 0], end: [-0.0022, 0], lane: [0, 0.000055] },
];
const CARS_PER_DIRECTION = 6;

// 교차로별 도로 경로 좌표 (방향별 진입/진출 waypoints)
// 형식: { intNo: { "남→북": [[lon,lat], ...], "북→남": [...], ... } }
// 나중에 직접 좌표 추가하면 됨
const ROAD_WAYPOINTS = {};

export default function SimulationMapView({ selected, onSelect, phaseIdx, isOptimized }) {
  const containerRef   = useRef(null);
  const viewerRef      = useRef(null);
  const entityMapRef   = useRef({});
  const carEntitiesRef = useRef([]);
  const simCarsRef     = useRef([]);
  const animationRef   = useRef(null);
  const lastTickRef    = useRef(null);
  const phaseIdxRef    = useRef(phaseIdx);
  const isOptimizedRef = useRef(isOptimized);
  const [crossroads,   setCrossroads]  = useState([]);
  const [cesiumReady,  setCesiumReady] = useState(false);
  const [status,       setStatus]      = useState("VWorld 3D 지도 로딩 중...");
  const [globeVisible, setGlobeVisible] = useState(true);

  // Cesium + VWorld 스크립트 로드
  useEffect(() => {
    if (window.Cesium) { setCesiumReady(true); return; }

    // Cesium CSS
    if (!document.querySelector("link[data-cesium]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://cesium.com/downloads/cesiumjs/releases/1.114/Build/Cesium/Widgets/widgets.css";
      link.setAttribute("data-cesium", "1");
      document.head.appendChild(link);
    }

    // Cesium JS
    const script = document.createElement("script");
    script.src = "https://cesium.com/downloads/cesiumjs/releases/1.114/Build/Cesium/Cesium.js";
    script.setAttribute("data-cesium-js", "1");
    script.onload = () => setCesiumReady(true);
    script.onerror = () => setStatus("Cesium 로드 실패");
    document.head.appendChild(script);
  }, []);

  // 교차로 목록 로드
  useEffect(() => {
    fetch(`${API_BASE}/api/signal/crossroads`)
      .then(r => r.json())
      .then(data => {
        const valid = data.filter(c => toCoord(c.xCoord) && toCoord(c.yCoord));
        setCrossroads(valid);
      })
      .catch(() => setStatus("교차로 데이터 로드 실패"));
  }, []);

  // Cesium Viewer 초기화
  useEffect(() => {
    if (!cesiumReady || !containerRef.current || viewerRef.current) return;

    const Cesium = window.Cesium;

    // Cesium ion 미사용 (VWorld만 사용)
    Cesium.Ion.defaultAccessToken = "";

    const viewer = new Cesium.Viewer(containerRef.current, {
      baseLayerPicker: false,
      geocoder: false,
      homeButton: false,
      sceneModePicker: false,
      navigationHelpButton: false,
      animation: false,
      timeline: false,
      fullscreenButton: false,
      infoBox: false,
      selectionIndicator: false,
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    });

    // 기본 이미지 레이어 제거 후 VWorld 위성 레이어 추가
    viewer.imageryLayers.removeAll();
    const vworldImagery = new Cesium.UrlTemplateImageryProvider({
      url: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Satellite/{z}/{y}/{x}.jpeg`,
      maximumLevel: 18,
      minimumLevel: 6,
      credit: new Cesium.Credit("VWorld"),
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
    });
    viewer.imageryLayers.addImageryProvider(vworldImagery);

    viewer.scene.globe.enableLighting = false;
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#0a0f1e");

    // 서울 잠실 초기 뷰
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(127.1002, 37.5133, 3000),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-45),
        roll: 0,
      },
    });

    viewerRef.current = viewer;
    setStatus(null);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
        animationRef.current = null;
      }
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [cesiumReady]);

  // 교차로 마커 렌더링
  // cesiumReady를 dependency에 추가: viewer 초기화 타이밍과 crossroads 로드 타이밍이
  // 어긋나도 cesiumReady가 true가 되는 시점에 effect가 재실행되어 마커가 정상 렌더링됨
  useEffect(() => {
    if (!cesiumReady || !viewerRef.current || crossroads.length === 0) return;
    const Cesium = window.Cesium;
    const viewer = viewerRef.current;

    // 기존 마커 제거
    Object.values(entityMapRef.current).forEach(e => viewer.entities.remove(e));
    entityMapRef.current = {};

    crossroads.forEach(cr => {
      const lon = toCoord(cr.xCoord);
      const lat = toCoord(cr.yCoord);
      if (!lon || !lat) return;

      const isSel = selected?.intNo === cr.intNo;

      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 10),
        billboard: {
          image: isSel
            ? createMarkerCanvas("#60a5fa", 18)
            : createMarkerCanvas("rgba(96,165,250,0.6)", 10),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: isSel ? {
          text: cr.intNm,
          font: "12px Malgun Gothic",
          fillColor: Cesium.Color.fromCssColorString("#60a5fa"),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -28),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        } : undefined,
        properties: { intNo: cr.intNo, intNm: cr.intNm, xCoord: cr.xCoord, yCoord: cr.yCoord },
      });

      entityMapRef.current[cr.intNo] = entity;
    });

    // 클릭 이벤트
    if (!viewer._simClickHandler) {
      const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
      handler.setInputAction(click => {
        const picked = viewer.scene.pick(click.position);
        if (picked?.id?.properties) {
          const intNo = picked.id.properties.intNo?.getValue();
          const intNm = picked.id.properties.intNm?.getValue();
          const xCoord = picked.id.properties.xCoord?.getValue();
          const yCoord = picked.id.properties.yCoord?.getValue();
          if (intNo) onSelect({ intNo, intNm, xCoord, yCoord });
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      viewer._simClickHandler = handler;
    }
  }, [crossroads, selected, cesiumReady]); // ← cesiumReady 추가

  // 선택된 교차로로 카메라 이동
  useEffect(() => {
    if (!viewerRef.current || !selected) return;
    const Cesium = window.Cesium;
    const lon = toCoord(selected.xCoord);
    const lat = toCoord(selected.yCoord);
    if (!lon || !lat) return;

    viewerRef.current.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(lon, lat, 600),
      orientation: {
        heading: Cesium.Math.toRadians(0),
        pitch: Cesium.Math.toRadians(-40),
        roll: 0,
      },
      duration: 1.5,
    });

    // 해당 교차로 차량 생성
    spawnCars(selected, phaseIdx);
  }, [selected?.intNo]);

  // 신호 현시 바뀌면 차량 상태 업데이트
  useEffect(() => {
    phaseIdxRef.current = phaseIdx;
    if (!viewerRef.current || !selected) return;
    updateCarMovement(phaseIdx);
  }, [phaseIdx]);

  // AI 최적화 모드 변경 → ref 업데이트
  useEffect(() => {
    isOptimizedRef.current = isOptimized;
  }, [isOptimized]);

  // 차량 생성
  function spawnCars(crossroad, currentPhaseIdx) {
    if (!viewerRef.current) return;
    const Cesium = window.Cesium;
    const viewer = viewerRef.current;

    carEntitiesRef.current.forEach(e => viewer.entities.remove(e));
    carEntitiesRef.current = [];
    simCarsRef.current = [];
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    }
    lastTickRef.current = null;

    const lon = toCoord(crossroad.xCoord);
    const lat = toCoord(crossroad.yCoord);
    if (!lon || !lat) return;

    const routes = buildRoadLikeRoutes(crossroad, lon, lat);

    routes.forEach((route, routeIdx) => {
      for (let i = 0; i < 4; i++) {
        const state = {
          routeIdx,
          groupIdx: route.groupIdx,
          queueIdx: i,
          progress: -0.06 - i * 0.16,
          speed: 0.12 + (i % 2) * 0.018,
          route,
          entity: null,
        };
        const [carLon, carLat] = pointOnRoute(route, state.progress, i);
        const position = Cesium.Cartesian3.fromDegrees(carLon, carLat, 3);
        const car = viewer.entities.add({
          position,
          billboard: {
            image: createCarCanvas(route.heading, routeIdx),
            width: 34,
            height: 20,
            verticalOrigin: Cesium.VerticalOrigin.CENTER,
            heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            disableDepthTestDistance: Number.POSITIVE_INFINITY,
          },
          properties: { routeIdx, queueIdx: i },
        });
        state.entity = car;
        carEntitiesRef.current.push(car);
        simCarsRef.current.push(state);
      }
    });

    phaseIdxRef.current = currentPhaseIdx;
    tickCars();
  }

  // 신호 현시 변경 시 차량 속도 갱신
  function updateCarMovement(currentPhaseIdx) {
    phaseIdxRef.current = currentPhaseIdx;
  }

  function tickCars(timestamp = performance.now()) {
    if (!viewerRef.current || simCarsRef.current.length === 0) return;
    const Cesium = window.Cesium;
    const dt = lastTickRef.current ? Math.min((timestamp - lastTickRef.current) / 1000, 0.08) : 0.016;
    lastTickRef.current = timestamp;

    simCarsRef.current.forEach(car => {
      const optimized = isOptimizedRef.current;
      const greenGroup = phaseIdxRef.current != null ? (phaseIdxRef.current - 1) % 2 : 0;
      const green = car.groupIdx === greenGroup;
      const stopAt = 0.48 - car.queueIdx * 0.06;
      const canRollToQueue = car.progress < stopAt;
      // After 모드: 모든 방향 빠르게 이동 (신호 최적화 효과 시각화)
      const speed = optimized
        ? car.speed * 2.2
        : (green ? car.speed : canRollToQueue ? car.speed * 0.3 : 0);

      car.progress += speed * dt;
      if (!optimized && !green && car.progress > stopAt) car.progress = stopAt;
      if (car.progress > 1.08) car.progress = -0.08 - car.queueIdx * 0.12;

      const [carLon, carLat] = pointOnRoute(car.route, car.progress, car.queueIdx);
      car.entity.position = Cesium.Cartesian3.fromDegrees(carLon, carLat, 3);
      car.entity.billboard.scale = green ? 1.12 : 0.96;
    });

    viewerRef.current.scene.requestRender();
    animationRef.current = requestAnimationFrame(tickCars);
  }

  function buildRoadLikeRoutes(crossroad, lon, lat) {
    const manual = ROAD_WAYPOINTS[crossroad.intNo];
    if (manual) {
      return Object.values(manual).flatMap((points, idx) => ([
        makeRoute(points, idx % 2, idx),
        makeRoute([...points].reverse(), idx % 2, idx + 1),
      ]));
    }

    const nearby = crossroads
      .filter(cr => cr.intNo !== crossroad.intNo)
      .map(cr => ({ ...cr, lon: toCoord(cr.xCoord), lat: toCoord(cr.yCoord) }))
      .filter(cr => cr.lon && cr.lat)
      .map(cr => ({
        ...cr,
        dist: Math.hypot(cr.lon - lon, cr.lat - lat),
        angle: Math.atan2(cr.lat - lat, cr.lon - lon),
      }))
      .filter(cr => cr.dist > 0.00008 && cr.dist < 0.012)
      .sort((a, b) => a.dist - b.dist)
      .slice(0, 18);

    const pairs = [];
    for (let i = 0; i < nearby.length; i++) {
      for (let j = i + 1; j < nearby.length; j++) {
        const angleDiff = Math.abs(Math.atan2(
          Math.sin(nearby[i].angle - nearby[j].angle),
          Math.cos(nearby[i].angle - nearby[j].angle)
        ));
        const oppositeScore = Math.abs(Math.PI - angleDiff);
        pairs.push({ a: nearby[i], b: nearby[j], score: oppositeScore + (nearby[i].dist + nearby[j].dist) * 80 });
      }
    }

    const selectedPairs = pairs.sort((a, b) => a.score - b.score).slice(0, 2);
    if (selectedPairs.length > 0) {
      return selectedPairs.flatMap((pair, idx) => {
        const forward = [[pair.a.lon, pair.a.lat], [lon, lat], [pair.b.lon, pair.b.lat]];
        return [makeRoute(forward, idx, idx * 2), makeRoute([...forward].reverse(), idx, idx * 2 + 1)];
      });
    }

    return SIM_DIRECTIONS.map((dir, idx) => makeRoute([
      [lon + dir.start[0], lat + dir.start[1]],
      [lon, lat],
      [lon + dir.end[0], lat + dir.end[1]],
    ], idx % 2, idx));
  }

  function makeRoute(points, groupIdx, routeIdx) {
    const first = points[0];
    const last = points[points.length - 1];
    return {
      points,
      groupIdx,
      heading: bearingDeg(first[0], first[1], last[0], last[1]),
      laneSign: routeIdx % 2 === 0 ? 1 : -1,
    };
  }

  function pointOnRoute(route, progress, queueIdx) {
    const points = route.points;
    const p = Math.max(0, Math.min(1, progress));
    const segCount = Math.max(points.length - 1, 1);
    const raw = p * segCount;
    const segIdx = Math.min(Math.floor(raw), segCount - 1);
    const local = raw - segIdx;
    const a = points[segIdx];
    const b = points[segIdx + 1];
    const lon = a[0] + (b[0] - a[0]) * local;
    const lat = a[1] + (b[1] - a[1]) * local;

    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const lane = (0.000035 + (queueIdx % 2) * 0.00001) * route.laneSign;
    return [lon + (-dy / len) * lane, lat + (dx / len) * lane];
  }

  function bearingDeg(lon1, lat1, lon2, lat2) {
    const rad = Math.atan2(lon2 - lon1, lat2 - lat1);
    return (rad * 180 / Math.PI + 360) % 360;
  }

  function toggleGlobe() {
    if (!viewerRef.current) return;
    const viewer = viewerRef.current;
    const next = !globeVisible;
    viewer.scene.globe.show = next;
    viewer.scene.skyAtmosphere.show = next;
    viewer.scene.skyBox.show = next;
    setGlobeVisible(next);
  }

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {/* 로딩 오버레이 */}
      {status && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10,15,30,0.85)", zIndex: 30 }}>
          <div style={{ color: "#94a3b8", fontSize: 14 }}>{status}</div>
        </div>
      )}

      {/* 우상단 범례 + 도로 토글 버튼 */}
      <div style={{ position: "absolute", top: 14, right: 14, background: "rgba(18,14,10,0.88)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "10px 14px", zIndex: 10, backdropFilter: "blur(4px)" }}>
        <div style={{ fontSize: 12, color: "#aab4c8", fontWeight: 700, marginBottom: 6 }}>신호 시뮬레이션</div>
        <div style={{ fontSize: 11, color: "#64748b" }}>🔵 교차로 마커 클릭</div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, marginBottom: 10 }}>→ 실시간 신호 + 3D 차량</div>
        <button
          onClick={toggleGlobe}
          style={{
            width: "100%",
            padding: "6px 10px",
            borderRadius: 4,
            fontSize: 11,
            fontWeight: 600,
            cursor: "pointer",
            border: `1px solid ${globeVisible ? "rgba(239,68,68,0.5)" : "rgba(34,197,94,0.5)"}`,
            background: globeVisible ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
            color: globeVisible ? "#ef4444" : "#22c55e",
            transition: "all 0.2s",
          }}
        >
          {globeVisible ? "🌍 도로 숨기기" : "🌍 도로 표시"}
        </button>
      </div>

      {/* 좌상단 교차로 수 */}
      <div style={{ position: "absolute", top: 14, left: 14, background: "rgba(18,14,10,0.88)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "4px 12px", fontSize: 12, color: "#aab4c8", zIndex: 10, pointerEvents: "none", backdropFilter: "blur(4px)" }}>
        🚦 서울시 신호 교차로 {crossroads.length}개
      </div>

      {/* 좌표 미등록 안내 */}
      {selected && !ROAD_WAYPOINTS[selected.intNo] && (
        <div style={{ position: "absolute", bottom: 14, left: 14, background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: 4, padding: "6px 12px", fontSize: 11, color: "#eab308", zIndex: 10, pointerEvents: "none" }}>
          ⚠ 이 교차로는 도로 경로 미등록 — 임시 차량 표시 중
        </div>
      )}
    </div>
  );
}

// Canvas로 원형 마커 이미지 생성
function createMarkerCanvas(color, radius) {
  const size = radius * 2 + 4;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "rgba(96,165,250,0.8)";
  ctx.lineWidth = 2;
  ctx.stroke();
  return canvas.toDataURL();
}

function createCarCanvas(heading, dirIdx) {
  const canvas = document.createElement("canvas");
  canvas.width = 68;
  canvas.height = 40;
  const ctx = canvas.getContext("2d");
  const colors = ["#22c55e", "#f59e0b", "#38bdf8", "#f43f5e"];

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(((heading - 90) * Math.PI) / 180);
  ctx.shadowColor = "rgba(0,0,0,0.65)";
  ctx.shadowBlur = 6;
  ctx.shadowOffsetY = 2;

  ctx.fillStyle = colors[dirIdx % colors.length];
  roundRect(ctx, -23, -10, 46, 20, 6);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.82)";
  roundRect(ctx, -8, -7, 14, 14, 4);
  ctx.fill();

  ctx.fillStyle = "#0f172a";
  ctx.beginPath();
  ctx.arc(-15, -10, 4, 0, Math.PI * 2);
  ctx.arc(15, -10, 4, 0, Math.PI * 2);
  ctx.arc(-15, 10, 4, 0, Math.PI * 2);
  ctx.arc(15, 10, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.moveTo(26, 0);
  ctx.lineTo(17, -6);
  ctx.lineTo(17, 6);
  ctx.closePath();
  ctx.fill();

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