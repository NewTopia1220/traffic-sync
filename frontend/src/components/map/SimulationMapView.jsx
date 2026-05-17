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
const CAR_GLB_URL = "/car.glb";

// 교차로별 도로 경로 좌표 (방향별 진입/진출 waypoints)
// 형식: { intNo: { "남→북": [[lon,lat], ...], "북→남": [...], ... } }
// 나중에 직접 좌표 추가하면 됨
const ROAD_WAYPOINTS = {};

export default function SimulationMapView({ selected, onSelect, phaseIdx }) {
  const containerRef   = useRef(null);
  const viewerRef      = useRef(null);
  const entityMapRef   = useRef({});
  const carEntitiesRef = useRef([]);
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
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
        viewerRef.current = null;
      }
    };
  }, [cesiumReady]);

  // 교차로 마커 렌더링
  useEffect(() => {
    if (!viewerRef.current || crossroads.length === 0) return;
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
        properties: { intNo: cr.intNo, intNm: cr.intNm },
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
          if (intNo) onSelect({ intNo, intNm });
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      viewer._simClickHandler = handler;
    }
  }, [crossroads, selected]);

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
    if (!viewerRef.current || !selected) return;
    updateCarMovement(phaseIdx);
  }, [phaseIdx]);

  // 차량 생성 함수
  function spawnCars(crossroad, currentPhaseIdx) {
    if (!viewerRef.current) return;
    const Cesium = window.Cesium;
    const viewer = viewerRef.current;

    // 기존 차량 제거
    carEntitiesRef.current.forEach(e => viewer.entities.remove(e));
    carEntitiesRef.current = [];

    const lon = toCoord(crossroad.xCoord);
    const lat = toCoord(crossroad.yCoord);
    if (!lon || !lat) return;

    const waypoints = ROAD_WAYPOINTS[crossroad.intNo];

    if (waypoints) {
      // 좌표가 등록된 교차로: 실제 도로 위에 차량 배치
      Object.entries(waypoints).forEach(([dir, points], dirIdx) => {
        for (let i = 0; i < 3; i++) {
          const startPt = points[i % points.length];
          const car = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(startPt[0], startPt[1], 2),
            model: {
              uri: CAR_GLB_URL,
              minimumPixelSize: 24,
              maximumScale: 8,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
            properties: { dirIdx, moving: false, points, ptIdx: i % points.length },
          });
          carEntitiesRef.current.push(car);
        }
      });
    } else {
      // 좌표 미등록: 교차로 주변 4방향에 임시 차량 배치
      const offsets = [
        { dx: 0,      dy: 0.001  },
        { dx: 0,      dy: -0.001 },
        { dx: 0.001,  dy: 0      },
        { dx: -0.001, dy: 0      },
      ];
      offsets.forEach((off, dirIdx) => {
        for (let i = 0; i < 2; i++) {
          const carLon = lon + off.dx * (1 + i * 0.3);
          const carLat = lat + off.dy * (1 + i * 0.3);
          const car = viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(carLon, carLat, 2),
            model: {
              uri: CAR_GLB_URL,
              minimumPixelSize: 20,
              maximumScale: 6,
              heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
            },
            properties: {
              dirIdx,
              moving: false,
              baseLon: lon + off.dx,
              baseLat: lat + off.dy,
              dx: off.dx,
              dy: off.dy,
            },
          });
          carEntitiesRef.current.push(car);
        }
      });
    }
  }

  // 신호 현시 기반 차량 이동 업데이트
  function updateCarMovement(currentPhaseIdx) {
    if (!viewerRef.current || carEntitiesRef.current.length === 0) return;
    const Cesium = window.Cesium;
    const viewer = viewerRef.current;

    carEntitiesRef.current.forEach((car, i) => {
      const props = car.properties;
      const dirIdx = props.dirIdx?.getValue() ?? i % 4;
      const isGreen = currentPhaseIdx != null && dirIdx + 1 === currentPhaseIdx;

      if (isGreen) {
        // 초록불: 교차로 방향으로 이동
        const points = props.points?.getValue();
        if (points && points.length > 1) {
          const ptIdx = (props.ptIdx?.getValue() ?? 0) + 1;
          const nextPt = points[ptIdx % points.length];
          car.position = Cesium.Cartesian3.fromDegrees(nextPt[0], nextPt[1], 2);
        } else {
          // 임시 차량: 교차로 중심 방향으로 이동
          const baseLon = props.baseLon?.getValue();
          const baseLat = props.baseLat?.getValue();
          const dx = props.dx?.getValue() ?? 0;
          const dy = props.dy?.getValue() ?? 0;
          if (baseLon != null) {
            car.position = Cesium.Cartesian3.fromDegrees(
              baseLon - dx * 0.5,
              baseLat - dy * 0.5,
              2
            );
          }
        }
      }
      // 빨간불: 현재 위치 유지 (정지)
    });
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
