// VWorld WebGL 3D 뷰어 초기화·정리 훅
import { useRef, useState, useEffect } from "react";

const VWORLD_KEY = import.meta.env.VITE_VWORLD_API_KEY || "";

function getVWorldApiKey() {
  const raw = String(VWORLD_KEY || "").trim();
  if (!raw) return "";
  if (raw.startsWith("http")) {
    try { return new URL(raw).searchParams.get("apiKey") || raw; } catch { return raw; }
  }
  return raw;
}

/**
 * @param {{ startLL, selectedGuLL, markerEntitiesRef, destroyCallbackRef }}
 *   destroyCallbackRef: 뷰어 정리 전 호출할 콜백 ref (stopAnimation, clearTrafficLayer 등)
 */
export function useVWorldViewer({ startLL, selectedGuLL, markerEntitiesRef, destroyCallbackRef }) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const vworldMapRef = useRef(null);
  const [cesiumReady, setCesiumReady] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [status, setStatus] = useState("VWorld 3D 지도 로딩 중...");

  // VWorld SDK 로드 대기
  useEffect(() => {
    const apiKey = getVWorldApiKey();
    if (!apiKey) {
      setStatus("VWorld API 키가 없습니다. .env의 VITE_VWORLD_API_KEY를 확인하세요.");
      return;
    }
    let alive = true;
    let count = 0;
    const wait = () => {
      if (!alive) return;
      if (window.vw && window.Cesium) { setCesiumReady(true); return; }
      if (++count >= 80) {
        setStatus("VWorld WebGL 3D API가 아직 로드되지 않았습니다. index.html에 webglMapInit.js.do script를 추가하세요.");
        return;
      }
      setTimeout(wait, 150);
    };
    wait();
    return () => { alive = false; };
  }, []);

  // VWorld SDK 내부 RangeError 브라우저 다이얼로그 억제 (WSViewerStartup.js PVS 계산 버그)
  useEffect(() => {
    const handler = (event) => {
      if (event.error instanceof RangeError && event.error.message?.includes("length")) {
        event.preventDefault();
        console.warn("[VWorld] RangeError 억제:", event.error.message);
        return true;
      }
    };
    window.addEventListener("error", handler);
    return () => window.removeEventListener("error", handler);
  }, []);

  // 뷰어 초기화 (cesiumReady 이후 1회)
  useEffect(() => {
    if (!cesiumReady || !containerRef.current || viewerRef.current) return;
    if (!window.vw) return;

    const Cesium = window.Cesium;
    const vw = window.vw;
    const center = startLL || selectedGuLL || { lon: 127.0396, lat: 37.5126 };
    const previousCallback = vw.ws3dInitCallBack;

    const applyViewerOptions = (viewer) => {
      if (!viewer || viewer.isDestroyed?.()) return false;
      viewer.scene.globe.enableLighting = false;
      viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#0a0f1e");
      viewer.scene.screenSpaceCameraController.enableRotate = true;
      viewer.scene.screenSpaceCameraController.enableTilt = true;
      viewer.scene.screenSpaceCameraController.enableZoom = true;
      viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 2);
      if (viewer.scene.postProcessStages?.fxaa) viewer.scene.postProcessStages.fxaa.enabled = true;

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
        orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-45), roll: 0 },
      });
      viewerRef.current = viewer;
      setMapReady(true);
      setStatus(null);
      return true;
    };

    const completeInit = () => {
      const viewer = window.ws3d?.viewer;
      if (!viewer) {
        setStatus("VWorld 3D viewer 초기화 대기 중...");
        setTimeout(completeInit, 200);
        return;
      }
      applyViewerOptions(viewer);
    };

    try {
      const existingViewer = window.ws3d?.viewer;
      if (existingViewer && !existingViewer.isDestroyed?.()) {
        applyViewerOptions(existingViewer);
      } else {
        const options = {
          mapId: containerRef.current.id,
          initPosition: new vw.CameraPosition(
            new vw.CoordZ(center.lon, center.lat, 1200),
            new vw.Direction(0, -45, 0)
          ),
          logo: false,
          navigation: true,
        };
        vw.ws3dInitCallBack = () => { previousCallback?.(); completeInit(); };
        const map = new vw.Map();
        map.setOption(options);
        map.start();
        vworldMapRef.current = map;
        setTimeout(completeInit, 600);
      }
    } catch (err) {
      console.error(err);
      const existingViewer = window.ws3d?.viewer;
      if (existingViewer && !existingViewer.isDestroyed?.()) {
        applyViewerOptions(existingViewer);
      } else {
        setStatus(`VWorld 3D 지도 초기화 실패: ${err.message}`);
      }
    }

    return () => {
      // 언마운트 시 다른 훅 정리 콜백 먼저 호출
      destroyCallbackRef?.current?.();
      const viewer = viewerRef.current;
      if (viewer && !viewer.isDestroyed?.()) {
        Object.values(markerEntitiesRef?.current || {}).forEach(e => viewer.entities.remove(e));
        if (viewer._routeSimClickHandler) {
          viewer._routeSimClickHandler.destroy?.();
          viewer._routeSimClickHandler = null;
        }
      }
      if (markerEntitiesRef) markerEntitiesRef.current = {};
      viewerRef.current = null;
      vworldMapRef.current = null;
      setMapReady(false);
      vw.ws3dInitCallBack = previousCallback;
    };
  }, [cesiumReady]);

  return { containerRef, viewerRef, vworldMapRef, mapReady, cesiumReady, status };
}
