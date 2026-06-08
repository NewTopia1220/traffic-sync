// 교통 링크 레이어 로딩·렌더링·폴링을 캡슐화한 커스텀 훅
import { useRef, useState, useMemo, useEffect } from "react";
import { normalizeTrafficLevel, trafficColor, trafficWidth, mergeTrafficStatus, shouldApplyTrafficColorUpdate } from "../utils/trafficUtils";
import { offsetRoutePoints } from "../utils/geoUtils";

const API_BASE = (import.meta.env.VITE_API_URL || "http://localhost:8080").replace(/\/+$/, "");
const TRAFFIC_LINK_POLL_MS = 15000;
const TRAFFIC_RENDER_BATCH_SIZE = 28;
const TRAFFIC_PRIMITIVE_LINE_WIDTH = 6;
const TRAFFIC_PRIMITIVE_HALO_WIDTH = 11;

/**
 * @param {{ viewerRef, trafficAreaQuery, trafficAreaKey, mapReady, driveView, isSimulationActive }} params
 */
export function useTrafficLayer({ viewerRef, trafficAreaQuery, trafficAreaKey, mapReady, driveView, isSimulationActive }) {
  const trafficLinkEntitiesRef = useRef({});
  const trafficLinkPrimitivesRef = useRef({ halo: null, color: null, linkIds: [] });
  const trafficPrimitiveFallbackRef = useRef(false);
  const trafficLayerRenderKeyRef = useRef("");
  const trafficStatusRef = useRef({});
  const trafficRenderRef = useRef({ frameId: null, token: 0 });

  const [trafficLinks, setTrafficLinks] = useState([]);
  const [trafficLayerInfo, setTrafficLayerInfo] = useState({
    loading: false,
    rendering: false,
    renderedCount: 0,
    error: null,
    linkCount: 0,
    updatedAt: null,
  });

  const trafficLinkIds = useMemo(
    () => trafficLinks.map(link => link.linkId).filter(Boolean).join("|"),
    [trafficLinks]
  );

  // ── 내부 헬퍼 ──────────────────────────────────────────────────────────────

  function cancelTrafficLayerRender() {
    const current = trafficRenderRef.current;
    if (current.frameId != null) window.cancelAnimationFrame(current.frameId);
    trafficRenderRef.current = { frameId: null, token: current.token + 1 };
  }

  function clearTrafficPrimitives(viewer) {
    const current = trafficLinkPrimitivesRef.current;
    [current.halo, current.color].filter(Boolean).forEach(primitive => {
      if (!primitive.isDestroyed?.()) viewer.scene.primitives.remove(primitive);
    });
    trafficLinkPrimitivesRef.current = { halo: null, color: null, linkIds: [] };
  }

  function clearTrafficLayer() {
    const viewer = viewerRef.current;
    cancelTrafficLayerRender();
    trafficLayerRenderKeyRef.current = "";
    if (!viewer) return;

    clearTrafficPrimitives(viewer);
    Object.values(trafficLinkEntitiesRef.current).forEach(entry => {
      const entities = entry?.halo || entry?.color
        ? [entry.halo, entry.color].filter(Boolean)
        : [entry].filter(Boolean);
      entities.forEach(entity => viewer.entities.remove(entity));
    });
    trafficLinkEntitiesRef.current = {};
  }

  function hasTrafficLayerGeometry() {
    const primitives = trafficLinkPrimitivesRef.current;
    const hasPrimitive = [primitives.halo, primitives.color]
      .some(primitive => primitive && !primitive.isDestroyed?.());
    return hasPrimitive || Object.keys(trafficLinkEntitiesRef.current).length > 0;
  }

  function canUseTrafficPrimitives(Cesium) {
    return !trafficPrimitiveFallbackRef.current
      && !!Cesium?.GroundPolylinePrimitive
      && !!Cesium?.GroundPolylineGeometry
      && !!Cesium?.GeometryInstance
      && !!Cesium?.ColorGeometryInstanceAttribute
      && !!Cesium?.PolylineColorAppearance;
  }

  function trafficMaterial(Cesium, status) {
    return Cesium.Color.fromCssColorString(trafficColor(status)).withAlpha(
      normalizeTrafficLevel(status) === "unknown" ? 0.72 : 1
    );
  }

  function trafficHaloMaterial(Cesium) {
    return Cesium.Color.fromCssColorString("#0b1120").withAlpha(0.72);
  }

  function trafficLaneOffsetMeters(link) {
    const axisDir = String(link?.axisDir || "");
    if (axisDir.includes("상행")) return -4.5;
    if (axisDir.includes("하행")) return 4.5;
    return 0;
  }

  function trafficPoints(link) {
    const points = (link?.vertices || [])
      .map(vertex => ({ lon: Number(vertex.lon), lat: Number(vertex.lat) }))
      .filter(point => Number.isFinite(point.lon) && Number.isFinite(point.lat));
    if (points.length < 2) return [];
    const offsetMeters = trafficLaneOffsetMeters(link);
    return offsetMeters ? offsetRoutePoints(points, offsetMeters) : points;
  }

  function trafficStatusForLink(link) {
    return { ...link, ...(trafficStatusRef.current[link.linkId] || {}) };
  }

  function updateTrafficPrimitiveColor(Cesium, primitive, linkId, status) {
    if (!primitive || primitive.isDestroyed?.()) return false;
    if (!primitive.ready) return true;
    try {
      const attributes = primitive.getGeometryInstanceAttributes(String(linkId));
      if (!attributes?.color) return true;
      attributes.color = Cesium.ColorGeometryInstanceAttribute.toValue(
        trafficMaterial(Cesium, status),
        attributes.color
      );
      return true;
    } catch {
      return true;
    }
  }

  function applyTrafficPrimitiveColorsWhenReady(viewer, Cesium, primitive, linkIds) {
    if (!primitive || !linkIds?.length) return;
    const applyColors = () => {
      if (!primitive || primitive.isDestroyed?.() || !primitive.ready) return;
      linkIds.forEach(linkId => {
        const status = trafficStatusRef.current[linkId];
        if (status) updateTrafficPrimitiveColor(Cesium, primitive, linkId, status);
      });
      viewer.scene.requestRender();
    };
    if (primitive.readyPromise?.then) {
      primitive.readyPromise.then(applyColors).catch(err => {
        console.warn("TOPIS primitive traffic color update skipped", err);
      });
    } else {
      window.setTimeout(applyColors, 250);
    }
  }

  function addTrafficLinkEntity(viewer, Cesium, link) {
    const points = trafficPoints(link);
    if (points.length < 2 || !link?.linkId) return null;
    const status = trafficStatusForLink(link);
    const positions = Cesium.Cartesian3.fromDegreesArray(points.flatMap(p => [p.lon, p.lat]));
    const width = trafficWidth(status);

    const halo = viewer.entities.add({
      polyline: { positions, width: width + 5, clampToGround: true, material: trafficHaloMaterial(Cesium), zIndex: 11 },
      properties: { linkId: link.linkId, fromIntNo: link.fromIntNo, toIntNo: link.toIntNo },
    });
    const color = viewer.entities.add({
      polyline: { positions, width, clampToGround: true, material: trafficMaterial(Cesium, status), zIndex: 12 },
      properties: { linkId: link.linkId, fromIntNo: link.fromIntNo, toIntNo: link.toIntNo },
    });

    trafficLinkEntitiesRef.current[link.linkId] = { halo, color };
    return color;
  }

  function updateTrafficLinkEntity(linkId, status) {
    const primitive = trafficLinkPrimitivesRef.current.color;
    if (primitive && window.Cesium) {
      if (updateTrafficPrimitiveColor(window.Cesium, primitive, linkId, status)) return;
    }
    const entry = trafficLinkEntitiesRef.current[linkId];
    if (!entry || !window.Cesium) return;
    const Cesium = window.Cesium;
    const colorEntity = entry.color || entry;
    const haloEntity = entry.halo || null;
    if (!colorEntity?.polyline) return;
    const width = trafficWidth(status);
    colorEntity.polyline.width = width;
    colorEntity.polyline.material = trafficMaterial(Cesium, status);
    if (haloEntity?.polyline) {
      haloEntity.polyline.width = width + 5;
      haloEntity.polyline.material = trafficHaloMaterial(Cesium);
    }
  }

  function renderTrafficLayerWithEntities(viewer, Cesium, links, renderKey) {
    const token = trafficRenderRef.current.token + 1;
    trafficRenderRef.current = { frameId: null, token };
    let index = 0;

    setTrafficLayerInfo(prev => ({ ...prev, rendering: true, renderedCount: 0, linkCount: links.length }));

    const renderBatch = () => {
      if (trafficRenderRef.current.token !== token) return;
      const end = Math.min(index + TRAFFIC_RENDER_BATCH_SIZE, links.length);
      for (; index < end; index++) addTrafficLinkEntity(viewer, Cesium, links[index]);
      viewer.scene.requestRender();
      setTrafficLayerInfo(prev => ({ ...prev, rendering: index < links.length, renderedCount: index }));
      if (index < links.length) {
        trafficRenderRef.current.frameId = window.requestAnimationFrame(renderBatch);
      } else {
        trafficRenderRef.current.frameId = null;
        trafficLayerRenderKeyRef.current = renderKey || "";
      }
    };
    renderBatch();
  }

  function renderTrafficLayerWithPrimitives(viewer, Cesium, links, renderKey) {
    const token = trafficRenderRef.current.token + 1;
    trafficRenderRef.current = { frameId: null, token };

    setTrafficLayerInfo(prev => ({ ...prev, rendering: true, renderedCount: 0, linkCount: links.length }));

    trafficRenderRef.current.frameId = window.requestAnimationFrame(() => {
      if (trafficRenderRef.current.token !== token) return;
      try {
        const haloInstances = [];
        const colorInstances = [];
        const linkIds = [];

        links.forEach(link => {
          const points = trafficPoints(link);
          if (points.length < 2 || !link?.linkId) return;
          const linkId = String(link.linkId);
          const positions = Cesium.Cartesian3.fromDegreesArray(points.flatMap(p => [p.lon, p.lat]));
          linkIds.push(linkId);

          haloInstances.push(new Cesium.GeometryInstance({
            id: `traffic-halo:${linkId}`,
            geometry: new Cesium.GroundPolylineGeometry({ positions, width: TRAFFIC_PRIMITIVE_HALO_WIDTH }),
            attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(trafficHaloMaterial(Cesium)) },
          }));
          colorInstances.push(new Cesium.GeometryInstance({
            id: linkId,
            geometry: new Cesium.GroundPolylineGeometry({ positions, width: TRAFFIC_PRIMITIVE_LINE_WIDTH }),
            attributes: { color: Cesium.ColorGeometryInstanceAttribute.fromColor(trafficMaterial(Cesium, trafficStatusForLink(link))) },
          }));
        });

        const halo = haloInstances.length
          ? viewer.scene.primitives.add(new Cesium.GroundPolylinePrimitive({
              geometryInstances: haloInstances,
              appearance: new Cesium.PolylineColorAppearance({ translucent: true }),
              asynchronous: true,
            }))
          : null;
        const color = colorInstances.length
          ? viewer.scene.primitives.add(new Cesium.GroundPolylinePrimitive({
              geometryInstances: colorInstances,
              appearance: new Cesium.PolylineColorAppearance({ translucent: true }),
              asynchronous: true,
            }))
          : null;

        trafficLinkPrimitivesRef.current = { halo, color, linkIds };
        trafficLayerRenderKeyRef.current = renderKey || "";
        applyTrafficPrimitiveColorsWhenReady(viewer, Cesium, color, linkIds);
        trafficRenderRef.current.frameId = null;

        setTrafficLayerInfo(prev => ({ ...prev, rendering: false, renderedCount: linkIds.length, linkCount: links.length }));
        viewer.scene.requestRender();
      } catch (err) {
        console.warn("TOPIS primitive traffic layer failed; falling back to entity rendering", err);
        trafficPrimitiveFallbackRef.current = true;
        clearTrafficPrimitives(viewer);
        renderTrafficLayerWithEntities(viewer, Cesium, links, renderKey);
      }
    });
  }

  function renderTrafficLayerInBatches(viewer, Cesium, links, renderKey) {
    clearTrafficLayer();
    if (!viewer || !Cesium || !links?.length) {
      trafficLayerRenderKeyRef.current = renderKey || "";
      setTrafficLayerInfo(prev => ({ ...prev, rendering: false, renderedCount: 0 }));
      viewer?.scene?.requestRender?.();
      return;
    }
    if (canUseTrafficPrimitives(Cesium)) {
      renderTrafficLayerWithPrimitives(viewer, Cesium, links, renderKey);
      return;
    }
    renderTrafficLayerWithEntities(viewer, Cesium, links, renderKey);
  }

  // ── Effects ────────────────────────────────────────────────────────────────

  // 관리 대상 링크 초기 로딩
  useEffect(() => {
    let alive = true;
    trafficStatusRef.current = {};
    setTrafficLinks([]);
    clearTrafficLayer();
    setTrafficLayerInfo(prev => ({ ...prev, loading: true, rendering: false, renderedCount: 0, error: null }));

    fetch(`${API_BASE}/api/signal/simulation/managed-traffic-links${trafficAreaQuery}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then(data => {
        if (!alive) return;
        const links = Array.isArray(data.links)
          ? data.links.filter(link => link?.linkId && Array.isArray(link.vertices) && link.vertices.length >= 2)
          : [];
        const nextStatus = {};
        links.forEach(link => {
          nextStatus[link.linkId] = {
            linkId: link.linkId, roadDivCd: link.roadDivCd, roadType: link.roadType,
            axisCd: link.axisCd, axisName: link.axisName, axisDir: link.axisDir,
            speedKph: link.speedKph, travelTimeSec: link.travelTimeSec,
            congestion: link.congestion, speedStale: link.speedStale,
            lastFetchedAtMs: link.lastFetchedAtMs,
          };
        });
        trafficStatusRef.current = nextStatus;
        setTrafficLinks(links);
        setTrafficLayerInfo({
          loading: false, rendering: false, renderedCount: 0,
          error: data.reason || null, linkCount: links.length,
          updatedAt: data.generatedAtMs || Date.now(),
        });
      })
      .catch(err => {
        if (!alive) return;
        console.warn("TOPIS managed traffic layer load failed", err);
        trafficStatusRef.current = {};
        setTrafficLinks([]);
        setTrafficLayerInfo({
          loading: false, rendering: false, renderedCount: 0,
          error: err?.message || "traffic link layer load failed", linkCount: 0,
          updatedAt: Date.now(),
        });
      });

    return () => { alive = false; };
  }, [trafficAreaQuery]);

  // 15초마다 링크별 속도·혼잡도 폴링
  useEffect(() => {
    if (!trafficLinks.length || !trafficLinkIds) return;
    let alive = true;

    const pollStatus = async () => {
      try {
        const linkIds = trafficLinks.map(link => link.linkId).filter(Boolean);
        if (!linkIds.length) return;
        const res = await fetch(`${API_BASE}/api/signal/simulation/managed-traffic-link-status`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ linkIds }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        if (!alive) return;
        const statuses = Array.isArray(data.statuses) ? data.statuses : [];
        statuses.forEach(statusItem => {
          if (!statusItem?.linkId) return;
          const previous = trafficStatusRef.current[statusItem.linkId] || {};
          const next = mergeTrafficStatus(previous, statusItem);
          trafficStatusRef.current[statusItem.linkId] = next;
          if (shouldApplyTrafficColorUpdate(previous, statusItem, next)) {
            updateTrafficLinkEntity(statusItem.linkId, next);
          }
        });
        setTrafficLayerInfo(prev => ({ ...prev, loading: false, updatedAt: data.generatedAtMs || Date.now() }));
        viewerRef.current?.scene?.requestRender?.();
      } catch (err) {
        if (!alive) return;
        console.warn("TOPIS managed traffic status polling failed", err);
        setTrafficLayerInfo(prev => ({ ...prev, loading: false, error: err?.message || "traffic status polling failed" }));
      }
    };

    const timer = setInterval(pollStatus, TRAFFIC_LINK_POLL_MS);
    const first = setTimeout(pollStatus, 1800);
    return () => { alive = false; clearInterval(timer); clearTimeout(first); };
  }, [trafficLinkIds, trafficAreaKey]);

  // 지도 준비 후 교통 레이어 렌더링 (드라이브뷰 / 시뮬레이션 중에는 숨김)
  useEffect(() => {
    if (!mapReady || !viewerRef.current || !window.Cesium) return;
    const Cesium = window.Cesium;
    const viewer = viewerRef.current;

    if (driveView || isSimulationActive) {
      const hiddenKey = driveView ? "drive-view" : "simulation-active";
      if (trafficLayerRenderKeyRef.current !== hiddenKey) {
        clearTrafficLayer();
        trafficLayerRenderKeyRef.current = hiddenKey;
      }
      viewer.scene.requestRender();
      return;
    }

    const renderKey = trafficLinkIds ? `area:${trafficAreaKey}:links:${trafficLinkIds}` : `area:${trafficAreaKey}:links:empty`;
    if (trafficLayerRenderKeyRef.current === renderKey && hasTrafficLayerGeometry()) return;

    renderTrafficLayerInBatches(viewer, Cesium, trafficLinks, renderKey);
    return () => cancelTrafficLayerRender();
  }, [mapReady, driveView, isSimulationActive, trafficLinkIds, trafficAreaKey]);

  return {
    trafficLinks,
    trafficLayerInfo,
    trafficLinkIds,
    trafficStatusRef,
    trafficLayerRenderKeyRef,
    clearTrafficLayer,
    hasTrafficLayerGeometry,
    updateTrafficLinkEntity,
    renderTrafficLayerInBatches,
  };
}
