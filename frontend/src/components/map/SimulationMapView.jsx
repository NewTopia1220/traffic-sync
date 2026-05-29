import { useState, useEffect, useRef } from "react";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8080").replace(/\/+$/, "");
const VWORLD_KEY = import.meta.env.VITE_VWORLD_API_KEY || "";

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
}) {
  const containerRef = useRef(null);
  const viewerRef = useRef(null);
  const markerEntitiesRef = useRef({});
  const overlayEntitiesRef = useRef([]);
  const carEntityRef = useRef(null);
  const animationRef = useRef(null);
  const progressRef = useRef(0);
  const lastTickRef = useRef(null);

  const [crossroads, setCrossroads] = useState([]);
  const [cesiumReady, setCesiumReady] = useState(false);
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
    if (window.Cesium) {
      setCesiumReady(true);
      return;
    }

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

    const Cesium = window.Cesium;

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
      baseLayer: new Cesium.ImageryLayer(vworldProvider),
      terrainProvider: new Cesium.EllipsoidTerrainProvider(),
    });

    viewer.imageryLayers.removeAll();
    viewer.imageryLayers.addImageryProvider(vworldProvider);
    viewer.scene.globe.enableLighting = false;
    viewer.scene.backgroundColor = Cesium.Color.fromCssColorString("#0a0f1e");

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
      stopAnimation();
      clearOverlays();
      Object.values(markerEntitiesRef.current).forEach(e => viewer.entities.remove(e));
      markerEntitiesRef.current = {};
      if (viewerRef.current && !viewerRef.current.isDestroyed()) viewerRef.current.destroy();
      viewerRef.current = null;
    };
  }, [cesiumReady]);

  useEffect(() => {
    if (!cesiumReady || !viewerRef.current || crossroads.length === 0) return;

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

        // const cartesian = viewer.camera.pickEllipsoid(
        //   click.position,
        //   viewer.scene.globe.ellipsoid
        // );

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
    cesiumReady,
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
    if (!viewerRef.current || !window.Cesium) return;

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

    renderRouteSimulation();
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
  }, [selectedList, isOptimized, cesiumReady, routePlan]);

  function clearOverlays() {
    const viewer = viewerRef.current;
    if (!viewer) return;

    overlayEntitiesRef.current.forEach(entity => viewer.entities.remove(entity));
    overlayEntitiesRef.current = [];

    if (carEntityRef.current) {
      viewer.entities.remove(carEntityRef.current);
      carEntityRef.current = null;
    }
  }

  function stopAnimation() {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    animationRef.current = null;
    lastTickRef.current = null;
    progressRef.current = 0;
  }

  function flyToSelectedArea() {
    if (!viewerRef.current || !window.Cesium || !startLL) return;

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

  function renderRouteSimulation() {
    const Cesium = window.Cesium;
    const viewer = viewerRef.current;
    if (!viewer || routePoints.length < 2) return;

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

    viaCrossroads.forEach((cr, idx) => {
      const ll = getCrLonLat(cr);
      if (!ll) return;

      overlayEntitiesRef.current.push(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(ll.lon, ll.lat, 16),
        point: {
          pixelSize: 13,
          color: Cesium.Color.fromCssColorString("#f59e0b").withAlpha(0.95),
          outlineColor: Cesium.Color.WHITE.withAlpha(0.9),
          outlineWidth: 2,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: `자동 경유 ${idx + 1}`,
          font: "bold 11px Malgun Gothic",
          fillColor: Cesium.Color.fromCssColorString("#fbbf24"),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, -22),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      }));
    });

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
    if (first) {
      carEntityRef.current = viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(first.lon, first.lat, 8),
        billboard: {
          image: createCarCanvas(),
          width: 34,
          height: 22,
          verticalOrigin: Cesium.VerticalOrigin.CENTER,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }
  }

  function startCarAnimation(timestamp = performance.now()) {
    if (!viewerRef.current || !carEntityRef.current || routePoints.length < 2) return;

    const Cesium = window.Cesium;
    const dt = lastTickRef.current ? Math.min((timestamp - lastTickRef.current) / 1000, 0.08) : 0.016;
    lastTickRef.current = timestamp;

    const baseSpeed = isOptimized ? 0.055 : 0.035;
    const inBottleneck = progressRef.current > 0.45 && progressRef.current < 0.64;
    const speed = inBottleneck ? baseSpeed * (isOptimized ? 0.95 : 0.38) : baseSpeed;

    progressRef.current += speed * dt;
    if (progressRef.current > 1) progressRef.current = 0;

    const p = interpolateRoute(routePoints, progressRef.current);
    if (p) {
      carEntityRef.current.position = Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 8);
    }

    viewerRef.current.scene.requestRender();
    animationRef.current = requestAnimationFrame(startCarAnimation);
  }

  return (
    <div style={{ width: "100%", height: "100%", position: "relative", background: "#0a0f1e" }}>
      <div ref={containerRef} style={{ width: "100%", height: "100%" }} />

      {status && (
        <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", color: "#93c5fd", background: "rgba(10,15,30,0.85)", zIndex: 5 }}>
          {status}
        </div>
      )}

      <div style={{ position: "absolute", top: 14, left: 14, zIndex: 10, padding: "10px 14px", borderRadius: 6, background: "rgba(18,16,10,0.88)", border: "1px solid rgba(255,255,255,0.12)", color: "#dbeafe", fontSize: 12 }}>
        <div style={{ fontWeight: 800, color: "#60a5fa", marginBottom: 4 }}>경로 기반 신호 시뮬레이션</div>
        <div>1. 출발지 마커 클릭 → 2. 목적지 마커 클릭</div>
        <div style={{ color: "#fbbf24", marginTop: 3 }}>신호등 노드를 따라 경로를 연결합니다.</div>
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