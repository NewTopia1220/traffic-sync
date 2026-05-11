package com.example.demo.service;

import com.example.demo.model.context.CrossroadRoadLinkMapping;
import com.example.demo.model.context.RoadRiskSnapshot;
import com.example.demo.model.context.RoadSpeedSnapshot;
import com.example.demo.model.context.WeatherSnapshot;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class SupplementalDataCacheService {

    private volatile WeatherSnapshot weather;
    private final ConcurrentHashMap<String, CrossroadRoadLinkMapping> mappingsByCrossroadId = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, Map<String, CrossroadRoadLinkMapping>> directionalMappingsByCrossroadId =
            new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, RoadSpeedSnapshot> speedsByLinkId = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, RoadRiskSnapshot> risksByLinkId = new ConcurrentHashMap<>();

    public Optional<WeatherSnapshot> getWeather() {
        return Optional.ofNullable(weather);
    }

    public void updateWeather(WeatherSnapshot snapshot) {
        this.weather = snapshot;
    }

    public void markWeatherStale() {
        if (weather != null) {
            weather.setStale(true);
        }
    }

    public void updateMappings(Map<String, CrossroadRoadLinkMapping> mappings) {
        mappingsByCrossroadId.clear();
        if (mappings != null) {
            mappingsByCrossroadId.putAll(mappings);
        }
    }

    public Optional<CrossroadRoadLinkMapping> getMapping(String crsrdId) {
        return Optional.ofNullable(mappingsByCrossroadId.get(crsrdId));
    }

    public void updateDirectionalMappings(Map<String, Map<String, CrossroadRoadLinkMapping>> mappings) {
        directionalMappingsByCrossroadId.clear();
        if (mappings == null) {
            return;
        }
        mappings.forEach((crsrdId, byDirection) -> {
            if (byDirection != null) {
                directionalMappingsByCrossroadId.put(
                        crsrdId,
                        Collections.unmodifiableMap(new LinkedHashMap<>(byDirection))
                );
            }
        });
    }

    public Map<String, CrossroadRoadLinkMapping> getDirectionalMappings(String crsrdId) {
        return directionalMappingsByCrossroadId.getOrDefault(crsrdId, Collections.emptyMap());
    }

    public Collection<CrossroadRoadLinkMapping> getMappings() {
        return Collections.unmodifiableCollection(mappingsByCrossroadId.values());
    }

    public Collection<CrossroadRoadLinkMapping> getAllMappedLinkMappings() {
        Map<String, CrossroadRoadLinkMapping> uniqueByLinkId = new LinkedHashMap<>();
        mappingsByCrossroadId.values().forEach(mapping -> putMappingByLinkId(uniqueByLinkId, mapping));
        directionalMappingsByCrossroadId.values().forEach(byDirection ->
                byDirection.values().forEach(mapping -> putMappingByLinkId(uniqueByLinkId, mapping)));
        return Collections.unmodifiableCollection(uniqueByLinkId.values());
    }

    public Set<String> getMappedLinkIds() {
        return getAllMappedLinkMappings().stream()
                .map(CrossroadRoadLinkMapping::getLinkId)
                .filter(linkId -> linkId != null && !linkId.isBlank())
                .collect(Collectors.toUnmodifiableSet());
    }

    private void putMappingByLinkId(Map<String, CrossroadRoadLinkMapping> mappings, CrossroadRoadLinkMapping mapping) {
        if (mapping == null || mapping.getLinkId() == null || mapping.getLinkId().isBlank()) {
            return;
        }
        mappings.putIfAbsent(mapping.getLinkId(), mapping);
    }

    public void updateSpeed(RoadSpeedSnapshot snapshot) {
        speedsByLinkId.put(snapshot.getLinkId(), snapshot);
    }

    public Optional<RoadSpeedSnapshot> getSpeed(String linkId) {
        return Optional.ofNullable(speedsByLinkId.get(linkId));
    }

    public void markSpeedsStale() {
        speedsByLinkId.values().forEach(speed -> speed.setStale(true));
    }

    public void updateRisk(String linkId, RoadRiskSnapshot snapshot) {
        risksByLinkId.put(linkId, snapshot);
    }

    public Optional<RoadRiskSnapshot> getRisk(String linkId) {
        return Optional.ofNullable(risksByLinkId.get(linkId));
    }

    public void markRisksStale() {
        risksByLinkId.values().forEach(risk -> risk.setStale(true));
    }
}
