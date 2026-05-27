import { useState, useEffect, useRef } from "react";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8080").replace(/\/+$/, "");
const VWORLD_KEY = import.meta.env.VITE_VWORLD_API_KEY || "";
// GeoServer: WMS(Cesium 직접 호출), WFS(fetch → Vite 프록시 경유 CORS 우회)
const GEOSERVER_WMS = (import.meta.env.VITE_GEOSERVER_WMS_URL || "http://localhost:8600/geoserver/traffic/wms");
const GEOSERVER_WFS = "/geoserver/traffic/ows";  // Vite proxy: /geoserver → 8600

const EN_TO_KO = {
  north: "북", south: "남", east: "동", west: "서",
  northeast: "북동", southeast: "남동", southwest: "남서", northwest: "북서",
};

// ── 좌표 변환 ─────────────────────────────────────────────────────────────────
// 명세서 확인: X_COORD "126976922" → ÷1e7 → 126.976922° (항상 정수×1e7 형태)
// Y_COORD "37564022"  → ÷1e7 → 37.564022°
function toCoord(val) {
  const n = parseInt(val, 10);
  if (!n || isNaN(n)) return null;
  return n / 1e7;
}

const SIM_DIRECTIONS = [
  { start: [0, -0.00115], end: [0, 0.00115], phaseNos: [1, 3], label: "south-north" },
  { start: [0, 0.00115], end: [0, -0.00115], phaseNos: [1, 3], label: "north-south" },
  { start: [-0.00115, 0], end: [0.00115, 0], phaseNos: [2, 4], label: "west-east" },
  { start: [0.00115, 0], end: [-0.00115, 0], phaseNos: [2, 4], label: "east-west" },
];
const CARS_PER_ROUTE = 3;
const FALLBACK_ROUTE_HALF_LENGTH_DEG = 0.00115;
const SIM_SECONDS_PER_REAL_SECOND = 12;
const DEFAULT_SPEED_KPH = 28;
const MIN_ROLL_SPEED_KPH = 6;
const OPTIMIZED_SPEED_GAIN_KPH = 18;

// 교차로별 수동 경로 좌표 (필요 시 추가)
// points는 [lon, lat] 절대 좌표, relativePoints는 교차로 중심 기준 [lonOffset, latOffset]입니다.
// phaseNos는 해당 route 차량이 통과 가능한 현시 번호입니다.
const ROAD_WAYPOINTS = {
  // 성수사거리 후보 ID. 실제 INT_NO가 다르면 아래 키만 DB 값으로 바꾸면 됩니다.
  "1716": [
    { label: "main-sw-ne", phaseNos: [1, 3], relativePoints: [[-0.00165, -0.00125], [-0.00045, -0.00032], [0.00042, 0.00030], [0.00165, 0.00122]] },
    { label: "main-ne-sw", phaseNos: [1, 3], relativePoints: [[0.00165, 0.00122], [0.00042, 0.00030], [-0.00045, -0.00032], [-0.00165, -0.00125]] },
    { label: "sub-nw-se", phaseNos: [2, 4], relativePoints: [[-0.00145, 0.00105], [-0.00034, 0.00024], [0.00035, -0.00025], [0.00145, -0.00106]] },
    { label: "sub-se-nw", phaseNos: [2, 4], relativePoints: [[0.00145, -0.00106], [0.00035, -0.00025], [-0.00034, 0.00024], [-0.00145, 0.00105]] },
  ],
};

