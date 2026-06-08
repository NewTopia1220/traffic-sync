// 교통 링크 상태(색상, 혼잡도) 관련 유틸리티

const TRAFFIC_LINK_COLORS = {
  smooth: "#22c55e",
  slow: "#facc15",
  congested: "#ef2626",
  unknown: "#94a3b8",
};

export function normalizeTrafficLevel(status = {}) {
  const congestion = String(status.congestion || status.level || "").trim();
  if (congestion.includes("정체") || congestion.toLowerCase().includes("congest")) return "congested";
  if (congestion.includes("서행") || congestion.toLowerCase().includes("slow")) return "slow";
  if (congestion.includes("원활") || congestion.toLowerCase().includes("smooth")) return "smooth";

  const speed = Number(status.speedKph ?? status.speed);
  if (!Number.isFinite(speed)) return "unknown";
  if (speed < 15) return "congested";
  if (speed < 25) return "slow";
  return "smooth";
}

export function trafficColor(status = {}) {
  return TRAFFIC_LINK_COLORS[normalizeTrafficLevel(status)] || TRAFFIC_LINK_COLORS.unknown;
}

export function trafficWidth(status = {}) {
  const level = normalizeTrafficLevel(status);
  if (level === "congested") return 8;
  if (level === "slow") return 7;
  if (level === "smooth") return 6;
  return 5;
}

export function hasFreshTrafficSpeed(status = {}) {
  return status.speedStale !== true && Number.isFinite(Number(status.speedKph ?? status.speed));
}

// 새 속도 데이터가 있으면 갱신, 없으면 이전 속도 유지
export function mergeTrafficStatus(previous = {}, incoming = {}) {
  if (hasFreshTrafficSpeed(incoming)) return { ...previous, ...incoming };
  return {
    ...previous,
    ...incoming,
    speedKph: previous.speedKph,
    travelTimeSec: previous.travelTimeSec,
    congestion: previous.congestion,
    speedStale: previous.speedStale,
    lastFetchedAtMs: previous.lastFetchedAtMs,
  };
}

// 색상/너비가 실제로 바뀔 때만 Cesium 엔티티를 갱신하기 위한 판단 함수
export function shouldApplyTrafficColorUpdate(previous = {}, incoming = {}, next = {}) {
  if (!hasFreshTrafficSpeed(incoming)) return false;
  return trafficColor(previous) !== trafficColor(next) || trafficWidth(previous) !== trafficWidth(next);
}
