package com.example.demo.service;

import com.example.demo.entity.CrossroadSupplementalMappingEntity;
import com.example.demo.model.CrossroadInfo;
import com.example.demo.model.context.CrossroadRoadLinkMapping;
import com.example.demo.model.context.TopisLinkGeometry;
import com.example.demo.repository.CrossroadSupplementalMappingRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class CrossroadSupplementalMappingService {

    private final CrossroadSupplementalMappingRepository mappingRepository;
    private final TopisApiService topisApiService;
    private final RoadLinkMappingService roadLinkMappingService;

    public Map<String, CrossroadRoadLinkMapping> loadOrCreateRiskMappings(List<CrossroadInfo> crossroads) {
        return loadOrCreateMappings(crossroads);
    }

    public Map<String, CrossroadRoadLinkMapping> loadOrCreateMappings(List<CrossroadInfo> crossroads) {
        Map<String, CrossroadRoadLinkMapping> result = new LinkedHashMap<>();
        if (crossroads == null || crossroads.isEmpty()) {
            return result;
        }

        Map<String, CrossroadInfo> crossroadsById = crossroads.stream()
                .filter(crossroad -> crossroad.getCrsrdId() != null && !crossroad.getCrsrdId().isBlank())
                .collect(Collectors.toMap(CrossroadInfo::getCrsrdId, Function.identity(), (a, b) -> a, LinkedHashMap::new));
        if (crossroadsById.isEmpty()) {
            return result;
        }

        Map<String, CrossroadSupplementalMappingEntity> existingByCrossroadId =
                mappingRepository.findByCrsrdIdIn(crossroadsById.keySet()).stream()
                        .collect(Collectors.toMap(CrossroadSupplementalMappingEntity::getCrsrdId, Function.identity()));

        List<CrossroadInfo> incompleteMappings = new ArrayList<>();
        Map<String, CrossroadSupplementalMappingEntity> entitiesToSave = new LinkedHashMap<>();
        int dbHitCount = 0;
        int partialDbHitCount = 0;
        for (CrossroadInfo crossroad : crossroadsById.values()) {
            CrossroadSupplementalMappingEntity entity = existingByCrossroadId.get(crossroad.getCrsrdId());
            if (applyGuName(entity, crossroad)) {
                entitiesToSave.put(entity.getCrsrdId(), entity);
            }
            if (hasCompleteMapping(entity)) {
                result.put(crossroad.getCrsrdId(), toMapping(entity));
                dbHitCount++;
            } else {
                if (hasAnyMapping(entity)) {
                    result.put(crossroad.getCrsrdId(), toMapping(entity));
                    partialDbHitCount++;
                }
                incompleteMappings.add(crossroad);
            }
        }

        int createdCount = 0;
        if (!incompleteMappings.isEmpty()) {
            Map<String, CrossroadRoadLinkMapping> createdMappings = createNearestLinkMappings(incompleteMappings);
            for (CrossroadRoadLinkMapping mapping : createdMappings.values()) {
                CrossroadSupplementalMappingEntity entity =
                        toEntity(existingByCrossroadId.get(mapping.getCrsrdId()), mapping, crossroadsById.get(mapping.getCrsrdId()));
                entitiesToSave.put(entity.getCrsrdId(), entity);
                result.put(mapping.getCrsrdId(), toMapping(entity));
            }
            createdCount = createdMappings.size();
        }

        if (!entitiesToSave.isEmpty()) {
            mappingRepository.saveAll(entitiesToSave.values());
        }

        log.info("Crossroad supplemental mappings ready: requested={}, dbHit={}, partialDbHit={}, created={}, mapped={}",
                crossroadsById.size(), dbHitCount, partialDbHitCount, createdCount, result.size());
        return result;
    }

    private Map<String, CrossroadRoadLinkMapping> createNearestLinkMappings(List<CrossroadInfo> crossroads) {
        if (!topisApiService.hasLinkGeometrySource()) {
            log.debug("TOPIS link geometry source not configured; supplemental link mapping skipped");
            return Map.of();
        }

        try {
            Map<String, TopisLinkGeometry> geometries = topisApiService.fetchAllLinkGeometries();
            return roadLinkMappingService.mapCrossroadsToNearestLinks(crossroads, geometries.values());
        } catch (Exception e) {
            log.warn("Crossroad supplemental mapping creation failed: {}", e.getMessage());
            return Map.of();
        }
    }

    private CrossroadSupplementalMappingEntity toEntity(
            CrossroadSupplementalMappingEntity current,
            CrossroadRoadLinkMapping mapping,
            CrossroadInfo crossroad
    ) {
        CrossroadSupplementalMappingEntity entity = current == null ? new CrossroadSupplementalMappingEntity() : current;
        boolean hasRiskMapping = hasRiskMapping(entity);
        boolean hasSpeedMapping = hasSpeedMapping(entity);

        entity.setCrsrdId(mapping.getCrsrdId());
        applyGuName(entity, crossroad);

        if (!hasRiskMapping) {
            entity.setRiskSourceLinkId(mapping.getLinkId());
            entity.setRiskLineString(mapping.getLineString());
            entity.setRiskDistanceMeters(mapping.getDistanceMeters());
        } else {
            if (isBlank(entity.getRiskSourceLinkId())) {
                entity.setRiskSourceLinkId(mapping.getLinkId());
            }
            if (entity.getRiskDistanceMeters() == null) {
                entity.setRiskDistanceMeters(mapping.getDistanceMeters());
            }
        }

        String speedLinkId = firstNonBlank(mapping.getSpeedLinkId(), mapping.getLinkId());
        if (!hasSpeedMapping) {
            entity.setSpeedLinkId(speedLinkId);
            entity.setSpeedDistanceMeters(mapping.getSpeedDistanceMeters() == null
                    ? mapping.getDistanceMeters()
                    : mapping.getSpeedDistanceMeters());
        } else if (entity.getSpeedDistanceMeters() == null) {
            entity.setSpeedDistanceMeters(mapping.getSpeedDistanceMeters() == null
                    ? mapping.getDistanceMeters()
                    : mapping.getSpeedDistanceMeters());
        }

        entity.setUpdatedAtMs(System.currentTimeMillis());
        return entity;
    }

    private CrossroadRoadLinkMapping toMapping(CrossroadSupplementalMappingEntity entity) {
        return CrossroadRoadLinkMapping.builder()
                .crsrdId(entity.getCrsrdId())
                .linkId(entity.getRiskSourceLinkId())
                .lineString(entity.getRiskLineString())
                .distanceMeters(entity.getRiskDistanceMeters() == null ? 0.0 : entity.getRiskDistanceMeters())
                .speedLinkId(entity.getSpeedLinkId())
                .speedDistanceMeters(entity.getSpeedDistanceMeters())
                .build();
    }

    private boolean applyGuName(CrossroadSupplementalMappingEntity entity, CrossroadInfo crossroad) {
        if (entity == null || crossroad == null || isBlank(crossroad.getGuName())) {
            return false;
        }
        String guName = crossroad.getGuName().trim();
        if (guName.equals(entity.getGuName())) {
            return false;
        }
        entity.setGuName(guName);
        entity.setUpdatedAtMs(System.currentTimeMillis());
        return true;
    }

    private boolean hasRiskMapping(CrossroadSupplementalMappingEntity entity) {
        return entity != null
                && entity.getRiskLineString() != null
                && !entity.getRiskLineString().isBlank()
                && !isLegacyWideRiskLineString(entity.getRiskLineString());
    }

    private boolean hasSpeedMapping(CrossroadSupplementalMappingEntity entity) {
        return entity != null
                && entity.getSpeedLinkId() != null
                && !entity.getSpeedLinkId().isBlank();
    }

    private boolean hasCompleteMapping(CrossroadSupplementalMappingEntity entity) {
        return hasRiskMapping(entity) && hasSpeedMapping(entity);
    }

    private boolean hasAnyMapping(CrossroadSupplementalMappingEntity entity) {
        return hasRiskMapping(entity) || hasSpeedMapping(entity);
    }

    private String firstNonBlank(String first, String second) {
        if (!isBlank(first)) {
            return first;
        }
        return second;
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }

    private boolean isLegacyWideRiskLineString(String lineString) {
        return RoadRiskApiService.lineStringCoordinateCount(lineString) > 3
                || RoadRiskApiService.estimateLineStringLengthMeters(lineString) > 120.0;
    }
}
