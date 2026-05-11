package com.example.demo.service;

import com.example.demo.model.CrossroadInfo;
import com.example.demo.model.context.CrossroadRoadLinkMapping;
import com.example.demo.model.context.GeoPoint;
import com.example.demo.model.context.TopisLinkGeometry;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class RoadLinkMappingService {

    private static final String[] DIRECTION_CODES = {"nt", "ne", "et", "se", "st", "sw", "wt", "nw"};

    @Value("${road-link.max-match-distance-meters:150}")
    private double maxMatchDistanceMeters;

    public Map<String, CrossroadRoadLinkMapping> mapCrossroadsToNearestLinks(
            List<CrossroadInfo> crossroads,
            Collection<TopisLinkGeometry> geometries
    ) {
        Map<String, CrossroadRoadLinkMapping> result = new LinkedHashMap<>();
        if (crossroads == null || crossroads.isEmpty() || geometries == null || geometries.isEmpty()) {
            return result;
        }

        for (CrossroadInfo crossroad : crossroads) {
            GeoPoint crossroadPoint = new GeoPoint(crossroad.getLat(), crossroad.getLon());
            TopisLinkGeometry bestGeometry = null;
            double bestDistance = Double.MAX_VALUE;

            for (TopisLinkGeometry geometry : geometries) {
                double distance = GeoDistanceUtils.distanceToPolylineMeters(crossroadPoint, geometry.getVertices());
                if (distance < bestDistance) {
                    bestDistance = distance;
                    bestGeometry = geometry;
                }
            }

            if (bestGeometry == null || bestDistance > maxMatchDistanceMeters) {
                log.debug("TOPIS link match failed: {} ({}) nearest={}m",
                        crossroad.getCrsrdNm(), crossroad.getCrsrdId(), Math.round(bestDistance));
                continue;
            }

            result.put(crossroad.getCrsrdId(), CrossroadRoadLinkMapping.builder()
                    .crsrdId(crossroad.getCrsrdId())
                    .linkId(bestGeometry.getLinkId())
                    .distanceMeters(bestDistance)
                    .vertices(bestGeometry.getVertices())
                    .lineString(RoadRiskApiService.buildLineString(bestGeometry.getVertices()))
                    .build());
        }

        log.info("Crossroad-TOPIS nearest link mapping completed: {} / {}", result.size(), crossroads.size());
        return result;
    }

    public Map<String, Map<String, CrossroadRoadLinkMapping>> mapCrossroadsToDirectionalLinks(
            List<CrossroadInfo> crossroads,
            Collection<TopisLinkGeometry> geometries
    ) {
        Map<String, Map<String, CrossroadRoadLinkMapping>> result = new LinkedHashMap<>();
        if (crossroads == null || crossroads.isEmpty() || geometries == null || geometries.isEmpty()) {
            return result;
        }

        for (CrossroadInfo crossroad : crossroads) {
            GeoPoint crossroadPoint = new GeoPoint(crossroad.getLat(), crossroad.getLon());
            Map<String, CrossroadRoadLinkMapping> byDirection = new LinkedHashMap<>();

            for (TopisLinkGeometry geometry : geometries) {
                GeoDistanceUtils.ClosestPoint closest =
                        GeoDistanceUtils.closestPointOnPolyline(crossroadPoint, geometry.getVertices());
                if (closest.distanceMeters() > maxMatchDistanceMeters) {
                    continue;
                }

                String directionCode = directionCodeForBearing(closest.bearingDegrees());
                if (directionCode == null) {
                    continue;
                }

                CrossroadRoadLinkMapping current = byDirection.get(directionCode);
                if (current != null && current.getDistanceMeters() <= closest.distanceMeters()) {
                    continue;
                }

                byDirection.put(directionCode, CrossroadRoadLinkMapping.builder()
                        .crsrdId(crossroad.getCrsrdId())
                        .directionCode(directionCode)
                        .linkId(geometry.getLinkId())
                        .distanceMeters(closest.distanceMeters())
                        .bearingDegrees(closest.bearingDegrees())
                        .vertices(geometry.getVertices())
                        .lineString(RoadRiskApiService.buildLineString(geometry.getVertices()))
                        .build());
            }

            if (!byDirection.isEmpty()) {
                result.put(crossroad.getCrsrdId(), byDirection);
            }
        }

        log.info("Crossroad-TOPIS directional link mapping completed: {} / {}", result.size(), crossroads.size());
        return result;
    }

    private static String directionCodeForBearing(double bearingDegrees) {
        if (Double.isNaN(bearingDegrees)) {
            return null;
        }
        int sector = (int) Math.floor(((bearingDegrees + 22.5) % 360.0) / 45.0);
        return DIRECTION_CODES[sector];
    }
}
