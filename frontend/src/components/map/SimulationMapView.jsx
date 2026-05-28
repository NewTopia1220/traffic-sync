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

function buildRouteViaNearbyCrossroads(startCr, endCr, crossroads) {
  const start = getCrLonLat(startCr);
  const end = getCrLonLat(endCr);
  if (!start || !end) return { points: [], viaCrossroads: [] };

  const totalDist = distanceMeters(start, end);
  if (!crossroads?.length || totalDist < 80) {
    return { points: [start, end], viaCrossroads: [] };
  }

  // 1차: 꺾인 도로처럼 보이는 경우를 먼저 처리합니다.
  // 출발지-목적지 직선만 보지 않고, 중간에 꺾이는 후보 마커를 하나 잡은 뒤
  // 출발지 → 꺾임점 주변 마커들 → 목적지 순서로 연결합니다.
  // 경유지가 2개 이상일 때 선이 이상하게 튀는 문제를 줄이기 위한 우선 경로입니다.
  const bendRoute = buildBendAwareMarkerRoute(startCr, endCr, crossroads, totalDist);
  if (bendRoute.points.length >= 2 && bendRoute.viaCrossroads.length >= 1) return bendRoute;

  // 2차: 지도 위 교차로 마커를 노드로 보고 가까운 마커끼리 연결한 최단 마커 경로를 찾습니다.
  const markerRoute = buildMarkerGraphRoute(startCr, endCr, crossroads, totalDist);
  if (markerRoute.points.length >= 2) return markerRoute;

  // 그래프 경로를 못 찾을 때만 최소 fallback으로 직선 주변 경유지를 사용합니다.
  const corridorMeters = Math.min(180, Math.max(60, totalDist * 0.1));
  const minGapMeters = Math.min(220, Math.max(90, totalDist / 8));
  const maxViaCount = Math.min(10, Math.max(2, Math.floor(totalDist / 220)));

  const candidates = crossroads
    .filter(cr => cr.intNo !== startCr?.intNo && cr.intNo !== endCr?.intNo)
    .map(cr => {
      const ll = getCrLonLat(cr);
      if (!ll) return null;
      const projected = perpendicularDistanceToSegmentMeters(ll, start, end);
      if (projected.progress <= 0.04 || projected.progress >= 0.96) return null;
      if (projected.distance > corridorMeters) return null;
      return { cr, ll, ...projected };
    })
    .filter(Boolean)
    .sort((a, b) => a.progress - b.progress || a.distance - b.distance);

  const selected = [];
  for (const cand of candidates) {
    if (selected.length >= maxViaCount) break;
    const duplicated = selected.some(prev => distanceMeters(prev.ll, cand.ll) < minGapMeters);
    if (!duplicated) selected.push(cand);
  }

  const ordered = selected.sort((a, b) => a.progress - b.progress);
  return {
    points: [start, ...ordered.map(item => item.ll), end],
    viaCrossroads: ordered.map(item => ({
      ...item.cr,
      routeProgress: item.progress,
      routeDistanceMeters: Math.round(item.distance),
    })),
  };
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

function buildSegmentMarkerChain(startLL, endLL, crossroads, excludeIds = new Set(), options = {}) {
  const total = distanceMeters(startLL, endLL);
  if (total < 40) return [];

  const corridorMeters = options.corridorMeters ?? Math.min(95, Math.max(45, total * 0.18));
  const minGapMeters = options.minGapMeters ?? Math.min(145, Math.max(65, total / 5));
  const maxCount = options.maxCount ?? Math.min(6, Math.max(1, Math.floor(total / 130)));

  const candidates = crossroads
    .filter(cr => !excludeIds.has(String(cr.intNo)))
    .map(cr => {
      const ll = getCrLonLat(cr);
      if (!ll) return null;
      const projected = perpendicularDistanceToSegmentMeters(ll, startLL, endLL);
      if (projected.progress <= 0.06 || projected.progress >= 0.94) return null;
      if (projected.distance > corridorMeters) return null;
      return { cr, ll, ...projected };
    })
    .filter(Boolean)
    .sort((a, b) => a.progress - b.progress || a.distance - b.distance);

  const selected = [];
  for (const cand of candidates) {
    if (selected.length >= maxCount) break;
    const duplicated = selected.some(prev => distanceMeters(prev.ll, cand.ll) < minGapMeters);
    if (!duplicated) selected.push(cand);
  }

  return selected.map(item => ({
    ...item.cr,
    ll: item.ll,
    segmentProgress: item.progress,
    segmentDistanceMeters: Math.round(item.distance),
  }));
}

function buildBendAwareMarkerRoute(startCr, endCr, crossroads, totalDist) {
  const start = getCrLonLat(startCr);
  const end = getCrLonLat(endCr);
  if (!start || !end || !crossroads?.length) return { points: [], viaCrossroads: [] };

  const straightBearing = routeBearingDeg(start, end);
  const baseExclude = new Set([String(startCr?.intNo), String(endCr?.intNo)]);
  const maxDetour = Math.max(520, totalDist * 1.15);
  const searchPad = metersToDegrees(Math.max(420, totalDist * 0.85), (start.lat + end.lat) / 2);
  const minLon = Math.min(start.lon, end.lon) - searchPad.lon;
  const maxLon = Math.max(start.lon, end.lon) + searchPad.lon;
  const minLat = Math.min(start.lat, end.lat) - searchPad.lat;
  const maxLat = Math.max(start.lat, end.lat) + searchPad.lat;

  const bendCandidates = crossroads
    .filter(cr => !baseExclude.has(String(cr.intNo)))
    .map(cr => {
      const ll = getCrLonLat(cr);
      if (!ll) return null;
      if (ll.lon < minLon || ll.lon > maxLon || ll.lat < minLat || ll.lat > maxLat) return null;

      const d1 = distanceMeters(start, ll);
      const d2 = distanceMeters(ll, end);
      if (d1 < 70 || d2 < 70) return null;

      const routeLen = d1 + d2;
      const detour = routeLen - totalDist;
      if (detour < 20 || detour > maxDetour) return null;

      const b1 = routeBearingDeg(start, ll);
      const b2 = routeBearingDeg(ll, end);
      const turn = angleDiffDeg(b1, b2);
      if (turn < 35 || turn > 150) return null;

      const straightProjected = perpendicularDistanceToSegmentMeters(ll, start, end);
      // 직선에서 어느 정도 떨어진 마커를 꺾임점으로 선호합니다.
      // 너무 직선 근처면 기존 직선/그래프 경로가 더 자연스럽습니다.
      if (straightProjected.distance < Math.min(45, totalDist * 0.08)) return null;

      const excludeWithBend = new Set([...baseExclude, String(cr.intNo)]);
      const chain1 = buildSegmentMarkerChain(start, ll, crossroads, excludeWithBend, {
        corridorMeters: 85,
        minGapMeters: 75,
        maxCount: 5,
      });
      const usedAfterChain1 = new Set([...excludeWithBend, ...chain1.map(item => String(item.intNo))]);
      const chain2 = buildSegmentMarkerChain(ll, end, crossroads, usedAfterChain1, {
        corridorMeters: 85,
        minGapMeters: 75,
        maxCount: 5,
      });

      const support = chain1.length + chain2.length;
      const turnBonus = Math.min(turn, 100) * 1.2;
      const supportBonus = support * 95;
      const score = detour * 0.85 + straightProjected.distance * 0.15 - turnBonus - supportBonus;

      return { cr, ll, routeLen, detour, turn, chain1, chain2, support, score };
    })
    .filter(Boolean)
    .sort((a, b) => a.score - b.score)
    .slice(0, 8);

  if (!bendCandidates.length) return { points: [], viaCrossroads: [] };

  const best = bendCandidates[0];
  const rawVia = [
    ...best.chain1,
    { ...best.cr, ll: best.ll, segmentProgress: 0.5, segmentDistanceMeters: 0, isBendPoint: true },
    ...best.chain2,
  ];

  // 같은 마커가 중복으로 들어오면 제거합니다.
  const seen = new Set();
  const via = rawVia.filter(item => {
    const key = String(item.intNo);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  if (!via.length) return { points: [], viaCrossroads: [] };

  const pathPoints = [start, ...via.map(item => item.ll), end];
  const routeTotal = routeLengthMeters(pathPoints) || totalDist;

  let acc = 0;
  const viaCrossroads = via.map((item, idx) => {
    acc += distanceMeters(pathPoints[idx], pathPoints[idx + 1]);
    const { ll, segmentProgress, segmentDistanceMeters, isBendPoint, ...crOnly } = item;
    return {
      ...crOnly,
      routeProgress: acc / routeTotal,
      routeDistanceMeters: segmentDistanceMeters ?? 0,
      isBendPoint: !!isBendPoint,
    };
  });

  return { points: pathPoints, viaCrossroads };
}

function buildMarkerGraphRoute(startCr, endCr, crossroads, totalDist) {
  const start = getCrLonLat(startCr);
  const end = getCrLonLat(endCr);
  if (!start || !end) return { points: [], viaCrossroads: [] };

  // 서울 교차로 마커 간격은 촘촘한 편이라, 너무 긴 간선을 허용하면
  // "마커를 따라가는 경로"가 아니라 다시 대각선 직선처럼 보입니다.
  // 그래서 기본 간선 길이를 짧게 두고, 경로가 없을 때만 조금 더 완화합니다.
  const edgeLimits = [
    Math.min(210, Math.max(120, totalDist * 0.23)),
    Math.min(280, Math.max(160, totalDist * 0.32)),
    Math.min(380, Math.max(220, totalDist * 0.42)),
  ];

  for (const maxEdgeMeters of edgeLimits) {
    const route = tryBuildMarkerGraphRoute(startCr, endCr, crossroads, totalDist, maxEdgeMeters);
    if (route.points.length >= 2) return route;
  }

  return { points: [], viaCrossroads: [] };
}

function tryBuildMarkerGraphRoute(startCr, endCr, crossroads, totalDist, maxEdgeMeters) {
  const start = getCrLonLat(startCr);
  const end = getCrLonLat(endCr);
  if (!start || !end) return { points: [], viaCrossroads: [] };

  const maxNodeCount = 420;
  const neighborLimit = 12;
  const detourLimit = Math.max(totalDist * 3.2, totalDist + 900);
  const bboxPad = metersToDegrees(Math.max(550, totalDist * 0.65), (start.lat + end.lat) / 2);

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
        // 직선에서 너무 멀리 떨어진 마커만 우선하지 않도록 하되,
        // ㄱ자 도로처럼 살짝 돌아가는 마커는 후보에 남겨둡니다.
        Math.max(0, detour - totalDist) * 0.42 +
        projected.distance * 0.58 +
        Math.abs(projected.progress - 0.5) * 35;

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

      // 시작점으로 되돌아가는 간선은 만들지 않습니다.
      if (j === 0) continue;

      const next = nodes[j];
      const d = distanceMeters(current.ll, next.ll);
      if (d > maxEdgeMeters) continue;

      // 출발지에서 목적지로 바로 가는 대각선 간선은 막습니다.
      // 그래야 중간 마커가 있을 때 실제 마커 체인을 따라갑니다.
      if (i === 0 && j === endIndex && middleNodes.length > 0 && totalDist > maxEdgeMeters * 0.9) {
        continue;
      }

      const currentToEnd = distanceMeters(current.ll, end);
      const nextToEnd = distanceMeters(next.ll, end);

      // 완전히 반대 방향으로 멀어지는 경우만 제외합니다.
      // 단, ㄱ자 경로에서는 잠깐 옆으로 이동해야 하므로 제한을 강하게 걸지 않습니다.
      if (j !== endIndex && i !== 0 && nextToEnd > currentToEnd + maxEdgeMeters * 0.9) {
        continue;
      }

      // 긴 간선을 강하게 벌점 처리해서 가까운 마커 여러 개를 이어가도록 유도합니다.
      const longEdgePenalty = Math.max(0, d - 120) * 2.8;
      const detourPenalty = Math.max(0, (next.detour ?? totalDist) - totalDist) * 0.06;
      const offLinePenalty = (next.projected?.distance ?? 0) * 0.025;

      // 진행률이 크게 뒤로 가는 경우에는 벌점만 주고 완전히 차단하지 않습니다.
      const backtrack =
        (current.projected && next.projected)
          ? Math.max(0, current.projected.progress - next.projected.progress) * 120
          : 0;

      candidates.push({
        to: j,
        weight: d + longEdgePenalty + detourPenalty + offLinePenalty + backtrack,
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

  // 출발지-목적지 직접 연결이면 마커 경로로 보이지 않으므로 실패 처리합니다.
  if (pathIndexes.length <= 2) return { points: [], viaCrossroads: [] };

  // 너무 촘촘한 중복 마커는 정리하되, 꺾이는 모양은 유지합니다.
  const pathNodes = compressMarkerPath(pathIndexes.map(idx => nodes[idx]));
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

function compressMarkerPath(pathNodes) {
  if (!pathNodes || pathNodes.length <= 3) return pathNodes || [];

  const compressed = [pathNodes[0]];

  for (let i = 1; i < pathNodes.length - 1; i++) {
    const prev = compressed[compressed.length - 1];
    const current = pathNodes[i];
    const next = pathNodes[i + 1];

    const prevDist = distanceMeters(prev.ll, current.ll);
    const nextDist = distanceMeters(current.ll, next.ll);

    // 너무 가까운 마커는 일부 정리합니다.
    if (prevDist < 55 && nextDist < 140) continue;

    compressed.push(current);
  }

  compressed.push(pathNodes[pathNodes.length - 1]);
  return compressed;
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

function routeLengthMeters(points) {
  if (!points || points.length < 2) return 0;
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) total += distanceMeters(points[i], points[i + 1]);
  return total;
}

// 병목구간은 임의 progress 위치가 아니라 실제 경로를 구성하는
// "마커 A → 마커 B" 사이 한 구간을 선택해서 표시합니다.
// 기본은 전체 경로의 중간 지점이 포함된 세그먼트를 선택하고,
// 너무 짧은 세그먼트가 선택되면 주변에서 더 긴 세그먼트를 선택합니다.
function getBottleneckSegment(routePoints) {
  if (!routePoints || routePoints.length < 2) return null;

  const segments = [];
  let total = 0;

  for (let i = 0; i < routePoints.length - 1; i++) {
    const from = routePoints[i];
    const to = routePoints[i + 1];
    const len = distanceMeters(from, to);
    if (len <= 0) continue;
    segments.push({ index: i, from, to, len, startMeter: total, endMeter: total + len });
    total += len;
  }

  if (!segments.length || total <= 0) return null;

  const middleMeter = total * 0.52;
  let selected = segments.find(seg => middleMeter >= seg.startMeter && middleMeter <= seg.endMeter) || segments[Math.floor(segments.length / 2)];

  // 가운데 세그먼트가 너무 짧으면 주변의 비교적 긴 세그먼트로 보정
  if (selected.len < 70 && segments.length > 1) {
    const centerIdx = selected.index;
    selected = [...segments]
      .sort((a, b) => {
        const aScore = Math.abs(a.index - centerIdx) * 120 - a.len;
        const bScore = Math.abs(b.index - centerIdx) * 120 - b.len;
        return aScore - bScore;
      })[0];
  }

  const trimRatio = selected.len > 180 ? 0.18 : selected.len > 90 ? 0.12 : 0.05;
  const start = interpolateBetweenPoints(selected.from, selected.to, trimRatio);
  const end = interpolateBetweenPoints(selected.from, selected.to, 1 - trimRatio);
  const mid = interpolateBetweenPoints(selected.from, selected.to, 0.5);

  return {
    ...selected,
    displayStart: start,
    displayEnd: end,
    labelPoint: mid,
  };
}

function interpolateBetweenPoints(a, b, t) {
  return {
    lon: a.lon + (b.lon - a.lon) * t,
    lat: a.lat + (b.lat - a.lat) * t,
  };
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

function formatSec(sec) {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}분 ${s}초` : `${s}초`;
}

export default function SimulationMapView({ selectedList = [], onSelect, isOptimized = false, onStatsChange, onAutoWaypointsChange }) {
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

  const start = selectedList[0] ?? null;
  const end = selectedList[1] ?? null;
  const startLL = getCrLonLat(start);
  const endLL = getCrLonLat(end);
  const routePlan = start && end ? buildRouteViaNearbyCrossroads(start, end, crossroads) : { points: [], viaCrossroads: [] };
  const routePoints = routePlan.points;
  const viaCrossroads = routePlan.viaCrossroads;

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
      orientation: { heading: Cesium.Math.toRadians(0), pitch: Cesium.Math.toRadians(-45), roll: 0 },
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
      const size = isStart || isEnd ? 18 : isVia ? 10 : 9;
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
          font: isVia ? "bold 11px Malgun Gothic" : "bold 12px Malgun Gothic",
          fillColor: Cesium.Color.fromCssColorString(isStart ? "#22c55e" : isEnd ? "#ef4444" : "#f59e0b"),
          outlineColor: Cesium.Color.BLACK,
          outlineWidth: 3,
          style: Cesium.LabelStyle.FILL_AND_OUTLINE,
          pixelOffset: new Cesium.Cartesian2(0, isVia ? -26 : -32),
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        } : undefined,
        properties: { intNo: cr.intNo, intNm: cr.intNm, xCoord: cr.xCoord, yCoord: cr.yCoord },
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
          if (intNo) onSelect?.({ intNo, intNm, xCoord, yCoord });
        }
      }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
      viewer._routeSimClickHandler = handler;
    }
  }, [crossroads, selectedList, cesiumReady, onSelect]);

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
  }, [selectedList, isOptimized, cesiumReady]);

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
    if (endLL) {
      const mid = interpolateRoute(routePoints, 0.5);
      const dist = routeLengthMeters(routePoints);
      viewerRef.current.camera.flyToBoundingSphere(
        new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(mid.lon, mid.lat, 0), Math.max(120, dist * 0.45)),
        {
          offset: new Cesium.HeadingPitchRange(
            Cesium.Math.toRadians(0),
            Cesium.Math.toRadians(-42),
            Math.max(900, Math.min(2600, dist * 1.5))
          ),
          duration: 1.1,
        }
      );
    } else {
      viewerRef.current.camera.flyToBoundingSphere(
        new Cesium.BoundingSphere(Cesium.Cartesian3.fromDegrees(startLL.lon, startLL.lat, 0), 80),
        {
          offset: new Cesium.HeadingPitchRange(Cesium.Math.toRadians(0), Cesium.Math.toRadians(-40), 650),
          duration: 1.0,
        }
      );
    }
  }

  function renderRouteSimulation() {
    const Cesium = window.Cesium;
    const viewer = viewerRef.current;
    const positions = routePoints.flatMap(p => [p.lon, p.lat]);

    overlayEntitiesRef.current.push(viewer.entities.add({
      polyline: {
        positions: Cesium.Cartesian3.fromDegreesArray(positions),
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


    // 경유지 마커는 위의 교차로 마커 렌더링 단계에서 이미 번호가 표시됩니다.
    // 여기서 point/label을 한 번 더 올리면 동일 위치에 주황 원이 중복되어
    // 경유지 1번 마커가 비정상적으로 커 보일 수 있으므로 중복 오버레이를 제거합니다.

    const bottleneckSegment = getBottleneckSegment(routePoints);
    if (bottleneckSegment) {
      overlayEntitiesRef.current.push(viewer.entities.add({
        polyline: {
          positions: Cesium.Cartesian3.fromDegreesArray([
            bottleneckSegment.displayStart.lon,
            bottleneckSegment.displayStart.lat,
            bottleneckSegment.displayEnd.lon,
            bottleneckSegment.displayEnd.lat,
          ]),
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

      overlayEntitiesRef.current.push(viewer.entities.add({
        position: Cesium.Cartesian3.fromDegrees(
          bottleneckSegment.labelPoint.lon,
          bottleneckSegment.labelPoint.lat,
          20
        ),
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
    if (p) carEntityRef.current.position = Cesium.Cartesian3.fromDegrees(p.lon, p.lat, 8);
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
        <div style={{ fontWeight: 800, color: "#60a5fa", marginBottom: 4 }}>🚦 경로 기반 신호 시뮬레이션</div>
        <div>1. 출발지 마커 클릭 → 2. 목적지 마커 클릭</div>
        <div style={{ color: "#fbbf24", marginTop: 3 }}>직선 주변 교차로를 자동 경유지로 연결합니다.</div>
      </div>

      {start && !end && (
        <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 10, padding: "8px 14px", borderRadius: 999, background: "rgba(34,197,94,0.16)", border: "1px solid rgba(34,197,94,0.4)", color: "#bbf7d0", fontSize: 12, fontWeight: 800 }}>
          출발지 선택됨: {start.intNm} · 목적지를 클릭하세요
        </div>
      )}

      {start && end && (
        <div style={{ position: "absolute", top: 14, left: "50%", transform: "translateX(-50%)", zIndex: 10, padding: "8px 14px", borderRadius: 999, background: isOptimized ? "rgba(34,197,94,0.16)" : "rgba(239,68,68,0.13)", border: `1px solid ${isOptimized ? "rgba(34,197,94,0.5)" : "rgba(239,68,68,0.4)"}`, color: isOptimized ? "#bbf7d0" : "#fecaca", fontSize: 12, fontWeight: 800 }}>
          {isOptimized ? "✅ 신호제어 적용: 병목 완화 구간 통과 중" : "🔴 현행 운영: 병목구간 발생"}
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
  ctx.beginPath(); ctx.arc(-18, 13, 5, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(18, 13, 5, 0, Math.PI * 2); ctx.fill();
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
