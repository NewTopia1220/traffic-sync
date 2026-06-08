// 차량 애니메이션, 신호 판정, 오버레이 렌더링 훅
import { useRef, useState } from "react";
import {
  distanceMeters, routeBearingDeg, offsetRoutePoints,
  offsetPointByMetersForCamera, perpendicularDistanceToSegmentMeters, angleDiffDeg,
  getCrLonLat,
} from "../utils/geoUtils";
import {
  routeLengthMeters, interpolateRoute, getCongestionColor, getDirectionalSpeedKph,
  getDirectionalCongestion, normalizeCongestion, getSelectedDirectionKey,
  getRouteTrafficSegments, getSpeedAtProgress,
} from "../utils/routeUtils";
import {
  getCurrentPhaseNo, getVehicleFollowingPhaseNo, isCurrentPhaseGreenForVehicle,
  bearingToCompass, oppositeCompass,
} from "../utils/signalUtils";
import {
  createMarkerCanvas, createSignalCanvas, createDirectionalSpeedLabelCanvas,
} from "../utils/canvasUtils";

const CAR_MODEL_URI = "/models/car.glb";
const CAR_MODEL_SCALE = 0.06;
const CAR_MODEL_HEADING_OFFSET_DEG = -90;
const SIMULATION_TIME_SCALE = 18;

/**
 * @param {{
 *   viewerRef, routePointsRef, viaCrossroadsRef, startRef, endRef,
 *   routeTrafficRef, fetchSignalCtx, getBackendMovementForNode, getReverseBackendMovementForNode,
 *   isOptimized, driveView, onCurrentSignalChange,
 * }}
 */
