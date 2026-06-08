// 신호계획 현시 판단 유틸리티 (차량 방향 매칭, 초록불/빨간불 판단)
import { angleDiffDeg, routeBearingDeg, lonLatToLocalMeters } from "./geoUtils";

export function bearingToCompass(bearingDeg) {
  const a = ((bearingDeg % 360) + 360) % 360;
  if (a < 23 || a >= 338) return "북";
  if (a < 68) return "북동";
  if (a < 113) return "동";
  if (a < 158) return "남동";
  if (a < 203) return "남";
  if (a < 248) return "남서";
  if (a < 293) return "서";
  return "북서";
}

export function oppositeCompass(compass) {
  const opposite = { 북: "남", 북동: "남서", 동: "서", 남동: "북서", 남: "북", 남서: "북동", 서: "동", 북서: "남동" };
  return opposite[compass] ?? null;
}

function compassToBearing(compass) {
  const map = { 북: 0, 북동: 45, 동: 90, 남동: 135, 남: 180, 남서: 225, 서: 270, 북서: 315 };
  return map[compass] ?? null;
}

function compassDiff(a, b) {
  const ad = compassToBearing(a);
  const bd = compassToBearing(b);
  if (ad == null || bd == null) return Infinity;
  return angleDiffDeg(ad, bd);
}

function parseDirMovement(dir) {
  if (!dir || dir === "전적색" || dir === "보행" || dir === "미확인") return null;
  const match = dir.match(/^([가-힣]+)(↔|→)([가-힣]+)/);
  if (!match) return null;
  return { from: match[1], arrow: match[2], to: match[3] };
}

function isDirMatchingMovement(dir, movement) {
  const parsed = parseDirMovement(dir);
  if (!parsed || !movement?.from || !movement?.to) return false;
  if (parsed.arrow === "↔") {
    return (movement.from === parsed.from && movement.to === parsed.to)
      || (movement.from === parsed.to && movement.to === parsed.from);
  }
  return movement.from === parsed.from && movement.to === parsed.to;
}

function movementScore(parsed, movement) {
  if (!parsed || !movement?.from || !movement?.to) return Infinity;
  if (parsed.arrow === "↔") {
    return Math.min(
      compassDiff(parsed.from, movement.from) + compassDiff(parsed.to, movement.to),
      compassDiff(parsed.to, movement.from) + compassDiff(parsed.from, movement.to)
    );
  }
  return compassDiff(parsed.from, movement.from) + compassDiff(parsed.to, movement.to);
}

function movementBearingScore(parsed, movement) {
  if (!parsed) return Infinity;
  const hasApproach = Number.isFinite(Number(movement?.approachBearing));
  const hasExit = Number.isFinite(Number(movement?.exitBearing));
  if (!hasApproach && !hasExit) return Infinity;

  const phaseFromBearing = compassToBearing(parsed.from);
  const phaseToBearing = compassToBearing(parsed.to);
  if (phaseFromBearing == null || phaseToBearing == null) return Infinity;

  const vehicleFromBearing = hasApproach ? (Number(movement.approachBearing) + 180) % 360 : null;
  const vehicleToBearing = hasExit ? Number(movement.exitBearing) : null;

  const oneWayScore = (fromBearing, toBearing) => {
    let score = 0, count = 0;
    if (vehicleFromBearing != null) { score += angleDiffDeg(vehicleFromBearing, fromBearing); count++; }
    if (vehicleToBearing != null) { score += angleDiffDeg(vehicleToBearing, toBearing); count++; }
    return count ? score : Infinity;
  };

  if (parsed.arrow === "↔") {
    return Math.min(oneWayScore(phaseFromBearing, phaseToBearing), oneWayScore(phaseToBearing, phaseFromBearing));
  }
  return oneWayScore(phaseFromBearing, phaseToBearing);
}

function findClosestPhaseByMovement(phases, movement) {
  let best = null;
  for (const phase of phases) {
    for (const dir of phase.dirs || []) {
      const parsed = parseDirMovement(dir);
      const bearingScore = movementBearingScore(parsed, movement);
      const textScore = movementScore(parsed, movement);
      const score = Number.isFinite(bearingScore) ? bearingScore : textScore;
      if (!best || score < best.score) best = { phase, score };
    }
  }
  const limit = 65;
  return best && best.score <= limit ? best.phase : null;
}

export function signedBearingDelta(fromBearing, toBearing) {
  if (!Number.isFinite(Number(fromBearing)) || !Number.isFinite(Number(toBearing))) return null;
  return ((Number(toBearing) - Number(fromBearing) + 540) % 360) - 180;
}

export function getMovementTurnType(movement) {
  const delta = signedBearingDelta(movement?.approachBearing, movement?.exitBearing);
  if (delta == null) return null;
  const abs = Math.abs(delta);
  if (abs <= 35) return "straight";
  if (abs >= 145) return "uturn";
  return delta > 0 ? "right" : "left";
}

export function isRightTurnMovement(movement) {
  return getMovementTurnType(movement) === "right";
}

