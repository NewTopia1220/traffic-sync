package com.example.demo.service;

import com.example.demo.model.context.CrossroadRoadLinkMapping;
import com.example.demo.model.context.RoadRiskSnapshot;
import com.example.demo.model.context.RoadSpeedSnapshot;
import com.example.demo.model.context.WeatherSnapshot;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.Collections;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.stream.Collectors;

@Service
public class SupplementalDataCacheService {

    private volatile WeatherSnapshot weather;
    private final ConcurrentHashMap<String, CrossroadRoadLinkMapping> mappingsByCrossroadId = new ConcurrentHashMap<>();
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
        mappingsByCrossroadId.putAll(mappings);
    }

    public Optional<CrossroadRoadLinkMapping> getMapping(String crsrdId) {
        return Optional.ofNullable(mappingsByCrossroadId.get(crsrdId));
    }

    public Collection<CrossroadRoadLinkMapping> getMappings() {
        return Collections.unmodifiableCollection(mappingsByCrossroadId.values());
    }

    public Set<String> getMappedLinkIds() {
        return mappingsByCrossroadId.values().stream()
                .map(CrossroadRoadLinkMapping::getLinkId)
                .collect(Collectors.toUnmodifiableSet());
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
