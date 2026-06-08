// 경로 교통/신호 데이터 fetch 및 캐싱 훅
import { useRef, useState, useEffect } from "react";
import { getCrLonLat } from "../utils/geoUtils";
import { calculateRouteTravelDir } from "../utils/routeUtils";
import { mapCarToTrafficDirection } from "../utils/canvasUtils";
import { offsetRoutePoints } from "../utils/geoUtils";
import { hasLeftTurnSignal, isLeftTurnMovement } from "../utils/signalUtils";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8080").replace(/\/+$/, "");

/**
 * @param {{ start, end, viaCrossroads, routePoints, routePointsRef, onRouteTrafficChange }}
 */
export function useRouteTraffic({ start, end, viaCrossroads, routePoints, routePointsRef, onRouteTrafficChange, onBlockedLeftTurn }) {
  const routeTrafficRequestRef = useRef({ key: "", seq: 0 });
  const routeTrafficRef = useRef(null);
  const routeVehicleMovementsRef = useRef({});
  const startCarDirectionRef = useRef(null);

  const [routeTraffic, setRouteTraffic] = useState(null);

  // routeTraffic 상태 → ref 동기화 (애니메이션 루프가 ref 로 접근)
  useEffect(() => {
    routeTrafficRef.current = routeTraffic;
  }, [routeTraffic]);

  // 신호 ctx fetch (캐시 30초, 중복 fetch 방지)
  async function fetchSignalCtx(intNo, signalCacheRef, signalFetchingRef) {
    if (!intNo) return null;
    const cache = signalCacheRef.current;
    const cached = cache[intNo];
    if (cached && Date.now() - cached.fetchedAt < 30000) return cached.ctx;
    if (signalFetchingRef.current.has(intNo)) return null;
    signalFetchingRef.current.add(intNo);

    const keys = Object.keys(cache);
    if (keys.length > 200) {
      keys.sort((a, b) => (cache[a]?.fetchedAt ?? 0) - (cache[b]?.fetchedAt ?? 0))
        .slice(0, 50).forEach(k => delete cache[k]);
    }

    try {
      const res = await fetch(`${API_BASE}/api/signal/simulation/context/${intNo}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      signalCacheRef.current[intNo] = { ctx: data, fetchedAt: Date.now() };
      return data;
    } catch (err) {
      console.warn("신호 데이터 로드 실패", intNo, err);
      return null;
    } finally {
      signalFetchingRef.current.delete(intNo);
    }
  }

  // 경로 노드 배열 구성
  function buildRouteTrafficNodes(startCr, viaList, endCr) {
    const nodes = [startCr, ...(viaList || []), endCr].filter(Boolean);
    const result = [];
    for (const node of nodes) {
      const ll = getCrLonLat(node);
      if (!ll) continue;
      const payload = { intNo: node.intNo, intNm: node.intNm, lat: ll.lat, lon: ll.lon };
      const prev = result[result.length - 1];
      if (prev && String(prev.intNo) === String(payload.intNo)) continue;
      result.push(payload);
    }
    return result;
  }

  // 경로 교통정보 fetch
  async function fetchRouteTraffic(routeNodes, seq, travelDir = null) {
    try {
      const res = await fetch(`${API_BASE}/api/signal/simulation/route-traffic`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ routeNodes, travelDir, includeVertices: false }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (routeTrafficRequestRef.current.seq !== seq) return;

      routeVehicleMovementsRef.current = data?.vehicleMovements || {};

      const blockedLeftTurn = await findBlockedLeftTurnNode(routeNodes, data?.vehicleMovements);
      if (blockedLeftTurn) {
        routeVehicleMovementsRef.current = {};
        startCarDirectionRef.current = null;
        routeTrafficRef.current = null;

        routeTrafficRequestRef.current = {
          key: "",
          seq: routeTrafficRequestRef.current.seq + 1,
        };

        setRouteTraffic(null);
        onRouteTrafficChange?.(null);
        onBlockedLeftTurn?.(blockedLeftTurn);
        return;
      }

      const rightLanePoints = offsetRoutePoints(routePointsRef.current, 10);
      const startCarPos = rightLanePoints[0];
      const firstSegment =
        data?.segments?.find(seg => seg?.up?.vertices?.length || seg?.down?.vertices?.length)
        ?? data?.segments?.[0];

      const matched = mapCarToTrafficDirection(startCarPos, firstSegment);
      if (matched?.direction && !travelDir) {
        startCarDirectionRef.current = matched.direction;
        fetchRouteTraffic(routeNodes, seq);
        return;
      }

      const payload = {
        ...data,
        requestedRouteNodes: routeNodes,
        requestedTravelDir: travelDir,
        startCarTraffic: matched?.traffic ?? null,
        startCarDirection: matched?.direction ?? null,
        startCarTrafficDistanceMeters: matched?.distanceMeters ?? null,
        startCarUpDistanceMeters: matched?.upDistanceMeters ?? null,
        startCarDownDistanceMeters: matched?.downDistanceMeters ?? null,
        updatedAt: Date.now(),
      };
      routeTrafficRef.current = payload;
      setRouteTraffic(payload);
      onRouteTrafficChange?.(payload);
    } catch (err) {
      if (routeTrafficRequestRef.current.seq !== seq) return;
      console.warn("TOPIS 경로 속도 데이터 로드 실패", err);
    }
  }

  async function findBlockedLeftTurnNode(routeNodes, vehicleMovements) {
    for (const node of routeNodes) {
      const movement = vehicleMovements?.[String(node.intNo)];

      if (!movement || !isLeftTurnMovement(movement)) continue;

      try {
        const res = await fetch(`${API_BASE}/api/signal/simulation/context/${node.intNo}`);
        if (!res.ok) continue;

        const ctx = await res.json();

        if (!hasLeftTurnSignal(ctx, movement)) {
          return { node, movement };
        }
      } catch (err) {
        console.warn("좌회전 신호 확인 실패", node.intNo, err);
      }
    }

    return null;
  }

  // 경로 노드 변경 시 교통정보 재fetch
  useEffect(() => {
    const routeNodes = buildRouteTrafficNodes(start, viaCrossroads, end);
    const travelDir = calculateRouteTravelDir(routeNodes);
    const key = `${travelDir || ""}|${routeNodes.map(n => `${n.intNo || ""}:${n.lat}:${n.lon}`).join("|")}`;

    if (routeNodes.length < 2) {
      routeTrafficRequestRef.current = { key: "", seq: routeTrafficRequestRef.current.seq + 1 };
      routeTrafficRef.current = null;
      setRouteTraffic(null);
      onRouteTrafficChange?.(null);
      return;
    }
    if (routePoints.length < 2) return;
    if (routeTrafficRequestRef.current.key === key) return;

    const seq = routeTrafficRequestRef.current.seq + 1;
    routeTrafficRequestRef.current = { key, seq };
    fetchRouteTraffic(routeNodes, seq, travelDir);
  }, [
    start?.intNo,
    end?.intNo,
    viaCrossroads.map(cr => cr.intNo).join("|"),
    routePoints.length,
    onRouteTrafficChange,
  ]);

  function getBackendMovementForNode(intNo) {
    const movement = routeVehicleMovementsRef.current?.[String(intNo)];
    if (!movement?.from && !movement?.to) return null;
    return { from: movement.from, to: movement.to, approachBearing: movement.approachBearing, exitBearing: movement.exitBearing, source: "link-geometry" };
  }

  function getReverseBackendMovementForNode(intNo) {
    const movement = routeVehicleMovementsRef.current?.[String(intNo)];
    if (!movement?.from && !movement?.to) return null;
    const reverseApproach = Number.isFinite(Number(movement.exitBearing)) ? (Number(movement.exitBearing) + 180) % 360 : null;
    const reverseExit = Number.isFinite(Number(movement.approachBearing)) ? (Number(movement.approachBearing) + 180) % 360 : null;
    return { from: movement.to, to: movement.from, approachBearing: reverseApproach, exitBearing: reverseExit, source: "link-geometry-reverse" };
  }

  function prefetchSignals(viaList, startCr, endCr, signalCacheRef, signalFetchingRef) {
    [startCr, ...(viaList || []), endCr].filter(Boolean)
      .forEach(cr => fetchSignalCtx(cr.intNo, signalCacheRef, signalFetchingRef));
  }

  return {
    routeTraffic,
    routeTrafficRef,
    routeVehicleMovementsRef,
    buildRouteTrafficNodes,
    fetchSignalCtx,
    prefetchSignals,
    getBackendMovementForNode,
    getReverseBackendMovementForNode,
  };
}
