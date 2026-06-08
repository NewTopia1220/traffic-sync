// 지리/기하 계산 유틸리티 (좌표 변환, 거리, 방위각)

// VWorld 좌표 정수값(×1e-7) → degree 변환
export function toCoord(val) {
  const n = parseInt(val, 10);
  if (!n || isNaN(n)) return null;
  return n / 1e7;
}

// VWorld 교차로 객체에서 {lon, lat} 추출
export function getCrLonLat(cr) {
  const lon = cr?.lon ?? toCoord(cr?.xCoord);
  const lat = cr?.lat ?? toCoord(cr?.yCoord);
  if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null;
  return { lon, lat };
}

export function distanceMeters(a, b) {
  const lat1 = a.lat * Math.PI / 180;
  const lat2 = b.lat * Math.PI / 180;
  const dLat = (b.lat - a.lat) * Math.PI / 180;
  const dLon = (b.lon - a.lon) * Math.PI / 180;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function metersToDegrees(meters, lat) {
  const latDeg = meters / 111320;
  const lonDeg = meters / (111320 * Math.cos(lat * Math.PI / 180) || 1);
  return { lon: lonDeg, lat: latDeg };
}

export function offsetPointByMetersForCamera(point, bearingDeg, meters) {
  const rad = bearingDeg * Math.PI / 180;
  const dLat = (Math.cos(rad) * meters) / 111320;
  const dLon = (Math.sin(rad) * meters) / (111320 * Math.cos(point.lat * Math.PI / 180) || 1);
  return { lon: point.lon + dLon, lat: point.lat + dLat };
}

export function lonLatToLocalMeters(point, originLat) {
  const metersPerDegLat = 111320;
  const metersPerDegLon = 111320 * Math.cos(originLat * Math.PI / 180);
  return { x: point.lon * metersPerDegLon, y: point.lat * metersPerDegLat };
}

export function perpendicularDistanceToSegmentMeters(point, start, end) {
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

export function routeBearingDeg(a, b) {
  const originLat = (a.lat + b.lat) / 2;
  const am = lonLatToLocalMeters(a, originLat);
  const bm = lonLatToLocalMeters(b, originLat);
  return (Math.atan2(bm.x - am.x, bm.y - am.y) * 180 / Math.PI + 360) % 360;
}

export function angleDiffDeg(a, b) {
  const diff = Math.abs(((a - b + 540) % 360) - 180);
  return Math.min(diff, 360 - diff);
}

// 경로 포인트 배열을 수직 방향으로 offsetMeters만큼 평행이동 (차선 분리용)
export function offsetRoutePoints(points, offsetMeters) {
  if (!points || points.length < 2) return [];
  return points.map((point, idx) => {
    const prev = points[Math.max(0, idx - 1)];
    const next = points[Math.min(points.length - 1, idx + 1)];
    const originLat = point.lat;
    const a = lonLatToLocalMeters(prev, originLat);
    const b = lonLatToLocalMeters(next, originLat);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = dy / len;
    const ny = -dx / len;
    const metersPerDegLat = 111320;
    const metersPerDegLon = 111320 * Math.cos(originLat * Math.PI / 180) || 1;
    return {
      lon: point.lon + (nx * offsetMeters) / metersPerDegLon,
      lat: point.lat + (ny * offsetMeters) / metersPerDegLat,
    };
  });
}
