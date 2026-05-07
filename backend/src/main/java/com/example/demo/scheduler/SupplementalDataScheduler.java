package com.example.demo.scheduler;

import com.example.demo.model.CrossroadInfo;
import com.example.demo.model.context.CrossroadRoadLinkMapping;
import com.example.demo.model.context.RoadRiskSnapshot;
import com.example.demo.model.context.RoadSpeedSnapshot;
import com.example.demo.model.context.TopisLinkGeometry;
import com.example.demo.model.context.WeatherSnapshot;
import com.example.demo.service.RoadLinkMappingService;
import com.example.demo.service.RoadRiskApiService;
import com.example.demo.service.SupplementalDataCacheService;
import com.example.demo.service.TopisApiService;
import com.example.demo.service.TrafficCacheService;
import com.example.demo.service.WeatherApiService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.Optional;

@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(name = "traffic.supplemental.enabled", havingValue = "true", matchIfMissing = true)
public class SupplementalDataScheduler {

    private final WeatherApiService weatherApiService;
    private final TopisApiService topisApiService;
    private final RoadRiskApiService roadRiskApiService;
    private final RoadLinkMappingService roadLinkMappingService;
    private final TrafficCacheService trafficCacheService;
    private final SupplementalDataCacheService supplementalDataCacheService;

    @Scheduled(initialDelay = 3000, fixedRateString = "${weather.poll.interval-ms:600000}")
    public void refreshWeather() {
        if (!weatherApiService.isConfigured()) {
            log.debug("KMA service key not configured; weather refresh skipped");
            return;
        }

        try {
            WeatherSnapshot weather = weatherApiService.fetchJamsilWeather();
            supplementalDataCacheService.updateWeather(weather);
            log.info("기상청 날씨 갱신 완료: baseDateTime={}", weather.getBaseDateTime());
        } catch (Exception e) {
            supplementalDataCacheService.markWeatherStale();
            log.warn("기상청 날씨 갱신 실패: {}", e.getMessage());
        }
    }

    @Scheduled(initialDelay = 10000, fixedRateString = "${road-link.mapping.interval-ms:86400000}")
    public void refreshRoadLinkMappings() {
        if (!topisApiService.hasLinkGeometrySource()) {
            log.debug("TOPIS link geometry source not configured; road link mapping skipped");
            return;
        }

        List<CrossroadInfo> crossroads = trafficCacheService.getCrossroads();
        if (crossroads.isEmpty()) {
            log.debug("교차로 캐시가 비어 있어 TOPIS 링크 매핑을 건너뜀");
            return;
        }

        try {
            Map<String, TopisLinkGeometry> geometries = topisApiService.fetchAllLinkGeometries();
            Map<String, CrossroadRoadLinkMapping> mappings =
                    roadLinkMappingService.mapCrossroadsToNearestLinks(crossroads, geometries.values());
            supplementalDataCacheService.updateMappings(mappings);
        } catch (Exception e) {
            log.warn("TOPIS 링크 매핑 갱신 실패: {}", e.getMessage());
        }
    }

    @Scheduled(initialDelay = 15000, fixedRateString = "${topis.speed.poll.interval-ms:60000}")
    public void refreshRoadSpeeds() {
        if (!topisApiService.isConfigured()) {
            log.debug("TOPIS service key not configured; speed refresh skipped");
            return;
        }

        for (String linkId : supplementalDataCacheService.getMappedLinkIds()) {
            try {
                Optional<RoadSpeedSnapshot> speed = topisApiService.fetchSpeed(linkId);
                speed.ifPresent(supplementalDataCacheService::updateSpeed);
            } catch (Exception e) {
                supplementalDataCacheService.markSpeedsStale();
                log.warn("TOPIS 구간속도 갱신 실패 (linkId={}): {}", linkId, e.getMessage());
            }
        }
    }

    @Scheduled(initialDelay = 20000, fixedRateString = "${road-risk.poll.interval-ms:300000}")
    public void refreshRoadRisks() {
        if (!roadRiskApiService.isConfigured()) {
            log.debug("Road risk service key not configured; risk refresh skipped");
            return;
        }

        for (CrossroadRoadLinkMapping mapping : supplementalDataCacheService.getMappings()) {
            try {
                Optional<RoadRiskSnapshot> risk = roadRiskApiService.fetchRisk(mapping);
                risk.ifPresent(snapshot -> supplementalDataCacheService.updateRisk(mapping.getLinkId(), snapshot));
            } catch (Exception e) {
                supplementalDataCacheService.markRisksStale();
                log.warn("도로위험지수 갱신 실패 (linkId={}): {}", mapping.getLinkId(), e.getMessage());
            }
        }
    }
}
