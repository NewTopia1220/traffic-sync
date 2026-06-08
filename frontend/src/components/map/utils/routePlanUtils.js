// 경로 계획 순수 계산 유틸리티 (교차로 그래프 기반 경유지 탐색)
import { getCrLonLat, distanceMeters, perpendicularDistanceToSegmentMeters } from "./geoUtils";
import { routeLengthMeters, buildMarkerGraphRoute } from "./routeUtils";

// 정방향·역방향 경로를 모두 탐색해 더 짧은 쪽을 반환
export function buildStableMarkerGraphRoute(from, to, crossroads, totalDist) {
  const fromLL = getCrLonLat(from);
  const toLL = getCrLonLat(to);
  const fallback = { points: fromLL && toLL ? [fromLL, toLL] : [], viaCrossroads: [] };

  const forwardRoute = buildMarkerGraphRoute(from, to, crossroads, totalDist, getCrLonLat);
  const reverseRawRoute = buildMarkerGraphRoute(to, from, crossroads, totalDist, getCrLonLat);
  const reverseRoute = reverseRawRoute.points.length >= 2
    ? { points: [...reverseRawRoute.points].reverse(), viaCrossroads: [...reverseRawRoute.viaCrossroads].reverse() }
    : { points: [], viaCrossroads: [] };

  const candidates = [forwardRoute, reverseRoute]
    .filter(r => r.points?.length >= 2)
    .map(r => ({ ...r, distance: routeLengthMeters(r.points) }))
    .filter(r => Number.isFinite(r.distance) && r.distance > 0);

  if (!candidates.length) return fallback;

  candidates.sort((a, b) => {
    const aPenalty = Math.max(0, a.distance - totalDist);
    const bPenalty = Math.max(0, b.distance - totalDist);
    return (a.distance + aPenalty * 0.35) - (b.distance + bPenalty * 0.35);
  });

  return candidates[0];
}

// 폴리라인 위 최근접 투영점과 거리 반환
export function getRouteProgressOnPolyline(point, points) {
  if (!point || !points || points.length < 2) return null;
  const totalLen = routeLengthMeters(points);
  if (!totalLen) return null;

  let walked = 0;
  let bestProgress = 0;
  let bestDistance = Infinity;

  for (let i = 0; i < points.length - 1; i++) {
    const seg = perpendicularDistanceToSegmentMeters(point, points[i], points[i + 1]);
    const segLen = distanceMeters(points[i], points[i + 1]);
    if (seg.distance < bestDistance) {
      bestDistance = seg.distance;
      bestProgress = (walked + seg.progress * segLen) / totalLen;
    }
    walked += segLen;
  }

  return { progress: bestProgress, distance: bestDistance };
}