export function isLeftTurnMovement(movement) {
  return getMovementTurnType(movement) === "left";
}

export function isDirMatchingBearing(dir, carBearingDeg) {
  if (!dir || dir === "전적색" || dir === "보행" || dir === "미확인") return false;
  if (carBearingDeg == null) return false;
  const carCompass = bearingToCompass(carBearingDeg);
  const parsed = parseDirMovement(dir);
  if (!parsed) {
    if (dir.includes("직진") || dir.includes("좌회전") || dir.includes("우회전")) {
      return true;
    }
    return false;
  }
  const fromBearing = compassToBearing(parsed.from);
  const toBearing = compassToBearing(parsed.to);
  if (fromBearing == null || toBearing == null) return false;
  const reverseCarBearing = (carBearingDeg + 180) % 360;
  const fromDiff = angleDiffDeg(fromBearing, reverseCarBearing);
  const toDiff = angleDiffDeg(toBearing, carBearingDeg);
  if (parsed.arrow === "↔") {
    return (fromDiff < 50 && toDiff < 50) || (angleDiffDeg(toBearing, reverseCarBearing) < 50 && angleDiffDeg(fromBearing, carBearingDeg) < 50);
  }
  return fromDiff < 50 && toDiff < 50;
}

// 현재 신호 사이클에서 활성 현시 번호 반환
export function getCurrentPhaseNo(signalCtx, nowMs) {
  if (!signalCtx?.phases?.length) return null;
  const phases = signalCtx.phases;
  const cycleVal = signalCtx.cycleVal || phases.reduce((sum, p) => sum + Number(p.sec || 0), 0) || 120;
  const planStartSec = signalCtx.planStartSec ?? 0;
  const nowSec = Math.floor(nowMs / 1000) % 86400;
  const elapsed = ((nowSec - planStartSec) % cycleVal + cycleVal) % cycleVal;

  let acc = 0;
  for (const phase of phases) {
    acc += Number(phase.sec || 0);
    if (elapsed < acc) return phase.no;
  }
  return phases[0]?.no ?? null;
}

// 차량 진행 방향(movement/bearing)에 맞는 현시 번호 반환
export function getVehicleFollowingPhaseNo(signalCtx, carBearingDeg = null, movement = null) {
  if (!signalCtx?.phases?.length) return null;
  const phases = signalCtx.phases;

  if (!movement && carBearingDeg == null) {
    const vehiclePhase = phases.find(p => (p.dirs || []).some(d => d !== "전적색" && d !== "보행"));
    return vehiclePhase?.no ?? phases[0]?.no ?? null;
  }

  const matched = phases.find(p =>
    (p.dirs || []).some(d => movement ? isDirMatchingMovement(d, movement) : isDirMatchingBearing(d, carBearingDeg))
  );

  if (matched) return matched.no;

  if (movement) {
    if (isRightTurnMovement(movement)) {
      const rightTurnMatched = phases.find(p => (p.dirs || []).some(d => String(d).includes("우회전")));
      if (rightTurnMatched) return rightTurnMatched.no;
      return "__RIGHT_TURN__";
    }
    const fuzzyMatched = findClosestPhaseByMovement(phases, movement);
    if (fuzzyMatched) return fuzzyMatched.no;
    return null;
  }

  const fallback = phases.find(p => (p.dirs || []).some(d => d !== "전적색" && d !== "보행"));
  return fallback?.no ?? phases[0]?.no ?? null;
}

// 차량 방향 기준으로 현재 현시가 초록불인지 판단
export function isCurrentPhaseGreenForVehicle(signalCtx, nowMs, carBearingDeg = null, movement = null) {
  if (!signalCtx?.phases?.length) return true;
  const currentPhaseNo = getCurrentPhaseNo(signalCtx, nowMs);
  const followingPhaseNo = getVehicleFollowingPhaseNo(signalCtx, carBearingDeg, movement);
  const currentPhase = signalCtx.phases.find(p => String(p.no) === String(currentPhaseNo));
  if (!currentPhase) return true;

  const dirs = currentPhase.dirs || [];
  if (dirs.every(d => d === "전적색")) return false;
  if (dirs.includes("보행")) return false;
  if (!movement && carBearingDeg == null) return dirs.some(d => d !== "전적색" && d !== "보행");
  if (followingPhaseNo === "__RIGHT_TURN__") return true;
  // 매칭 현시가 없으면(null) 신호 데이터 부족 → 허용 통행으로 처리해 차량이 영원히 정지하지 않도록 함
  if (followingPhaseNo == null) return dirs.some(d => d !== "전적색" && d !== "보행");
  if (String(currentPhaseNo) !== String(followingPhaseNo)) return false;
  return dirs.some(d => d !== "전적색" && d !== "보행");
}

export function hasLeftTurnSignal(signalCtx, movement) {
  if (!signalCtx?.phases?.length || !movement) return true;
  if (!isLeftTurnMovement(movement)) return true;
  return signalCtx.phases.some(p => (p.dirs || []).some(d => String(d || "").includes("좌회전")));
}