export default function SimulationMapView({ selectedList = [], onSelect, phaseIdx, isOptimized, trafficContext }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const entityMapRef = useRef({});
  const carEntitiesRef = useRef({});       // { [intNo]: [Entity, ...] }
  const simCarsRef = useRef({});            // { [intNo]: [CarState, ...] }
  const intersectionPhaseRefs = useRef({}); // { [intNo]: phaseIdx }
  const roadStatusEntitiesRef = useRef([]);
  const directionGuideEntitiesRef = useRef([]);
  const animationRef = useRef(null);
  const lastTickRef = useRef(null);
  const phaseIdxRef = useRef(phaseIdx);
  const isOptimizedRef = useRef(isOptimized);
  const trafficContextRef = useRef(trafficContext);
  // 편의 변수 (마커 렌더링·배지·방향 가이드 등에서 사용)
  const selected     = selectedList[0] ?? null;
  const linkedTarget = selectedList[1] ?? null;

  const [crossroads, setCrossroads] = useState([]);
  const [cesiumReady, setCesiumReady] = useState(false);
  const [status, setStatus] = useState("VWorld 3D 지도 로딩 중...");
  const [globeVisible, setGlobeVisible] = useState(true);
  const [wfsSource, setWfsSource] = useState("대기");  // "WFS" | "폴백" | "대기"
  const [rotationMap, setRotationMap] = useState({});
  const rotationMapRef   = useRef({});
  const routeRotationRef  = useRef(0);
  const lastSpawnArgsRef  = useRef(null);

  // 신호 현시 변경 시 해당 교차로 ref에 저장 (교차로별 신호 독립 관리)
  useEffect(() => {
    const lastCr = selectedList[selectedList.length - 1];
    if (lastCr) intersectionPhaseRefs.current[lastCr.intNo] = phaseIdx;
  }, [phaseIdx, selectedList]);

  // Cesium + VWorld 스크립트 로드
  useEffect(() => {
    if (window.Cesium) { setCesiumReady(true); return; }
    if (!document.querySelector("link[data-cesium]")) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = "https://cesium.com/downloads/cesiumjs/releases/1.114/Build/Cesium/Widgets/widgets.css";
      link.setAttribute("data-cesium", "1");
      document.head.appendChild(link);
    }
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

    // Cesium Ion을 전혀 쓰지 않도록 VWorld 레이어를 직접 기본 레이어로 지정합니다.
    // baseLayer를 지정하지 않으면 Cesium이 내부 기본 asset(2번)을 요청하면서 401이 날 수 있습니다.
    const vworldProvider = new Cesium.UrlTemplateImageryProvider({
      url: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Satellite/{z}/{y}/{x}.jpeg`,
      maximumLevel: 18,
      minimumLevel: 6,
      credit: new Cesium.Credit("VWorld"),
      tilingScheme: new Cesium.WebMercatorTilingScheme(),
    });

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
      shouldAnimate: true,
      requestRenderMode: false,

      // 핵심: Cesium Ion 기본 imagery/terrain 차단
      baseLayer: new Cesium.ImageryLayer(vworldProvider),
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    });

    viewer.imageryLayers.removeAll();

    viewer.imageryLayers.addImageryProvider(
      new Cesium.UrlTemplateImageryProvider({
        url: `https://api.vworld.kr/req/wmts/1.0.0/${VWORLD_KEY}/Satellite/{z}/{y}/{x}.jpeg`,
        maximumLevel: 18,
        minimumLevel: 6,
        credit: new Cesium.Credit("VWorld"),
        tilingScheme: new Cesium.WebMercatorTilingScheme(),
      })
    );

    // GeoServer WMS 도로 레이어 (VWorld 위에 반투명 오버레이)
    try {
      // viewer.imageryLayers.addImageryProvider(new Cesium.WebMapServiceImageryProvider({
      //   url: GEOSERVER_WMS,
      //   layers: "traffic:seoul_roads",
      //   parameters: { transparent: true, format: "image/png", styles: "" },
      //   minimumLevel: 12,
      //   maximumLevel: 19,
      //   credit: new Cesium.Credit("GeoServer"),
      // }));
    } catch (e) {
      console.warn("GeoServer WMS 연결 실패 (폴백 모드):", e);
    }

    viewer.scene.globe.enableLighting = false;
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#0a0f1e");
    viewer.camera.setView({
      destination: Cesium.Cartesian3.fromDegrees(127.1002, 37.5133, 3000),
      orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-45), roll: 0 },
    });

    viewerRef.current = viewer;
    setStatus(null);

    return () => {
      if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; }
      removeRoadStatusOverlay();
      removeDirectionGuide();
      if (viewerRef.current && !viewerRef.current.isDestroyed()) { viewerRef.current.destroy(); viewerRef.current = null; }
    };
  }, [cesiumReady]);

  // 교차로 마커 렌더링
  useEffect(() => {
    if (!cesiumReady || !viewerRef.current || crossroads.length === 0) return;
    const Cesium = window.Cesium;
    const viewer = viewerRef.current;

    Object.values(entityMapRef.current).forEach(e => viewer.entities.remove(e));
    entityMapRef.current = {};

    crossroads.forEach(cr => {
      const lon = toCoord(cr.xCoord);
      const lat = toCoord(cr.yCoord);
      if (!lon || !lat) return;

      const isSel = selected?.intNo === cr.intNo;
      const isLinked = linkedTarget?.intNo === cr.intNo;
      const entity = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(lon, lat, 10),
        billboard: {
          image: isSel
            ? createMarkerCanvas("#60a5fa", 18)
            : isLinked
              ? createMarkerCanvas("#f59e0b", 16)
              : createMarkerCanvas("rgba(96,165,250,0.6)", 10),
          verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: (isSel || isLinked) ? {
          text: cr.intNm, font: "12px Malgun Gothic",
          fillColor: Cesium.Color.fromCssColorString(isSel ? "#60a5fa" : "#f59e0b"),
          outlineColor: Cesium.Color.BLACK, outlineWidth: 2,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -28),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        } : undefined,
        properties: { intNo: cr.intNo, intNm: cr.intNm, xCoord: cr.xCoord, yCoord: cr.yCoord },
      });
      entityMapRef.current[cr.intNo] = entity;
    });

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
  }, [crossroads, selectedList, cesiumReady]);

  // ── selectedList 변경 시: 카메라 이동 + 교차로별 차량 생성 ─────────────────
  // 팀원 코드 방식: 모든 선택 교차로를 배열로 관리, 각각 독립적으로 차량 생성
  useEffect(() => {
    if (!cesiumReady || !viewerRef.current) return;

    // 마커 전부 취소됐을 때 → 차량/선 전부 제거
    if (selectedList.length === 0) {
      const viewer = viewerRef.current;
      Object.values(carEntitiesRef.current).flat().forEach(e => viewer.entities.remove(e));
      carEntitiesRef.current = {};
      simCarsRef.current = {};
      removeRoadStatusOverlay();
      removeDirectionGuide();
      if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; }
      lastTickRef.current = null;
      lastSpawnArgsRef.current = null;
      return;
    }
    const Cesium = window.Cesium;

    // 카메라: 마지막으로 클릭한 교차로로 이동
    const lastCr = selectedList[selectedList.length - 1];
    const lastLon = toCoord(lastCr.xCoord);
    const lastLat = toCoord(lastCr.yCoord);
    if (!lastLon || !lastLat) return;

    if (selectedList.length === 1) {
      // 단독: 해당 교차로 위로
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lastLon, lastLat, 600),
        orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-40), roll: 0 },
        duration: 1.5,
      });
    } else {
      // 다중: 전체가 보이도록 중간 지점으로
      const firstCr = selectedList[0];
      const firstLon = toCoord(firstCr.xCoord), firstLat = toCoord(firstCr.yCoord);
      const dist = distanceMeters([firstLon, firstLat], [lastLon, lastLat]);
      viewerRef.current.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(
          (firstLon + lastLon) / 2, (firstLat + lastLat) / 2, Math.max(700, dist * 2.4)
        ),
        orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-42), roll: 0 },
        duration: 1.1,
      });
    }

    // 교차로별 차량 생성 (팀원 코드의 spawnCarsForMultiple 방식)
    spawnCarsForList(selectedList);
  }, [selectedList, cesiumReady]);

  // 교차로별 회전각 변경 시 해당 교차로만 재생성
  useEffect(() => {
    rotationMapRef.current = rotationMap;
    if (lastSpawnArgsRef.current && viewerRef.current) {
      spawnCarsForList(lastSpawnArgsRef.current);
    }
  }, [rotationMap]);

  // 신호 현시 변경
  useEffect(() => {
    phaseIdxRef.current = phaseIdx;
    updateRoadStatusOverlay();
  }, [phaseIdx]);

  // AI 최적화 모드 변경
  useEffect(() => {
    isOptimizedRef.current = isOptimized;
    updateRoadStatusOverlay();
  }, [isOptimized]);

  useEffect(() => {
    trafficContextRef.current = trafficContext;
    updateRoadStatusOverlay();
  }, [trafficContext]);

  // ── WFS 헬퍼 ──────────────────────────────────────────────────────────────

  async function fetchSignalPhases(intNo) {
    try {
      const res = await fetch(`${API_BASE}/api/signal/simulation/context/${intNo}`,
        { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return [];
      const data = await res.json();
      return data.phases ?? [];
    } catch { return []; }
  }

  async function fetchWfsFeatures(intNo) {
    try {
      const filter = `int_no='${intNo}'`;
      const url = `${GEOSERVER_WFS}?service=WFS&version=1.0.0&request=GetFeature` +
        `&typeName=traffic:seoul_roads&outputFormat=application/json` +
        `&CQL_FILTER=${encodeURIComponent(filter)}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      if (!res.ok) return null;
      const geo = await res.json();
      return geo.features?.length ? geo.features : null;
    } catch { return null; }
  }

  function resolvePhaseNos(fromDir, toDir, phases) {
    const fromKo = EN_TO_KO[fromDir] ?? fromDir;
    const toKo = EN_TO_KO[toDir] ?? toDir;
    if (!phases?.length) {
      return ["north", "south"].includes(fromDir) ? [1, 3] : [2, 4];
    }
    const matched = phases
      .filter(p => (p.dirs ?? []).some(d =>
        d !== "전적색" && d !== "보행" && (d.includes(fromKo) || d.includes(toKo))
      ))
      .map(p => p.no);
    return matched.length ? matched : [1, 3];
  }

  function wfsFeaturesToRoutes(features, phases) {
    return features.map((feat, idx) => {
      const raw = feat.geometry?.type === "MultiLineString"
        ? feat.geometry.coordinates[0]
        : feat.geometry?.coordinates ?? [];
      const pts = raw.map(([lon, lat]) => [lon, lat]);
      const props = feat.properties ?? {};
      const phaseNos = resolvePhaseNos(props.from_dir, props.to_dir, phases);
      return makeRoute(
        pts,
        idx,
        props.lane === "forward" ? 1 : -1,
        phaseNos,
        props.direction ?? `wfs-${idx}`,
      );
    }).filter(r => r.points.length >= 2);
  }

  // ── 차량 생성: 다중 교차로 지원 (팀원 코드 spawnCarsForMultiple 방식) ────────
  // selectedList의 각 교차로마다 독립적으로 차량을 생성하고 관리
  async function spawnCarsForList(crossroadsList) {
    if (!viewerRef.current) return;
    lastSpawnArgsRef.current = crossroadsList; // 회전 재생성에 사용
    const Cesium = window.Cesium;
    const viewer = viewerRef.current;

    // 기존 모든 차량/오버레이 제거
    Object.values(carEntitiesRef.current).flat().forEach(e => viewer.entities.remove(e));
    carEntitiesRef.current = {};
    simCarsRef.current = {};
    removeRoadStatusOverlay();
    removeDirectionGuide();
    if (animationRef.current) { cancelAnimationFrame(animationRef.current); animationRef.current = null; }
    lastTickRef.current = null;

    let lastWfsSource = "폴백";

    for (const crossroad of crossroadsList) {
      const intNo = crossroad.intNo;
      const lon = toCoord(crossroad.xCoord);
      const lat = toCoord(crossroad.yCoord);
      if (!lon || !lat) continue;

      // WFS + 신호 병렬 조회
      const [wfsFeatures, phases] = await Promise.all([
        fetchWfsFeatures(intNo),
        fetchSignalPhases(intNo),
      ]);

      const routes = wfsFeatures
        ? wfsFeaturesToRoutes(wfsFeatures, phases)
        : buildRoadLikeRoutes(crossroad, lon, lat, null, phases); // phases 전달 → 실제 도로 방향 추론
      if (wfsFeatures) lastWfsSource = "WFS";

      // 방향 가이드는 첫 번째 교차로만
      if (crossroad.intNo === crossroadsList[0].intNo) {
        renderDirectionGuide(lon, lat);
      }
      // 단독 마커일 때만 개별 선 표시 (연결 모드에선 연결선만 표시)
      if (crossroadsList.length === 1) {
        renderRoadStatusOverlay(routes);
      }

      // 연결 모드(2개 이상)에선 개별 교차로 차량 생성 안 함
      // → 연결선 위 차량만 달리게 하기 위해 skip
      if (crossroadsList.length === 1) {
        carEntitiesRef.current[intNo] = [];
        simCarsRef.current[intNo] = [];

        routes.forEach((route, routeIdx) => {
          for (let i = 0; i < CARS_PER_ROUTE; i++) {
            const state = {
              routeIdx,
              groupIdx: route.groupIdx,
              queueIdx: i,
              progress: -0.12 - i * 0.24 - (routeIdx % 2) * 0.06,
              speedBias: 0.92 + (i % 2) * 0.08,
              route,
              intNo,
              entity: null,
            };
            const [carLon, carLat] = pointOnRoute(route, state.progress, i);
            const car = viewer.entities.add({
              position: Cesium.Cartesian3.fromDegrees(carLon, carLat, 3),
              billboard: {
                image: createCarCanvas(route.heading, routeIdx),
                width: 26, height: 15,
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
              properties: { routeIdx, queueIdx: i },
            });
            state.entity = car;
            carEntitiesRef.current[intNo].push(car);
            simCarsRef.current[intNo].push(state);
          }
        });
      }
    } // end for crossroad

    // ── 교차로 간 연결 경로 생성 ──────────────────────────────────────────────
    // crossroadsList에 2개 이상 있으면 인접 교차로 쌍(i, i+1)마다
    // A→B, B→A 양방향 연결 경로를 추가로 생성하여 차량이 구간을 달리게 함
    if (crossroadsList.length >= 2) {
      for (let i = 0; i < crossroadsList.length - 1; i++) {
        const crA = crossroadsList[i];
        const crB = crossroadsList[i + 1];
        const aLon = toCoord(crA.xCoord), aLat = toCoord(crA.yCoord);
        const bLon = toCoord(crB.xCoord), bLat = toCoord(crB.yCoord);
        if (!aLon || !aLat || !bLon || !bLat) continue;

        const dist = distanceMeters([aLon, aLat], [bLon, bLat]);
        if (dist < 30 || dist > 5000) continue;

        // A→B, B→A 두 방향 경로
        const angle = Math.atan2(bLat - aLat, bLon - aLon);
        const approachM = Math.min(80, Math.max(30, dist * 0.12));
        const approachDeg = metersToDegrees(approachM, aLat);
        const dx = Math.cos(angle) * approachDeg.lon;
        const dy = Math.sin(angle) * approachDeg.lat;

        const fwd = [[aLon - dx, aLat - dy], [aLon, aLat], [bLon, bLat], [bLon + dx, bLat + dy]];
        const rev = [[bLon + dx, bLat + dy], [bLon, bLat], [aLon, aLat], [aLon - dx, aLat - dy]];

        const linkKey = `link-${crA.intNo}-${crB.intNo}`;
        const routeFwd = makeRoute(fwd, 0, 1,  [1, 2, 3, 4], `${linkKey}-fwd`);
        const routeRev = makeRoute(rev, 1, -1, [1, 2, 3, 4], `${linkKey}-rev`);

        carEntitiesRef.current[linkKey] = [];
        simCarsRef.current[linkKey] = [];
        renderRoadStatusOverlay([routeFwd, routeRev]);

        [routeFwd, routeRev].forEach((route, routeIdx) => {
          for (let qi = 0; qi < CARS_PER_ROUTE; qi++) {
            const state = {
              routeIdx,
              groupIdx: route.groupIdx,
              queueIdx: qi,
              progress: -0.12 - qi * 0.24 - (routeIdx % 2) * 0.06,
              speedBias: 0.92 + (qi % 2) * 0.08,
              route,
              intNo: linkKey,
              entity: null,
            };
            const [carLon, carLat] = pointOnRoute(route, state.progress, qi);
            const car = viewer.entities.add({
              position: Cesium.Cartesian3.fromDegrees(carLon, carLat, 3),
              billboard: {
                image: createCarCanvas(route.heading, routeIdx + 4),
                width: 26, height: 15,
                verticalOrigin: Cesium.VerticalOrigin.CENTER,
                heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
                disableDepthTestDistance: Number.POSITIVE_INFINITY,
              },
            });
            state.entity = car;
            carEntitiesRef.current[linkKey].push(car);
            simCarsRef.current[linkKey].push(state);
          }
        });
      }
    }

    setWfsSource(lastWfsSource);
    tickCars();
  }

  function tickCars(timestamp = performance.now()) {
    if (!viewerRef.current) return;
    const allCars = Object.values(simCarsRef.current).flat();
    if (allCars.length === 0) return;

    const Cesium = window.Cesium;
    const dt = lastTickRef.current ? Math.min((timestamp - lastTickRef.current) / 1000, 0.08) : 0.016;
    lastTickRef.current = timestamp;

    // 교차로별로 해당 교차로의 현시(phaseIdx)를 독립적으로 적용
    Object.keys(simCarsRef.current).forEach(intNo => {
      // 해당 교차로의 최신 현시 (없으면 전역 phaseIdxRef 사용)
      const currentPhase = intersectionPhaseRefs.current[intNo] ?? phaseIdxRef.current;

      simCarsRef.current[intNo].forEach(car => {
        const optimized = isOptimizedRef.current;
        const green = isRouteGreen(car.route, currentPhase);
        const stopAt = 0.43 - car.queueIdx * 0.105;
        const canRoll = car.progress < stopAt;
        const speedKph = routeSpeedKph(car.route, optimized, green);
        const progressPerSec = speedKphToProgressPerSec(speedKph * car.speedBias, car.route.lengthMeters);
        const speed = green ? progressPerSec : canRoll ? speedKphToProgressPerSec(MIN_ROLL_SPEED_KPH, car.route.lengthMeters) : 0;

        car.progress += speed * dt;
        if (!green && car.progress > stopAt) car.progress = stopAt;
        if (car.progress > 1.08) car.progress = -0.14 - car.queueIdx * 0.22 - (car.routeIdx % 2) * 0.05;

        const [carLon, carLat] = pointOnRoute(car.route, car.progress, car.queueIdx);
        car.entity.position = Cesium.Cartesian3.fromDegrees(carLon, carLat, 3);
        car.entity.billboard.scale = green ? 1.12 : 0.96;
      });
    });

    viewerRef.current.scene.requestRender();
    animationRef.current = requestAnimationFrame(tickCars);
  }

  function renderRoadStatusOverlay(routes) {
    if (!viewerRef.current || !window.Cesium) return;
    const Cesium = window.Cesium;
    const viewer = viewerRef.current;

    // push로 누적 (= 덮어쓰기 금지 — 루프에서 여러 번 호출되므로)
    routes.forEach((route) => {
      const positions = route.points.flatMap(([lon, lat]) => [lon, lat]);
      roadStatusEntitiesRef.current.push({
        route,
        entity: viewer.entities.add({
          polyline: {
            positions: Cesium.Cartesian3.fromDegreesArray(positions),
            width: routeLineWidth(route),
            clampToGround: true,
            material: routeLineMaterial(route),
            zIndex: 20,
          },
        }),
      });
    });
  }

  function removeRoadStatusOverlay() {
    if (!viewerRef.current) return;
    roadStatusEntitiesRef.current.forEach(({ entity }) => viewerRef.current.entities.remove(entity));
    roadStatusEntitiesRef.current = [];
  }

  function renderDirectionGuide(lon, lat) {
    if (!viewerRef.current || !window.Cesium) return;
    const Cesium = window.Cesium;
    const viewer = viewerRef.current;
    const guides = [
      { key: "N", text: "북", sub: "N", lon: lon, lat: lat + 0.00115, color: "#60a5fa" },
      { key: "E", text: "동", sub: "E", lon: lon + 0.00115, lat, color: "#22c55e" },
      { key: "S", text: "남", sub: "S", lon: lon, lat: lat - 0.00115, color: "#f59e0b" },
      { key: "W", text: "서", sub: "W", lon: lon - 0.00115, lat, color: "#f43f5e" },
    ];

    directionGuideEntitiesRef.current = guides.flatMap(guide => {
      const point = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(guide.lon, guide.lat, 8),
        point: {
          pixelSize: 34,
          color: Cesium.Color.fromCssColorString(guide.color).withAlpha(0.92),
          outlineColor: Cesium.Color.WHITE.withAlpha(0.85),
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      const label = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(guide.lon, guide.lat, 10),
        label: {
          text: `${guide.text}\n${guide.sub}`,
          font: "bold 13px Malgun Gothic",
          fillColor: Cesium.Color.WHITE,
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
      return [point, label];
    });
  }

  function removeDirectionGuide() {
    if (!viewerRef.current) return;
    directionGuideEntitiesRef.current.forEach(entity => viewerRef.current.entities.remove(entity));
    directionGuideEntitiesRef.current = [];
  }

  function updateRoadStatusOverlay() {
    if (!viewerRef.current || !window.Cesium) return;
    roadStatusEntitiesRef.current.forEach(({ route, entity }) => {
      if (!entity?.polyline) return;
      entity.polyline.width = routeLineWidth(route);
      entity.polyline.material = routeLineMaterial(route);
    });
    viewerRef.current.scene.requestRender();
  }

  function routeLineWidth(route) {
    if (isOptimizedRef.current) return 9;
    return isRouteCongested(route) ? 10 : 6;
  }

  function routeLineMaterial(route) {
    const Cesium = window.Cesium;
    const optimized = isOptimizedRef.current;
    const congested = isRouteCongested(route);
    const color = optimized
      ? Cesium.Color.fromCssColorString("#22c55e").withAlpha(0.9)
      : !congested
        ? Cesium.Color.fromCssColorString("#38bdf8").withAlpha(0.38)
        : Cesium.Color.fromCssColorString("#ef4444").withAlpha(0.92);

    return new Cesium.PolylineGlowMaterialProperty({
      glowPower: optimized || congested ? 0.28 : 0.16,
      taperPower: 0.65,
      color,
    });
  }

  // ── 도로 경로 생성 ─────────────────────────────────────────────────────────
  // 정방향/역방향을 반드시 다른 groupIdx + 반대 laneSign으로 배정
  // phases: 백엔드에서 받은 신호 현시 배열 → 실제 도로 방향 추론에 사용
  function buildRoadLikeRoutes(crossroad, lon, lat, targetCrossroad = null, phases = []) {
    const linkedRoutes = buildLinkedCrossroadRoutes(crossroad, targetCrossroad, lon, lat);
    if (linkedRoutes.length > 0) return linkedRoutes;

    const manual = ROAD_WAYPOINTS[crossroad.intNo];
    if (manual) {
      return manual.map((route, idx) => makeRoute(
        resolveRoutePoints(route, lon, lat),
        idx,
        idx % 2 === 0 ? 1 : -1,
        route.phaseNos,
        route.label
      ));
    }

    // phases의 dirs에서 실제 도로 축 추론
    // "동↔서 직진", "남↔북 직진", "북→남 직진" 등의 패턴으로 방향 파악
    const phaseDirs = buildRoutesFromPhases(lon, lat, phases, crossroad.intNo);
    if (phaseDirs.length > 0) return phaseDirs;

    // 최종 fallback: 4방향 (WFS도 실패하고 phases도 없을 때만 사용)
    const rot = rotationMapRef.current[crossroad?.intNo] ?? 0;
    return SIM_DIRECTIONS.map((dir, idx) => {
      const pts = rotatePoints([
        [lon + dir.start[0], lat + dir.start[1]],
        [lon, lat],
        [lon + dir.end[0], lat + dir.end[1]],
      ], lon, lat, rot);
      return makeRoute(pts, idx, idx % 2 === 0 ? 1 : -1, dir.phaseNos, dir.label);
    });
  }

  // phases의 dirs 문자열에서 실제 도로 축(동서/남북/대각선)을 추론하여 경로 생성
  // dirs 예시: ["동↔서 직진"], ["남↔북 직진"], ["서→북 좌회전", "동→남 좌회전"]
  function buildRoutesFromPhases(lon, lat, phases, _intNo = null) {
    if (!phases?.length) return [];

    const H = FALLBACK_ROUTE_HALF_LENGTH_DEG;
    const routes = [];
    let axisIdx = 0;

    // 방향 키워드 → [lonOffset, latOffset] 맵핑
    const DIR_VECTOR = {
      "동": [H, 0], "서": [-H, 0], "북": [0, H], "남": [0, -H],
      "북동": [H * 0.71, H * 0.71], "남서": [-H * 0.71, -H * 0.71],
      "북서": [-H * 0.71, H * 0.71], "남동": [H * 0.71, -H * 0.71],
    };

    // 이미 추가한 축 중복 방지 (각도 차이 30° 이하면 같은 축으로 간주)
    const addedAngles = [];

    phases.forEach(phase => {
      (phase.dirs ?? []).forEach(dir => {
        if (dir === "전적색" || dir === "보행") return;

        // "동↔서 직진", "남→북 직진", "서→북 좌회전" 등에서 방향어 추출
        const tokens = dir.match(/[동서남북]{1,2}/g) ?? [];
        if (tokens.length < 1) return;

        const from = tokens[0];
        const to   = tokens[1] ?? oppositeDir(from);
        const fromVec = DIR_VECTOR[from];
        const toVec   = DIR_VECTOR[to];
        if (!fromVec || !toVec) return;

        // 이 축의 각도 계산 (중복 방지)
        const angle = Math.atan2(toVec[1] - fromVec[1], toVec[0] - fromVec[0]);
        const normAngle = ((angle % Math.PI) + Math.PI) % Math.PI;
        const isDuplicate = addedAngles.some(a => Math.abs(a - normAngle) < 0.52); // 30°
        if (isDuplicate) return;
        addedAngles.push(normAngle);

        const phaseNos = [phase.no];
        // 같은 축을 가진 다른 현시도 포함 (예: 현시1과 현시3이 모두 남북 직진)
        phases.forEach(p2 => {
          if (p2.no === phase.no) return;
          (p2.dirs ?? []).forEach(d2 => {
            const t2 = d2.match(/[동서남북]{1,2}/g) ?? [];
            if (!t2.length) return;
            const f2 = t2[0], t2e = t2[1] ?? oppositeDir(t2[0]);
            const v2f = DIR_VECTOR[f2], v2t = DIR_VECTOR[t2e];
            if (!v2f || !v2t) return;
            const a2 = Math.atan2(v2t[1] - v2f[1], v2t[0] - v2f[0]);
            const na2 = ((a2 % Math.PI) + Math.PI) % Math.PI;
            if (Math.abs(na2 - normAngle) < 0.52 && !phaseNos.includes(p2.no)) {
              phaseNos.push(p2.no);
            }
          });
        });

        // intNo는 buildRoutesFromPhases 호출 시 closure로 전달
        const rot = rotationMapRef.current[_intNo] ?? 0;
        // 정방향: from → to
        routes.push(makeRoute(rotatePoints([
          [lon + fromVec[0], lat + fromVec[1]],
          [lon, lat],
          [lon + toVec[0],   lat + toVec[1]],
        ], lon, lat, rot), axisIdx * 2, 1, phaseNos, `phase-${from}-${to}`));

        // 역방향: to → from
        routes.push(makeRoute(rotatePoints([
          [lon + toVec[0],   lat + toVec[1]],
          [lon, lat],
          [lon + fromVec[0], lat + fromVec[1]],
        ], lon, lat, rot), axisIdx * 2 + 1, -1, phaseNos, `phase-${to}-${from}`));

        axisIdx++;
      });
    });

    return routes;
  }

  // 방향 반대어 헬퍼
  function oppositeDir(dir) {
    const map = { "동": "서", "서": "동", "북": "남", "남": "북", "북동": "남서", "남서": "북동", "북서": "남동", "남동": "북서" };
    return map[dir] ?? dir;
  }

  function resolveRoutePoints(route, lon, lat) {
    if (route.points) return route.points;
    return (route.relativePoints || []).map(([dx, dy]) => [lon + dx, lat + dy]);
  }

  function buildLinkedCrossroadRoutes(crossroad, targetCrossroad, lon, lat) {
    if (!targetCrossroad || targetCrossroad.intNo === crossroad.intNo) return [];
    const targetLon = toCoord(targetCrossroad.xCoord);
    const targetLat = toCoord(targetCrossroad.yCoord);
    if (!targetLon || !targetLat) return [];

    const dist = distanceMeters([lon, lat], [targetLon, targetLat]);
    if (dist < 30 || dist > 2500) return [];

    const angle = Math.atan2(targetLat - lat, targetLon - lon);
    const approachMeters = Math.min(90, Math.max(35, dist * 0.18));
    const approachDeg = metersToDegrees(approachMeters, lat);
    const dx = Math.cos(angle) * approachDeg.lon;
    const dy = Math.sin(angle) * approachDeg.lat;
    const midLon = (lon + targetLon) / 2;
    const midLat = (lat + targetLat) / 2;
    const phaseNos = [1, 3];

    const fwd = [
      [lon - dx, lat - dy],
      [lon, lat],
      [midLon, midLat],
      [targetLon, targetLat],
      [targetLon + dx, targetLat + dy],
    ];
    const rev = [
      [targetLon + dx, targetLat + dy],
      [targetLon, targetLat],
      [midLon, midLat],
      [lon, lat],
      [lon - dx, lat - dy],
    ];

    return [
      makeRoute(fwd, 0, 1, phaseNos, `linked-${crossroad.intNo}-${targetCrossroad.intNo}`),
      makeRoute(rev, 1, -1, phaseNos, `linked-${targetCrossroad.intNo}-${crossroad.intNo}`),
    ];
  }

  function selectDiverseRoadPairs(pairs) {
    const sorted = pairs
      .map(pair => ({
        ...pair,
        axis: normalizeAxisAngle(Math.atan2(pair.b.lat - pair.a.lat, pair.b.lon - pair.a.lon)),
      }))
      .sort((a, b) => a.score - b.score);

    const selected = [];
    for (const pair of sorted) {
      const duplicatedAxis = selected.some(prev => axisAngleDiff(prev.axis, pair.axis) < Math.PI / 5);
      if (!duplicatedAxis) selected.push(pair);
      if (selected.length === 2) break;
    }
    return selected.length >= 2 ? selected : sorted.slice(0, 2);
  }

  function makeLocalAxisRoutes(lon, lat, angle, axisIdx) {
    const dx = Math.cos(angle) * FALLBACK_ROUTE_HALF_LENGTH_DEG;
    const dy = Math.sin(angle) * FALLBACK_ROUTE_HALF_LENGTH_DEG;
    const phaseNos = phaseNosForAxis(axisIdx);
    const fwd = [[lon - dx, lat - dy], [lon, lat], [lon + dx, lat + dy]];
    const rev = [[lon + dx, lat + dy], [lon, lat], [lon - dx, lat - dy]];
    return [
      makeRoute(fwd, axisIdx * 2, 1, phaseNos, `local-axis-${axisIdx}-fwd`),
      makeRoute(rev, axisIdx * 2 + 1, -1, phaseNos, `local-axis-${axisIdx}-rev`),
    ];
  }

  function normalizeAxisAngle(angle) {
    const pi = Math.PI;
    return ((angle % pi) + pi) % pi;
  }

  function axisAngleDiff(a, b) {
    const diff = Math.abs(a - b);
    return Math.min(diff, Math.PI - diff);
  }

  function phaseNosForAxis(axisIdx) {
    return axisIdx % 2 === 0 ? [1, 3] : [2, 4];
  }

  function isRouteGreen(route, phaseNo) {
    if (phaseNo == null) return route.groupIdx === 0;
    if (Array.isArray(route.phaseNos) && route.phaseNos.length > 0) {
      return route.phaseNos.includes(Number(phaseNo));
    }
    return route.groupIdx === (Number(phaseNo) - 1) % 2;
  }

  function makeRoute(points, groupIdx, laneSign, phaseNos = [], label = null) {
    const first = points[0];
    const last = points[points.length - 1];
    return {
      points,
      groupIdx,
      laneSign,
      phaseNos,
      label,
      lengthMeters: routeLengthMeters(points),
      heading: bearingDeg(first[0], first[1], last[0], last[1]),
    };
  }

  function liveSpeedKph() {
    const speed = Number(trafficContextRef.current?.speedKph);
    return Number.isFinite(speed) && speed > 0 ? speed : DEFAULT_SPEED_KPH;
  }

  function routeSpeedKph(route, optimized, green) {
    const routeLive = Number(route.speedKph);
    const live = Number.isFinite(routeLive) && routeLive > 0 ? routeLive : liveSpeedKph();
    if (optimized) return Math.min(60, live + OPTIMIZED_SPEED_GAIN_KPH);
    if (!green) return Math.min(live, MIN_ROLL_SPEED_KPH);
    return live;
  }

  function isRouteCongested(route) {
    if (isOptimizedRef.current) return false;
    const speed = liveSpeedKph();
    return speed < 20 || !isRouteGreen(route, phaseIdxRef.current);
  }

  function speedKphToProgressPerSec(speedKph, lengthMeters) {
    const metersPerSecond = Math.max(0, speedKph) / 3.6;
    return (metersPerSecond * SIM_SECONDS_PER_REAL_SECOND) / Math.max(lengthMeters || 1, 1);
  }

  function routeLengthMeters(points) {
    let total = 0;
    for (let i = 0; i < points.length - 1; i++) {
      total += distanceMeters(points[i], points[i + 1]);
    }
    return Math.max(total, 1);
  }

  function distanceMeters(a, b) {
    const lat1 = a[1] * Math.PI / 180;
    const lat2 = b[1] * Math.PI / 180;
    const dLat = (b[1] - a[1]) * Math.PI / 180;
    const dLon = (b[0] - a[0]) * Math.PI / 180;
    const h = Math.sin(dLat / 2) ** 2
      + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  function metersToDegrees(meters, lat) {
    const latDeg = meters / 111320;
    const lonDeg = meters / (111320 * Math.cos(lat * Math.PI / 180) || 1);
    return { lon: lonDeg, lat: latDeg };
  }

  // 차선 오프셋: laneSign +1=우측, -1=좌측
  function pointOnRoute(route, progress, queueIdx) {
    const points = route.points;
    const p = Math.max(0, Math.min(1, progress));
    const segCount = Math.max(points.length - 1, 1);
    const raw = p * segCount;
    const segIdx = Math.min(Math.floor(raw), segCount - 1);
    const local = raw - segIdx;
    const a = points[segIdx];
    const b = points[Math.min(segIdx + 1, points.length - 1)];
    const cx = a[0] + (b[0] - a[0]) * local;
    const cy = a[1] + (b[1] - a[1]) * local;

    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;

    // 우측 법선: (dy/len, -dx/len), 좌측은 부호 반전
    const laneSpread = 0.000075 + (Math.floor(queueIdx / 2) * 0.000014);
    const routeSpread = (route.groupIdx % 2) * 0.000018;
    const offset = (laneSpread + routeSpread) * route.laneSign;
    return [
      cx + (dy / len) * offset,
      cy + (-dx / len) * offset,
    ];
  }

  // 교차로 중심(cx, cy) 기준으로 points를 deg도 회전
  function rotatePoints(points, cx, cy, deg) {
    if (!deg) return points;
    const rad = deg * Math.PI / 180;
    const cos = Math.cos(rad), sin = Math.sin(rad);
    return points.map(([lon, lat]) => {
      const dx = lon - cx, dy = lat - cy;
      return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
    });
  }

  function bearingDeg(lon1, lat1, lon2, lat2) {
    return (Math.atan2(lon2 - lon1, lat2 - lat1) * 180 / Math.PI + 360) % 360;
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

      {status && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(10,15,30,0.85)", zIndex: 30 }}>
          <div style={{ color: "#94a3b8", fontSize: 14 }}>{status}</div>
        </div>
      )}

      <div style={{ position: "absolute", top: 14, right: 14, background: "rgba(18,14,10,0.88)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "10px 14px", zIndex: 10, backdropFilter: "blur(4px)" }}>
        <div style={{ fontSize: 12, color: "#aab4c8", fontWeight: 700, marginBottom: 6 }}>신호 시뮬레이션</div>
        <div style={{ fontSize: 11, color: "#64748b" }}>🔵 교차로 마커 클릭</div>
        <div style={{ fontSize: 11, color: "#64748b", marginTop: 2, marginBottom: 10 }}>→ 실시간 신호 + 3D 차량</div>
        <div style={{
          width: 112, height: 112, margin: "0 auto 10px", position: "relative",
          border: "1px solid rgba(255,255,255,0.1)", borderRadius: "50%",
          background: "rgba(15,23,42,0.45)",
        }}>
          {[
            ["북", "N", "50%", 18, "#60a5fa"],
            ["동", "E", "calc(100% - 18px)", "50%", "#22c55e"],
            ["남", "S", "50%", "calc(100% - 18px)", "#f59e0b"],
            ["서", "W", 18, "50%", "#f43f5e"],
          ].map(([ko, en, left, top, color]) => (
            <div key={en} style={{
              position: "absolute", left, top, transform: "translate(-50%, -50%)",
              width: 34, height: 28, borderRadius: 4,
              display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              background: `${color}22`, border: `1px solid ${color}88`, color,
              fontSize: 10, fontWeight: 800, lineHeight: 1.05,
            }}>
              <span>{ko}</span>
              <span style={{ fontSize: 9, color: "#cbd5e1" }}>{en}</span>
            </div>
          ))}
          <div style={{
            position: "absolute", left: "50%", top: "50%", transform: "translate(-50%, -50%)",
            width: 10, height: 10, borderRadius: "50%", background: "#e2e8f0",
            boxShadow: "0 0 8px rgba(255,255,255,0.6)",
          }} />
        </div>
        <div style={{ fontSize: 11, color: trafficContext?.speedKph != null ? "#22c55e" : "#f59e0b", marginBottom: 4, fontWeight: 700 }}>
          {trafficContext?.speedKph != null
            ? `속도 ${Math.round(trafficContext.speedKph)}km/h ${trafficContext.realTime ? "실시간" : "보정/대기"}`
            : `속도 ${DEFAULT_SPEED_KPH}km/h 기본값`}
        </div>
        <div style={{ fontSize: 11, color: isOptimized ? "#22c55e" : "#ef4444", marginBottom: 6, fontWeight: 700 }}>
          {isOptimized ? "초록 선: 병목 완화" : "빨간 선: 병목/대기 구간"}
        </div>
        <div style={{
          fontSize: 10, marginBottom: 10, fontWeight: 600,
          color: wfsSource === "WFS" ? "#22c55e" : wfsSource === "폴백" ? "#f59e0b" : "#475569",
        }}>
          도로 소스: {wfsSource === "WFS" ? "🟢 GeoServer WFS" : wfsSource === "폴백" ? "🟡 수학적 폴백" : "⚪ 대기"}
        </div>
        <button onClick={toggleGlobe} style={{
          width: "100%", padding: "6px 10px", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer",
          border: `1px solid ${globeVisible ? "rgba(239,68,68,0.5)" : "rgba(34,197,94,0.5)"}`,
          background: globeVisible ? "rgba(239,68,68,0.12)" : "rgba(34,197,94,0.12)",
          color: globeVisible ? "#ef4444" : "#22c55e", transition: "all 0.2s",
        }}>
          {globeVisible ? "🌍 도로 숨기기" : "🌍 도로 표시"}
        </button>

        {/* 교차로별 도로 선 회전 조정 */}
        {selectedList.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <div style={{ fontSize: 11, color: "#94a3b8", fontWeight: 700, marginBottom: 6 }}>
              🔄 도로 선 회전 조정
            </div>
            {selectedList.map(cr => {
              const deg = rotationMap[cr.intNo] ?? 0;
              const setDeg = (v) => setRotationMap(prev => {
                const next = { ...prev, [cr.intNo]: v };
                rotationMapRef.current = next;
                return next;
              });
              return (
                <div key={cr.intNo} style={{ marginBottom: 10, padding: "8px 8px 6px", borderRadius: 4, background: "rgba(255,255,255,0.03)", border: "1px solid #1e293b" }}>
                  <div style={{ fontSize: 10, color: "#60a5fa", fontWeight: 700, marginBottom: 5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {cr.intNm}
                  </div>
                  <div style={{ display: "flex", gap: 4, marginBottom: 5 }}>
                    <button onClick={() => setDeg(Math.round(deg - 5))}
                      style={{ flex: 1, padding: "3px 0", borderRadius: 3, border: "1px solid #334155", background: "rgba(255,255,255,0.05)", color: "#94a3b8", fontSize: 12, cursor: "pointer" }}>
                      ↺ -5°
                    </button>
                    <button onClick={() => setDeg(Math.round(deg + 5))}
                      style={{ flex: 1, padding: "3px 0", borderRadius: 3, border: "1px solid #334155", background: "rgba(255,255,255,0.05)", color: "#94a3b8", fontSize: 12, cursor: "pointer" }}>
                      ↻ +5°
                    </button>
                  </div>
                  <input type="range" min={-90} max={90} step={1} value={deg}
                    onChange={e => setDeg(Number(e.target.value))}
                    style={{ width: "100%", accentColor: "#60a5fa", cursor: "pointer", marginBottom: 3 }}
                  />
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#475569" }}>
                    <span>-90°</span>
                    <span style={{ color: "#60a5fa", fontWeight: 700 }}>{deg > 0 ? `+${deg}` : deg}°</span>
                    <span>+90°</span>
                  </div>
                  {deg !== 0 && (
                    <button onClick={() => setDeg(0)}
                      style={{ width: "100%", marginTop: 4, padding: "3px 0", borderRadius: 3, border: "1px solid #334155", background: "rgba(255,255,255,0.05)", color: "#64748b", fontSize: 10, cursor: "pointer" }}>
                      초기화 (0°)
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div style={{ position: "absolute", top: 14, left: 14, background: "rgba(18,14,10,0.88)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 4, padding: "4px 12px", fontSize: 12, color: "#aab4c8", zIndex: 10, pointerEvents: "none", backdropFilter: "blur(4px)" }}>
        🚦 서울시 신호 교차로 {crossroads.length}개
      </div>

      {/* 첫 번째 마커 선택 후 두 번째 클릭 유도 배지 */}
      {selected && !linkedTarget && (
        <div style={{
          position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
          background: "rgba(245,158,11,0.15)", border: "1px solid rgba(245,158,11,0.5)",
          borderRadius: 20, padding: "6px 18px", fontSize: 12, color: "#f59e0b",
          fontWeight: 700, zIndex: 10, pointerEvents: "none",
          boxShadow: "0 0 12px rgba(245,158,11,0.2)",
        }}>
          🟠 인근 교차로를 클릭하면 구간이 연결됩니다
        </div>
      )}

      {/* 구간 연결 중 배지 */}
      {selected && linkedTarget && (
        <div style={{
          position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)",
          background: "rgba(34,197,94,0.12)", border: "1px solid rgba(34,197,94,0.5)",
          borderRadius: 20, padding: "6px 18px", fontSize: 12, color: "#22c55e",
          fontWeight: 700, zIndex: 10, pointerEvents: "none",
        }}>
          🔗 {selected.intNm} ↔ {linkedTarget.intNm} 구간 연결 중
        </div>
      )}

      {selected && !ROAD_WAYPOINTS[selected.intNo] && (
        <div style={{ position: "absolute", bottom: 14, left: 14, background: "rgba(234,179,8,0.12)", border: "1px solid rgba(234,179,8,0.3)", borderRadius: 4, padding: "6px 12px", fontSize: 11, color: "#eab308", zIndex: 10, pointerEvents: "none" }}>
          ⚠ 이 교차로는 도로 경로 미등록 — 임시 차량 표시 중
        </div>
      )}
    </div>
  );
}

function createMarkerCanvas(color, radius) {
  const size = radius * 2 + 4;
  const canvas = document.createElement("canvas");
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, radius, 0, Math.PI * 2);
  ctx.fillStyle = color; ctx.fill();
  ctx.strokeStyle = "rgba(96,165,250,0.8)"; ctx.lineWidth = 2; ctx.stroke();
  return canvas.toDataURL();
}

function createCarCanvas(heading, dirIdx) {
  const canvas = document.createElement("canvas");
  canvas.width = 68; canvas.height = 40;
  const ctx = canvas.getContext("2d");
  const colors = ["#22c55e", "#f59e0b", "#38bdf8", "#f43f5e"];

  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.rotate(((heading - 90) * Math.PI) / 180);
  ctx.shadowColor = "rgba(0,0,0,0.65)"; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;

  ctx.fillStyle = colors[dirIdx % colors.length];
  roundRect(ctx, -23, -10, 46, 20, 6); ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.82)";
  roundRect(ctx, -8, -7, 14, 14, 4); ctx.fill();

  ctx.fillStyle = "#0f172a"; ctx.beginPath();
  ctx.arc(-15, -10, 4, 0, Math.PI * 2); ctx.arc(15, -10, 4, 0, Math.PI * 2);
  ctx.arc(-15, 10, 4, 0, Math.PI * 2); ctx.arc(15, 10, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ffffff"; ctx.beginPath();
  ctx.moveTo(26, 0); ctx.lineTo(17, -6); ctx.lineTo(17, 6);
  ctx.closePath(); ctx.fill();

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