// 경로 근방의 교차로를 자동 경유지로 보강
export function expandRouteWithNearbyCrossroads(basePoints, baseVia, from, to, crossroads, totalDist) {
  if (!basePoints || basePoints.length < 2) return { points: basePoints || [], viaCrossroads: baseVia || [] };
  const fromLL = getCrLonLat(from);
  const toLL = getCrLonLat(to);
  if (!fromLL || !toLL) return { points: basePoints, viaCrossroads: baseVia || [] };

  const candidates = [];
  const seen = new Set([String(from?.intNo), String(to?.intNo)]);

  (baseVia || []).forEach(cr => {
    if (cr?.intNo != null) seen.add(String(cr.intNo));
    const ll = getCrLonLat(cr);
    const routeInfo = getRouteProgressOnPolyline(ll, basePoints);
    if (ll && routeInfo && routeInfo.progress > 0.02 && routeInfo.progress < 0.98) {
      candidates.push({ ...cr, __ll: ll, __progress: routeInfo.progress, __distance: routeInfo.distance });
    }
  });

  (crossroads || []).forEach(cr => {
    if (!cr || cr.intNo == null) return;
    const key = String(cr.intNo);
    if (seen.has(key)) return;
    const ll = getCrLonLat(cr);
    if (!ll) return;
    const routeInfo = getRouteProgressOnPolyline(ll, basePoints);
    if (!routeInfo) return;

    const detour = distanceMeters(fromLL, ll) + distanceMeters(ll, toLL);
    const isNearRoute = routeInfo.distance <= 85;
    const isBetweenEndpoints = routeInfo.progress > 0.035 && routeInfo.progress < 0.965;
    const isReasonableDetour = detour <= Math.max(totalDist * 1.55, totalDist + 500);

    if (!isNearRoute || !isBetweenEndpoints || !isReasonableDetour) return;
    candidates.push({ ...cr, __ll: ll, __progress: routeInfo.progress, __distance: routeInfo.distance });
    seen.add(key);
  });

  const ordered = candidates
    .sort((a, b) => a.__progress - b.__progress || a.__distance - b.__distance)
    .filter((cr, idx, arr) => {
      const prev = arr[idx - 1];
      if (!prev) return true;
      return distanceMeters(cr.__ll, prev.__ll) > 18;
    });

  return {
    points: [basePoints[0], ...ordered.map(cr => cr.__ll), basePoints[basePoints.length - 1]],
    viaCrossroads: ordered.map(cr => {
      const { __ll, __progress, __distance, ...rest } = cr;
      return { ...rest, routeProgress: __progress, routeDistanceMeters: Math.round(__distance) };
    }),
  };
}

// selectedList(출발지+경유지+목적지 배열)에서 전체 경로 포인트 + 경유 교차로 계산
export function buildRouteFromSelectedList(selectedList, crossroads) {
  if (!selectedList || selectedList.length < 2) return { points: [], viaCrossroads: [] };

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
    const segmentRoute = buildStableMarkerGraphRoute(from, to, crossroads, totalDist);
    const baseSegmentPoints = segmentRoute.points.length >= 2 ? segmentRoute.points : [fromLL, toLL];
    const expandedSegment = expandRouteWithNearbyCrossroads(
      baseSegmentPoints, segmentRoute.viaCrossroads, from, to, crossroads, totalDist
    );
    const segmentPoints = expandedSegment.points.length >= 2 ? expandedSegment.points : baseSegmentPoints;

    if (finalPoints.length === 0) finalPoints.push(segmentPoints[0]);
    finalPoints.push(...segmentPoints.slice(1));

    const segmentVia = [from, ...expandedSegment.viaCrossroads, to];
    segmentVia.forEach((cr, idx) => {
      const isFirstWholeStart = i === 0 && idx === 0;
      const isLastWholeEnd = i === selectedList.length - 2 && idx === segmentVia.length - 1;
      if (isFirstWholeStart || isLastWholeEnd) return;
      const key = String(cr.intNo);
      if (seenVia.has(key)) return;
      seenVia.add(key);
      finalVia.push({ ...cr, routeDistanceMeters: cr.routeDistanceMeters ?? 0 });
    });
  }

  const routeTotal = routeLengthMeters(finalPoints);
  const viaCrossroads = finalVia.map(cr => {
    const ll = getCrLonLat(cr);
    if (!ll || !routeTotal) return { ...cr, routeProgress: 0 };
    let bestProgress = 0, bestDistance = Infinity, walked = 0;
    for (let i = 0; i < finalPoints.length - 1; i++) {
      const seg = perpendicularDistanceToSegmentMeters(ll, finalPoints[i], finalPoints[i + 1]);
      const segLen = distanceMeters(finalPoints[i], finalPoints[i + 1]);
      if (seg.distance < bestDistance) {
        bestDistance = seg.distance;
        bestProgress = (walked + seg.progress * segLen) / routeTotal;
      }
      walked += segLen;
    }
    return { ...cr, routeProgress: bestProgress, routeDistanceMeters: Math.round(bestDistance) };
  }).sort((a, b) => a.routeProgress - b.routeProgress);

  return { points: finalPoints, viaCrossroads };
}