export function useCarAnimation({
  viewerRef,
  routePointsRef,
  viaCrossroadsRef,
  startRef,
  endRef,
  routeTrafficRef,
  fetchSignalCtx,
  getBackendMovementForNode,
  getReverseBackendMovementForNode,
  isOptimized,
  driveView,
  onCurrentSignalChange,
}) {
  // driveView/isOptimized를 RAF 루프 내부에서 최신값으로 읽기 위해 ref 동기화
  const driveViewRef = useRef(driveView);
  driveViewRef.current = driveView;
  const isOptimizedRef = useRef(isOptimized);
  isOptimizedRef.current = isOptimized;

  const overlayEntitiesRef = useRef([]);
  const carEntityRef = useRef(null);
  const reverseCarEntityRef = useRef(null);
  const signalIndicatorRef = useRef(null);
  const animationRef = useRef(null);
  const progressRef = useRef(0);
  const reverseProgressRef = useRef(1);
  const lastTickRef = useRef(null);

  const signalCacheRef = useRef({});
  const signalFetchingRef = useRef(new Set());
  const currentSignalStatusRef = useRef(null);

  const stoppedAtRef = useRef(null);
  const stopProgressRef = useRef(null);
  const stoppedNodeProgressRef = useRef(null);
  const reverseStoppedAtRef = useRef(null);
  const reverseStopProgressRef = useRef(null);
  const reverseStoppedNodeProgressRef = useRef(null);

  const [simulationCompleted, setSimulationCompleted] = useState(false);

  // ─── 내부 유틸 ────────────────────────────────────────────────────────────

  function getCarBearingDeg(points, progress) {
    const totalLen = routeLengthMeters(points);
    if (!totalLen || points.length < 2) return null;
    let walked = 0;
    const target = progress * totalLen;
    for (let i = 0; i < points.length - 1; i++) {
      const segLen = distanceMeters(points[i], points[i + 1]);
      if (walked + segLen >= target) return routeBearingDeg(points[i], points[i + 1]);
      walked += segLen;
    }
    return routeBearingDeg(points[points.length - 2], points[points.length - 1]);
  }

  function getReverseCarBearingDeg(points, progress) {
    const current = interpolateRoute(points, progress);
    const prev = interpolateRoute(points, Math.max(progress - 0.012, 0));
    if (!current || !prev) return getCarBearingDeg(points, progress);
    return routeBearingDeg(current, prev);
  }

  function getRoadMaskWidth(points) {
    const d = routeLengthMeters(points);
    if (d < 150) return 28;
    if (d < 350) return 35;
    if (d < 600) return 40;
    if (d < 1000) return 45;
    if (d < 2000) return 50;
    return 60;
  }

  // ─── 경로 노드 진행도 ────────────────────────────────────────────────────

  function getRouteNodeType(node) {
    if (!node) return "unknown";
    if (startRef.current?.intNo === node.intNo) return "start";
    if (endRef.current?.intNo === node.intNo) return "end";
    const viaIdx = viaCrossroadsRef.current.findIndex(v => v.intNo === node.intNo);
    if (viaIdx >= 0) {
      const bottleneckIdx = viaCrossroadsRef.current.reduce((best, item, idx, arr) => {
        return Math.abs((item.routeProgress ?? 0.5) - 0.54) < Math.abs((arr[best].routeProgress ?? 0.5) - 0.54)
          ? idx : best;
      }, 0);
      return viaIdx === bottleneckIdx ? "bottleneck" : "waypoint";
    }
    return "unknown";
  }

  function getNodeRouteProgress(node) {
    const ll = getCrLonLat(node);
    if (!ll) return null;
    const points = routePointsRef.current;
    if (points.length < 2) return null;
    const totalLen = routeLengthMeters(points);
    if (!totalLen) return null;
    let bestProgress = null, bestDistance = Infinity, walked = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const seg = perpendicularDistanceToSegmentMeters(ll, points[i], points[i + 1]);
      const segLen = distanceMeters(points[i], points[i + 1]);
      if (seg.distance < bestDistance) {
        bestDistance = seg.distance;
        bestProgress = (walked + seg.progress * segLen) / totalLen;
      }
      walked += segLen;
    }
    return bestProgress === null ? null : { progress: bestProgress, distanceToRoute: bestDistance };
  }

  function getBearingAtProgress(progress) {
    const points = routePointsRef.current;
    if (!points || points.length < 2) return null;
    const before = interpolateRoute(points, Math.max(0, progress - 0.008));
    const after = interpolateRoute(points, Math.min(1, progress + 0.008));
    if (!before || !after || distanceMeters(before, after) < 0.5) return getCarBearingDeg(points, progress);
    return routeBearingDeg(before, after);
  }

  // ─── 신호 접근 방향/움직임 계산 ──────────────────────────────────────────

  function getApproachBearingAtProgress(nodeProgress, reverse = false) {
    const points = routePointsRef.current;
    const totalLen = routeLengthMeters(points);
    if (!points?.length || !totalLen || nodeProgress == null) return null;
    const sample = Math.min(40 / totalLen, 0.02);
    if (reverse) {
      const from = interpolateRoute(points, Math.min(1, nodeProgress + sample));
      const to = interpolateRoute(points, nodeProgress);
      return from && to ? routeBearingDeg(from, to) : null;
    }
    const from = interpolateRoute(points, Math.max(0, nodeProgress - sample));
    const to = interpolateRoute(points, nodeProgress);
    return from && to ? routeBearingDeg(from, to) : null;
  }

  function getMovementTowardNode(currentProgress, nodeProgress, reverse = false) {
    const points = routePointsRef.current;
    const totalLen = routeLengthMeters(points);
    if (!points?.length || !totalLen || currentProgress == null || nodeProgress == null) return null;
    const sample = Math.min(70 / totalLen, 0.05);
    if (reverse) {
      const before = interpolateRoute(points, Math.min(1, nodeProgress + sample));
      const center = interpolateRoute(points, nodeProgress);
      const after = interpolateRoute(points, Math.max(0, nodeProgress - sample));
      if (!before || !center || !after) return null;
      return {
        from: oppositeCompass(bearingToCompass(routeBearingDeg(before, center))),
        to: bearingToCompass(routeBearingDeg(center, after)),
      };
    }
    const before = interpolateRoute(points, Math.max(0, Math.min(currentProgress, nodeProgress - sample)));
    const center = interpolateRoute(points, nodeProgress);
    const after = interpolateRoute(points, Math.min(1, nodeProgress + sample));
    if (!before || !center || !after) return null;
    return {
      from: oppositeCompass(bearingToCompass(routeBearingDeg(before, center))),
      to: bearingToCompass(routeBearingDeg(center, after)),
    };
  }

  function getTurnAwareMovementNearNode(currentProgress, nodeProgress, reverse = false) {
    const points = routePointsRef.current;
    const totalLen = routeLengthMeters(points);
    if (!points?.length || !totalLen || currentProgress == null || nodeProgress == null) return null;
    const searchRange = Math.min(140 / totalLen, 0.12);
    const sample = Math.min(45 / totalLen, 0.05);
    const step = Math.min(10 / totalLen, 0.01);
    const start = reverse
      ? Math.max(sample, nodeProgress - searchRange)
      : Math.max(sample, currentProgress, nodeProgress - searchRange);
    const end = reverse
      ? Math.min(1 - sample, currentProgress, nodeProgress + searchRange)
      : Math.min(1 - sample, nodeProgress + searchRange);
    if (end <= start) return null;
    let bestProgress = null, bestTurn = -1;
    for (let p = start; p <= end; p += step) {
      const before = interpolateRoute(points, p - sample);
      const center = interpolateRoute(points, p);
      const after = interpolateRoute(points, p + sample);
      if (!before || !center || !after) continue;
      const turn = angleDiffDeg(routeBearingDeg(before, center), routeBearingDeg(center, after));
      if (turn > bestTurn) { bestTurn = turn; bestProgress = p; }
    }
    if (bestProgress == null || bestTurn < 25) return null;
    const before = interpolateRoute(points, reverse ? bestProgress + sample : bestProgress - sample);
    const center = interpolateRoute(points, bestProgress);
    const after = interpolateRoute(points, reverse ? bestProgress - sample : bestProgress + sample);
    if (!before || !center || !after) return null;
    const approachBearing = routeBearingDeg(before, center);
    const exitBearing = routeBearingDeg(center, after);
    return {
      from: oppositeCompass(bearingToCompass(approachBearing)),
      to: bearingToCompass(exitBearing),
      approachBearing, exitBearing,
      turnProgress: bestProgress, turnDeg: bestTurn,
    };
  }

  // ─── 신호 상태 맵 ────────────────────────────────────────────────────────

  function buildRouteSignalStatusMap(nowMs = Date.now()) {
    const nodes = [
      startRef.current ? { ...startRef.current, type: "start" } : null,
      ...viaCrossroadsRef.current.map(n => ({ ...n, type: getRouteNodeType(n) })),
      endRef.current ? { ...endRef.current, type: "end" } : null,
    ].filter(Boolean);
    const result = {};
    nodes.forEach(node => {
      const routeInfo = getNodeRouteProgress(node);
      const progress = routeInfo?.progress ?? node.routeProgress ?? null;
      const bearing = progress == null ? null : getBearingAtProgress(progress);
      const cached = signalCacheRef.current[node.intNo];
      const ctx = cached?.ctx || null;
      const currentPhaseNo = ctx ? getCurrentPhaseNo(ctx, nowMs) : null;
      const movement = progress == null ? null : (
        getBackendMovementForNode(node.intNo)
        ?? getTurnAwareMovementNearNode(progressRef.current, progress, false)
        ?? getMovementTowardNode(progressRef.current, progress, false)
      );
      const vehiclePhaseNo = ctx ? getVehicleFollowingPhaseNo(ctx, bearing, movement) : null;
      const isGreen = ctx ? isCurrentPhaseGreenForVehicle(ctx, nowMs, bearing, movement) : null;
      result[String(node.intNo)] = {
        intNo: node.intNo, intNm: node.intNm,
        type: node.type || getRouteNodeType(node),
        metersAhead: progress == null || !routeLengthMeters(routePointsRef.current)
          ? null
          : Math.round((progress - progressRef.current) * routeLengthMeters(routePointsRef.current)),
        isRed: isGreen == null ? false : !isGreen,
        isGreen: isGreen == null ? false : isGreen,
        stateText: isGreen == null ? "신호 확인 중" : isGreen ? "통과가능" : "정지/대기",
        currentPhaseNo, phaseNo: vehiclePhaseNo,
        carBearingDeg: bearing == null ? null : Math.round(bearing),
        updatedAt: nowMs,
      };
      if (ctx == null && node.intNo) fetchSignalCtx(node.intNo, signalCacheRef, signalFetchingRef);
    });
    return result;
  }

  function emitCurrentSignalStatus(nextNode, isRedLight, cached = null, carBearingDeg = null, movement = null) {
    if (!onCurrentSignalChange) return;
    const nowMs = Date.now();
    const byIntNo = buildRouteSignalStatusMap(nowMs);
    if (!nextNode) {
      const key = `none|${Object.values(byIntNo).map(v => `${v.intNo}:${v.currentPhaseNo ?? ""}:${v.phaseNo ?? ""}:${v.isRed ? "R" : "G"}`).join(",")}`;
      if (currentSignalStatusRef.current !== key) {
        currentSignalStatusRef.current = key;
        onCurrentSignalChange({ byIntNo, activeIntNo: null, updatedAt: nowMs });
      }
      return;
    }
    const ctx = cached?.ctx || cached || null;
    const currentPhaseNo = ctx ? getCurrentPhaseNo(ctx, nowMs) : null;
    const vehiclePhaseNo = ctx ? getVehicleFollowingPhaseNo(ctx, carBearingDeg, movement) : null;
    const activeStatus = {
      intNo: nextNode.intNo, intNm: nextNode.intNm,
      type: nextNode.type || getRouteNodeType(nextNode.node),
      metersAhead: Math.max(0, Math.round(nextNode.metersAhead ?? 0)),
      isRed: !!isRedLight, isGreen: !isRedLight,
      stateText: isRedLight ? "빨간불 정지/감속" : "초록불 통과",
      currentPhaseNo, phaseNo: vehiclePhaseNo,
      carBearingDeg: carBearingDeg == null ? null : Math.round(carBearingDeg),
      updatedAt: nowMs,
    };
    byIntNo[String(nextNode.intNo)] = { ...(byIntNo[String(nextNode.intNo)] || {}), ...activeStatus };
    const status = { ...activeStatus, activeIntNo: nextNode.intNo, byIntNo };
    const key = [
      status.intNo, status.type, status.isRed ? "red" : "green", status.metersAhead,
      status.currentPhaseNo ?? "", status.phaseNo ?? "", status.carBearingDeg ?? "",
      Object.values(byIntNo).map(v => `${v.intNo}:${v.currentPhaseNo ?? ""}:${v.phaseNo ?? ""}:${v.isRed ? "R" : "G"}`).join(","),
    ].join("|");
    if (currentSignalStatusRef.current !== key) {
      currentSignalStatusRef.current = key;
      onCurrentSignalChange(status);
    }
  }

  // ─── 다음 신호 노드 탐색 ─────────────────────────────────────────────────

  function findNextSignalNode(currentProgress) {
    const points = routePointsRef.current;
    const totalLen = routeLengthMeters(points);
    if (!totalLen) return null;
    const allNodes = [...viaCrossroadsRef.current, endRef.current].filter(Boolean);
    let nearest = null;
    for (const node of allNodes) {
      const routeInfo = getNodeRouteProgress(node);
      if (!routeInfo) continue;
      const metersAhead = (routeInfo.progress - currentProgress) * totalLen;
      if (metersAhead > 0 && metersAhead < 90) {
        if (!nearest || metersAhead < nearest.metersAhead) {
          nearest = { intNo: node.intNo, intNm: node.intNm, type: getRouteNodeType(node), node, progress: routeInfo.progress, metersAhead };
        }
      }
    }
    return nearest;
  }

  function findNextReverseSignalNode(currentProgress) {
    const points = routePointsRef.current;
    const totalLen = routeLengthMeters(points);
    if (!totalLen) return null;
    const allNodes = [startRef.current, ...viaCrossroadsRef.current].filter(Boolean);
    let nearest = null;
    for (const node of allNodes) {
      const routeInfo = getNodeRouteProgress(node);
      if (!routeInfo) continue;
      const metersAhead = (currentProgress - routeInfo.progress) * totalLen;
      if (metersAhead > 0 && metersAhead < 90) {
        if (!nearest || metersAhead < nearest.metersAhead) {
          nearest = { intNo: node.intNo, intNm: node.intNm, type: getRouteNodeType(node), node, progress: routeInfo.progress, metersAhead };
        }
      }
    }
    return nearest;
  }

  // ─── 오버레이/카메라 ─────────────────────────────────────────────────────

  function clearOverlays() {
    const viewer = viewerRef.current;
    if (!viewer) return;
    overlayEntitiesRef.current.forEach(e => viewer.entities.remove(e));
    overlayEntitiesRef.current = [];
    if (carEntityRef.current) { viewer.entities.remove(carEntityRef.current); carEntityRef.current = null; }
    if (reverseCarEntityRef.current) { viewer.entities.remove(reverseCarEntityRef.current); reverseCarEntityRef.current = null; }
    if (signalIndicatorRef.current) { viewer.entities.remove(signalIndicatorRef.current); signalIndicatorRef.current = null; }
  }

  function stopAnimation(resetProgress = true) {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    lastTickRef.current = null;
    if (resetProgress) {
      progressRef.current = 0;
      reverseProgressRef.current = 1;
      setSimulationCompleted(false);
    }
    stoppedAtRef.current = null; stopProgressRef.current = null; stoppedNodeProgressRef.current = null;
    reverseStoppedAtRef.current = null; reverseStopProgressRef.current = null; reverseStoppedNodeProgressRef.current = null;
  }

  function restartRouteAnimation() {
    if (!routePointsRef.current || routePointsRef.current.length < 2) return;
    stopAnimation(true);
    animationRef.current = requestAnimationFrame(startCarAnimation);
  }

  function moveDriveCamera(point, headingDeg, instant = true) {
    if (!viewerRef.current || !window.Cesium || !point) return;
    const Cesium = window.Cesium;
    const cameraPoint = offsetPointByMetersForCamera(point, headingDeg + 180, 50);
    const destination = Cesium.Cartesian3.fromDegrees(cameraPoint.lon, cameraPoint.lat, 54);
    const view = {
      destination,
      orientation: { heading: Cesium.Math.toRadians(headingDeg), pitch: Cesium.Math.toRadians(-17), roll: 0 },
    };
    if (instant) viewerRef.current.camera.setView(view);
    else viewerRef.current.camera.flyTo({ ...view, duration: 0.45 });
  }

  function flyToSelectedArea(startLL, endLL, routePoints, driveViewOverride) {
    const dv = driveViewOverride ?? driveViewRef.current;
    if (!viewerRef.current || !window.Cesium || !startLL || dv) return;
    const Cesium = window.Cesium;
    if (endLL && routePoints?.length >= 2) {
      const mid = interpolateRoute(routePoints, 0.5);
      if (!mid) return;
      const dist = routeLengthMeters(routePoints);
      viewerRef.current.camera.flyToBoundingSphere(
        new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(mid.lon, mid.lat, 0), Math.max(120, dist * 0.45)),
        { offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(0), Cesium.Math.toRadians(-42), Math.max(900, Math.min(2600, dist * 1.5))), duration: 1.1 }
      );
      return;
    }
    viewerRef.current.camera.flyToBoundingSphere(
      new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(startLL.lon, startLL.lat, 0), 80),
      { offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(0), Cesium.Math.toRadians(-40), 650), duration: 1.0 }
    );
  }

  // ─── 경로 렌더링 ─────────────────────────────────────────────────────────

  function addRoadMask(viewer, Cesium, points) {
    if (!viewer || !Cesium || !points || points.length < 2) return null;
    return viewer.entities.add({
      corridor: {
        positions: Cesium.Cartesian3.fromDegreesArray(points.flatMap(p => [p.lon, p.lat])),
        width: getRoadMaskWidth(points),
        heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        material: Cesium.Color.fromCssColorString("#202428").withAlpha(0.92),
        outline: false,
        cornerType: Cesium.CornerType.MITERED,
        zIndex: 18,
      },
    });
  }

  function addRouteTrafficSegmentOverlays(viewer, Cesium, signalNodePoints) {
    const segments = getRouteTrafficSegments(routeTrafficRef.current);
    if (!viewer || !Cesium || !signalNodePoints || signalNodePoints.length < 2 || !segments.length) return;
    const count = Math.min(segments.length, signalNodePoints.length - 1);
    for (let i = 0; i < count; i++) {
      const from = signalNodePoints[i];
      const to = signalNodePoints[i + 1];
      if (!from || !to) continue;
      const segment = segments[i];
      const selectedDirectionKey = getSelectedDirectionKey(segment, routeTrafficRef.current);
      const selectedLaneLabel = selectedDirectionKey === "down" ? "하행" : "상행";
      const lanes = [{ key: selectedDirectionKey, label: selectedLaneLabel, offset: 12, labelOffset: 28 }];

      const segBasePoints = [from, to];

      lanes.forEach(lane => {
        const speed = getDirectionalSpeedKph(segment, lane.key);
        const congestion = getDirectionalCongestion(segment, lane.key);
        const color = getCongestionColor(congestion);
        const lanePoints = offsetRoutePoints(segBasePoints, lane.offset).filter(p => Number.isFinite(p.lon) && Number.isFinite(p.lat));
        const labelPoints = offsetRoutePoints(segBasePoints, lane.labelOffset).filter(p => Number.isFinite(p.lon) && Number.isFinite(p.lat));
        if (lanePoints.length < 2) return;
        try {
          overlayEntitiesRef.current.push(viewer.entities.add({
            polyline: {
              positions: Cesium.Cartesian3.fromDegreesArray(lanePoints.flatMap(p => [p.lon, p.lat])),
              width: normalizeCongestion(congestion) === "정체" ? 10 : 8,
              clampToGround: true,
              material: new Cesium.PolylineGlowMaterialProperty({
                glowPower: normalizeCongestion(congestion) === "정체" ? 0.42 : 0.28,
                taperPower: 0.65,
                color: Cesium.Color.fromCssColorString(color).withAlpha(1),
              }),
              zIndex: 42,
            },
          }));
        } catch (e) {
          console.warn("[SimMap] 속도선 엔티티 추가 실패:", e.message);
        }
        const mid = labelPoints.length >= 2
          ? { lon: (labelPoints[0].lon + labelPoints[1].lon) / 2, lat: (labelPoints[0].lat + labelPoints[1].lat) / 2 }
          : { lon: (from.lon + to.lon) / 2, lat: (from.lat + to.lat) / 2 };
        if (!Number.isFinite(mid.lon) || !Number.isFinite(mid.lat)) return;
        const isBottleneckLabel = normalizeCongestion(congestion) === "정체";
        try {
          overlayEntitiesRef.current.push(viewer.entities.add({
            position: Cesium.Cartesian3.fromDegrees(mid.lon, mid.lat, isBottleneckLabel ? 38 : 30),
            billboard: {
              image: createDirectionalSpeedLabelCanvas(lane.label, speed, congestion, segment?.axisName),
              width: isBottleneckLabel ? 138 : 124,
              height: isBottleneckLabel ? 66 : 46,
              verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
              heightReference: Cesium.HeightReference.NONE,
              disableDepthTestDistance: Number.POSITIVE_INFINITY,
            },
          }));
        } catch (e) {
          console.warn("[SimMap] 속도 라벨 엔티티 추가 실패:", e.message);
        }
      });
    }
  }

  function renderRouteSimulation(routePoints, viaCrossroads, startLL, endLL) {
    const Cesium = window.Cesium;
    const viewer = viewerRef.current;
    if (!viewer || !routePoints || routePoints.length < 2) return;

    const signalNodePoints = [startLL, ...(viaCrossroads || []).map(getCrLonLat).filter(Boolean), endLL].filter(Boolean);
    const displayPoints = routePoints;

    const roadMask = addRoadMask(viewer, Cesium, displayPoints);
    if (roadMask) overlayEntitiesRef.current.push(roadMask);

    overlayEntitiesRef.current.push(viewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(displayPoints.flatMap(p => [p.lon, p.lat])),
        width: 4, clampToGround: true,
        material: Cesium.PolylineDashMaterialProperty
          ? new Cesium.PolylineDashMaterialProperty({ color: Cesium.Color.fromCssColorString("#ffd21f").withAlpha(1), dashLength: 14 })
          : Cesium.Color.fromCssColorString("#ffd21f").withAlpha(1),
        zIndex: 34,
      },
    }));

    addRouteTrafficSegmentOverlays(viewer, Cesium, signalNodePoints);

    const rightLanePoints = offsetRoutePoints(displayPoints, 10);
    const leftLanePoints = offsetRoutePoints(displayPoints, -10);

    const firstRight = rightLanePoints[0];
    const secondRight = rightLanePoints[1];
    if (firstRight) {
      const position = Cesium.Cartesian3.fromDegrees(firstRight.lon, firstRight.lat, 2.2);
      const heading = secondRight ? Cesium.Math.toRadians(routeBearingDeg(firstRight, secondRight) + CAR_MODEL_HEADING_OFFSET_DEG) : 0;
      carEntityRef.current = viewer.entities.add({
        position,
        orientation: Cesium.Transforms.headingPitchRollQuaternion(position, new Cesium.HeadingPitchRoll(heading, 0, 0)),
        model: { uri: CAR_MODEL_URI, scale: CAR_MODEL_SCALE, minimumPixelSize: 22, maximumScale: 2, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, shadows: Cesium.ShadowMode.DISABLED, runAnimations: false },
      });
    }

    const firstLeft = leftLanePoints[leftLanePoints.length - 1];
    const secondLeft = leftLanePoints[leftLanePoints.length - 2];
    if (firstLeft) {
      const position = Cesium.Cartesian3.fromDegrees(firstLeft.lon, firstLeft.lat, 2.2);
      const heading = secondLeft ? Cesium.Math.toRadians(routeBearingDeg(firstLeft, secondLeft) + CAR_MODEL_HEADING_OFFSET_DEG) : 0;
      reverseCarEntityRef.current = viewer.entities.add({
        position,
        orientation: Cesium.Transforms.headingPitchRollQuaternion(position, new Cesium.HeadingPitchRoll(heading, 0, 0)),
        model: { uri: CAR_MODEL_URI, scale: CAR_MODEL_SCALE, minimumPixelSize: 22, maximumScale: 2, heightReference: Cesium.HeightReference.CLAMP_TO_GROUND, shadows: Cesium.ShadowMode.DISABLED, runAnimations: false },
      });
    }
  }

  // ─── 신호 인디케이터 ─────────────────────────────────────────────────────

  function updateSignalIndicator(isRedLight, carPos) {
    if (!viewerRef.current || !window.Cesium || !carPos) return;
    const Cesium = window.Cesium;
    const viewer = viewerRef.current;
    const indicatorHeight = 38;
    if (!signalIndicatorRef.current) {
      signalIndicatorRef.current = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(carPos.lon, carPos.lat, indicatorHeight),
        billboard: { image: createSignalCanvas(isRedLight), width: 30, height: 30, verticalOrigin: Cesium.VerticalOrigin.BOTTOM, heightReference: Cesium.HeightReference.NONE, disableDepthTestDistance: Number.POSITIVE_INFINITY },
      });
      return;
    }
    signalIndicatorRef.current.position = Cesium.Cartesian3.fromDegrees(carPos.lon, carPos.lat, indicatorHeight);
    signalIndicatorRef.current.billboard.image = createSignalCanvas(isRedLight);
  }

  // ─── 메인 애니메이션 루프 ────────────────────────────────────────────────

  function startCarAnimation(timestamp = performance.now()) {
    if (
      !viewerRef.current ||
      !carEntityRef.current ||
      !reverseCarEntityRef.current ||
      routePointsRef.current.length < 2
    ) return;

    const Cesium = window.Cesium;
    const viewer = viewerRef.current;
    const points = routePointsRef.current;
    const totalLen = routeLengthMeters(points);
    const dt = lastTickRef.current ? Math.min((timestamp - lastTickRef.current) / 1000, 0.08) : 0.016;
    lastTickRef.current = timestamp;

    const speedAtProgress = getSpeedAtProgress(routeTrafficRef.current, progressRef.current);
    const reverseSpeedAtProgress = getSpeedAtProgress(routeTrafficRef.current, reverseProgressRef.current);
    const fallbackSpeedKph = isOptimizedRef.current ? 34 : 24;
    const effectiveSpeedKph = speedAtProgress ?? fallbackSpeedKph;
    const effectiveReverseSpeedKph = reverseSpeedAtProgress ?? fallbackSpeedKph;
    const baseSpeed = totalLen ? (effectiveSpeedKph / 3.6) * SIMULATION_TIME_SCALE / totalLen : 0;
    const reverseBaseSpeed = totalLen ? (effectiveReverseSpeedKph / 3.6) * SIMULATION_TIME_SCALE / totalLen : 0;

    let isForwardRedLight = false;
    let isReverseRedLight = false;

    // 정방향 신호 판정
    const forwardNode = findNextSignalNode(progressRef.current);
    if (forwardNode && !stoppedAtRef.current) {
      const cached = signalCacheRef.current[forwardNode.intNo];
      if (cached?.ctx) {
        const carBearing = getApproachBearingAtProgress(forwardNode.progress, false);
        const movement = getBackendMovementForNode(forwardNode.intNo)
          ?? getTurnAwareMovementNearNode(progressRef.current, forwardNode.progress, false)
          ?? getMovementTowardNode(progressRef.current, forwardNode.progress, false);
        const green = isCurrentPhaseGreenForVehicle(cached.ctx, Date.now(), carBearing, movement);
        if (!green && totalLen) {
          const stopProgress = Math.max(0, forwardNode.progress - (35 / totalLen));
          if (stopProgress > progressRef.current) {
            isForwardRedLight = true;
            stoppedAtRef.current = forwardNode.intNo;
            stopProgressRef.current = stopProgress;
            stoppedNodeProgressRef.current = forwardNode.progress;
          } else if (forwardNode.metersAhead <= 18) {
            isForwardRedLight = true;
            stoppedAtRef.current = forwardNode.intNo;
            stopProgressRef.current = progressRef.current;
            stoppedNodeProgressRef.current = forwardNode.progress;
          }
        }
      } else {
        fetchSignalCtx(forwardNode.intNo, signalCacheRef, signalFetchingRef);
      }
    }

    if (stoppedAtRef.current) {
      const cached = signalCacheRef.current[stoppedAtRef.current];
      if (cached?.ctx) {
        const carBearing = getApproachBearingAtProgress(stoppedNodeProgressRef.current, false) ?? getCarBearingDeg(points, progressRef.current);
        const movement = getBackendMovementForNode(stoppedAtRef.current)
          ?? getTurnAwareMovementNearNode(progressRef.current, stoppedNodeProgressRef.current, false)
          ?? getMovementTowardNode(progressRef.current, stoppedNodeProgressRef.current, false);
        const green = isCurrentPhaseGreenForVehicle(cached.ctx, Date.now(), carBearing, movement);
        if (green) {
          stoppedAtRef.current = null; stopProgressRef.current = null; stoppedNodeProgressRef.current = null;
          isForwardRedLight = false;
        } else {
          isForwardRedLight = true;
        }
      } else {
        isForwardRedLight = true;
      }
      if (!cached || Date.now() - cached.fetchedAt > 10000) fetchSignalCtx(stoppedAtRef.current, signalCacheRef, signalFetchingRef);
    }

    const activeSignalNode = forwardNode || (stoppedAtRef.current
      ? { intNo: stoppedAtRef.current, intNm: signalCacheRef.current[stoppedAtRef.current]?.ctx?.intNm || "", type: "unknown", metersAhead: 0, progress: stoppedNodeProgressRef.current }
      : null);
    const carBearingForStatus = activeSignalNode?.progress != null
      ? getApproachBearingAtProgress(activeSignalNode.progress, false)
      : stoppedNodeProgressRef.current != null
        ? getApproachBearingAtProgress(stoppedNodeProgressRef.current, false)
        : getCarBearingDeg(points, progressRef.current);
    const movementForStatus = activeSignalNode?.intNo
      ? (getBackendMovementForNode(activeSignalNode.intNo) ?? getTurnAwareMovementNearNode(progressRef.current, activeSignalNode.progress, false) ?? getMovementTowardNode(progressRef.current, activeSignalNode.progress, false))
      : null;
    const activeCached = activeSignalNode?.intNo ? signalCacheRef.current[activeSignalNode.intNo] : null;
    emitCurrentSignalStatus(activeSignalNode, isForwardRedLight, activeCached, carBearingForStatus, movementForStatus);

    // 정방향 이동
    if (isForwardRedLight && stopProgressRef.current !== null) {
      if (stopProgressRef.current > progressRef.current) {
        progressRef.current = Math.min(stopProgressRef.current, progressRef.current + baseSpeed * 0.28 * dt);
      }
    } else {
      progressRef.current += baseSpeed * dt;
      if (progressRef.current >= 1) {
        progressRef.current = 1;
        stoppedAtRef.current = null; stopProgressRef.current = null; stoppedNodeProgressRef.current = null;
      }
    }

    // 역방향 신호 판정
    const reverseNode = findNextReverseSignalNode(reverseProgressRef.current);
    if (reverseNode && !reverseStoppedAtRef.current) {
      const cached = signalCacheRef.current[reverseNode.intNo];
      if (cached?.ctx) {
        const carBearing = getApproachBearingAtProgress(reverseNode.progress, true);
        const movement = getReverseBackendMovementForNode(reverseNode.intNo)
          ?? getTurnAwareMovementNearNode(reverseProgressRef.current, reverseNode.progress, true)
          ?? getMovementTowardNode(reverseProgressRef.current, reverseNode.progress, true);
        const green = isCurrentPhaseGreenForVehicle(cached.ctx, Date.now(), carBearing, movement);
        if (!green && totalLen) {
          const stopProgress = Math.min(1, reverseNode.progress + (35 / totalLen));
          if (stopProgress < reverseProgressRef.current) {
            isReverseRedLight = true;
            reverseStoppedAtRef.current = reverseNode.intNo;
            reverseStopProgressRef.current = stopProgress;
            reverseStoppedNodeProgressRef.current = reverseNode.progress;
          } else if (reverseNode.metersAhead <= 18) {
            isReverseRedLight = true;
            reverseStoppedAtRef.current = reverseNode.intNo;
            reverseStopProgressRef.current = reverseProgressRef.current;
            reverseStoppedNodeProgressRef.current = reverseNode.progress;
          }
        }
      } else {
        fetchSignalCtx(reverseNode.intNo, signalCacheRef, signalFetchingRef);
      }
    }

    if (reverseStoppedAtRef.current) {
      const cached = signalCacheRef.current[reverseStoppedAtRef.current];
      if (cached?.ctx) {
        const carBearing = getApproachBearingAtProgress(reverseStoppedNodeProgressRef.current, true) ?? getReverseCarBearingDeg(points, reverseProgressRef.current);
        const movement = getReverseBackendMovementForNode(reverseStoppedAtRef.current)
          ?? getTurnAwareMovementNearNode(reverseProgressRef.current, reverseStoppedNodeProgressRef.current, true)
          ?? getMovementTowardNode(reverseProgressRef.current, reverseStoppedNodeProgressRef.current, true);
        const green = isCurrentPhaseGreenForVehicle(cached.ctx, Date.now(), carBearing, movement);
        if (green) {
          reverseStoppedAtRef.current = null; reverseStopProgressRef.current = null; reverseStoppedNodeProgressRef.current = null;
          isReverseRedLight = false;
        } else {
          isReverseRedLight = true;
        }
      } else {
        isReverseRedLight = true;
      }
      if (!cached || Date.now() - cached.fetchedAt > 10000) fetchSignalCtx(reverseStoppedAtRef.current, signalCacheRef, signalFetchingRef);
    }

    // 역방향 이동
    if (isReverseRedLight && reverseStopProgressRef.current !== null) {
      if (reverseStopProgressRef.current < reverseProgressRef.current) {
        reverseProgressRef.current = Math.max(reverseStopProgressRef.current, reverseProgressRef.current - reverseBaseSpeed * 0.28 * dt);
      }
    } else {
      reverseProgressRef.current -= reverseBaseSpeed * dt;
      if (reverseProgressRef.current <= 0) {
        reverseProgressRef.current = 0;
        reverseStoppedAtRef.current = null; reverseStopProgressRef.current = null; reverseStoppedNodeProgressRef.current = null;
      }
    }

    // 차량 위치 업데이트
    const rightLanePoints = offsetRoutePoints(points, 10);
    const leftLanePoints = offsetRoutePoints(points, -10);
    const forwardPos = interpolateRoute(rightLanePoints, progressRef.current);
    const forwardNext = interpolateRoute(rightLanePoints, Math.min(progressRef.current + 0.012, 1));
    if (forwardPos && carEntityRef.current) {
      const position = Cesium.Cartesian3.fromDegrees(forwardPos.lon, forwardPos.lat, 2.2);
      const routeHeadingDeg = forwardNext ? routeBearingDeg(forwardPos, forwardNext) : Cesium.Math.toDegrees(viewer.camera.heading);
      carEntityRef.current.position = position;
      carEntityRef.current.orientation = Cesium.Transforms.headingPitchRollQuaternion(position, new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(routeHeadingDeg + CAR_MODEL_HEADING_OFFSET_DEG), 0, 0));
      updateSignalIndicator(isForwardRedLight, forwardPos);
      if (driveViewRef.current) moveDriveCamera(forwardPos, routeHeadingDeg, true);
    }

    const reversePos = interpolateRoute(leftLanePoints, reverseProgressRef.current);
    const reverseNext = interpolateRoute(leftLanePoints, Math.max(reverseProgressRef.current - 0.012, 0));
    if (reversePos && reverseCarEntityRef.current) {
      const position = Cesium.Cartesian3.fromDegrees(reversePos.lon, reversePos.lat, 2.2);
      const routeHeadingDeg = reverseNext ? routeBearingDeg(reversePos, reverseNext) : Cesium.Math.toDegrees(viewer.camera.heading);
      reverseCarEntityRef.current.position = position;
      reverseCarEntityRef.current.orientation = Cesium.Transforms.headingPitchRollQuaternion(position, new Cesium.HeadingPitchRoll(Cesium.Math.toRadians(routeHeadingDeg + CAR_MODEL_HEADING_OFFSET_DEG), 0, 0));
    }

    viewer.scene.requestRender();

    if (progressRef.current >= 1 && reverseProgressRef.current <= 0) {
      animationRef.current = null;
      lastTickRef.current = null;
      setSimulationCompleted(true);
      return;
    }

    animationRef.current = requestAnimationFrame(startCarAnimation);
  }

  return {
    overlayEntitiesRef,
    carEntityRef,
    reverseCarEntityRef,
    animationRef,
    progressRef,
    reverseProgressRef,
    signalCacheRef,
    signalFetchingRef,
    simulationCompleted,
    clearOverlays,
    stopAnimation,
    restartRouteAnimation,
    flyToSelectedArea,
    renderRouteSimulation,
    startCarAnimation,
    moveDriveCamera,
    emitCurrentSignalStatus,
  };
}
