package com.example.demo.service;

import com.example.demo.model.SignalDirection;
import com.example.demo.model.TrafficStatus;
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

    // 구역을 새로 선택하면 이전 구역의 도로 링크/속도/위험도 값이 섞이지 않도록 비운다.
    public void clearRoadSupplementalData() {
        mappingsByCrossroadId.clear();
        directionalMappingsByCrossroadId.clear();
        speedsByLinkId.clear();
        risksByLinkId.clear();
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

    // V2X 신호만 들어 있는 TrafficStatus에 실제 보조 API 값을 합쳐서
    // 프론트와 챗봇이 같은 "현재 교차로 상태"를 보도록 만든다.
    public Map<String, TrafficStatus> enrichTrafficStatuses(Map<String, TrafficStatus> statuses) {
        if (statuses == null) {
            return Collections.emptyMap();
        }
        statuses.values().forEach(this::enrichTrafficStatus);
        return statuses;
    }

    public TrafficStatus enrichTrafficStatus(TrafficStatus status) {
        if (status == null) {
            return null;
        }

        status.setWeather(getWeather().orElse(null));
        status.setAvgWaitSec(calculateAverageWaitSec(status.getSignals()));

        CrossroadRoadLinkMapping mapping = getMapping(status.getCrsrdId()).orElse(null);
        RoadSpeedSnapshot speed = hasLinkId(mapping) ? getSpeed(mapping.getLinkId()).orElse(null) : null;
        RoadRiskSnapshot risk = hasLinkId(mapping) ? getRisk(mapping.getLinkId()).orElse(null) : null;

        applySpeed(status, speed);
        applyRisk(status, risk);

        // 속도 API가 아직 없으면 신호 잔여시간으로만 임시 혼잡도를 계산한다.
        // 랜덤값은 사용하지 않기 때문에 실제 데이터가 없을 때는 stale 플래그로 구분할 수 있다.
        status.setCongestion(calculateCongestion(status.getSpeedKph(), status.getSignals()));
        return status;
    }

    private void applySpeed(TrafficStatus status, RoadSpeedSnapshot speed) {
        if (speed == null) {
            status.setSpeedKph(null);
            status.setTravelTimeSec(null);
            status.setSpeedStale(true);
            return;
        }

        status.setSpeedKph(speed.getSpeedKph());
        status.setTravelTimeSec(speed.getTravelTimeSec());
        status.setSpeedStale(speed.isStale());
    }

    private void applyRisk(TrafficStatus status, RoadRiskSnapshot risk) {
        if (risk == null) {
            status.setRiskIndex(null);
            status.setRiskGrade(null);
            status.setRiskScore(null);
            status.setRiskStale(true);
            return;
        }

        status.setRiskIndex(risk.getRiskIndex());
        status.setRiskGrade(risk.getRiskGrade());
        status.setRiskScore(toRiskScore(risk));
        status.setRiskStale(risk.isStale());
    }

    private Integer calculateAverageWaitSec(Map<String, SignalDirection> signals) {
        if (signals == null || signals.isEmpty()) {
            return null;
        }

        int sum = 0;
        int count = 0;
        for (SignalDirection direction : signals.values()) {
            if (direction == null || direction.getStsg() == null) {
                continue;
            }
            sum += direction.getStsg().getRmndCs() / 10;
            count++;
        }
        return count == 0 ? null : Math.round((float) sum / count);
    }

    private String calculateCongestion(Double speedKph, Map<String, SignalDirection> signals) {
        if (speedKph != null) {
            if (speedKph < 20) {
                return "혼잡";
            }
            if (speedKph < 40) {
                return "서행";
            }
            return "원활";
        }

        Integer redWaitSec = calculateAverageRedStraightWaitSec(signals);
        if (redWaitSec == null) {
            return "알 수 없음";
        }
        if (redWaitSec > 60) {
            return "혼잡";
        }
        if (redWaitSec > 30) {
            return "서행";
        }
        return "원활";
    }

    private Integer calculateAverageRedStraightWaitSec(Map<String, SignalDirection> signals) {
        if (signals == null || signals.isEmpty()) {
            return null;
        }

        int sum = 0;
        int count = 0;
        for (SignalDirection direction : signals.values()) {
            if (direction == null || direction.getStsg() == null) {
                continue;
            }
            String status = direction.getStsg().getStatus();
            if (status != null && status.toLowerCase().contains("stop")) {
                sum += direction.getStsg().getRmndCs() / 10;
                count++;
            }
        }
        return count == 0 ? 0 : Math.round((float) sum / count);
    }

    private Integer toRiskScore(RoadRiskSnapshot risk) {
        if (risk.getRiskIndex() != null) {
            return clampScore((int) Math.round(risk.getRiskIndex()));
        }

        int grade = parseRiskGrade(risk.getRiskGrade());
        return grade < 0 ? null : clampScore(grade * 20);
    }

    private int parseRiskGrade(String riskGrade) {
        if (riskGrade == null || riskGrade.isBlank()) {
            return -1;
        }
        try {
            return Integer.parseInt(riskGrade.trim());
        } catch (NumberFormatException ignored) {
            return -1;
        }
    }

    private int clampScore(int score) {
        return Math.max(0, Math.min(100, score));
    }

    private boolean hasLinkId(CrossroadRoadLinkMapping mapping) {
        return mapping != null && mapping.getLinkId() != null && !mapping.getLinkId().isBlank();
    }
}
