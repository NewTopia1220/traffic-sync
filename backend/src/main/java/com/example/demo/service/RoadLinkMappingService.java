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
                log.debug("TOPIS 링크 매칭 실패: {} ({}) 최단거리 {}m",
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

        log.info("교차로-TOPIS 링크 자동 매칭 완료: {}개 / 대상 {}개", result.size(), crossroads.size());
        return result;
    }
}
