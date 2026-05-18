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
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.concurrent.Callable;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.stream.Collectors;
import java.util.function.Consumer;

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

    @Value("${traffic.supplemental.parallelism:24}")
    private int supplementalParallelism;

    @Scheduled(initialDelay = 3000, fixedRateString = "${weather.poll.interval-ms:600000}")
    public void refreshWeather() {
        if (!weatherApiService.isConfigured()) {
            log.debug("KMA service key not configured; weather refresh skipped");
            return;
        }

        try {
            WeatherSnapshot weather = weatherApiService.fetchJamsilWeather();
            supplementalDataCacheService.updateWeather(weather);
            log.info("Weather refreshed: baseDateTime={}", weather.getBaseDateTime());
        } catch (Exception e) {
            supplementalDataCacheService.markWeatherStale();
            log.warn("Weather refresh failed: {}", e.getMessage());
        }
    }

    @Scheduled(initialDelay = 10000, fixedRateString = "${road-link.mapping.interval-ms:86400000}")
    public void refreshRoadLinkMappings() {
        long startedAtMs = System.currentTimeMillis();
        if (!topisApiService.hasLinkGeometrySource()) {
            log.debug("TOPIS link geometry source not configured; road link mapping skipped");
            return;
        }

        List<CrossroadInfo> crossroads = trafficCacheService.getCrossroads();
        if (crossroads.isEmpty()) {
            log.debug("Crossroad cache is empty; road link mapping skipped");
            return;
        }

        try {
            Map<String, TopisLinkGeometry> geometries = topisApiService.fetchAllLinkGeometries();
            Map<String, CrossroadRoadLinkMapping> mappings =
                    roadLinkMappingService.mapCrossroadsToNearestLinks(crossroads, geometries.values());
            Map<String, Map<String, CrossroadRoadLinkMapping>> directionalMappings =
                    roadLinkMappingService.mapCrossroadsToDirectionalLinks(crossroads, geometries.values());
            supplementalDataCacheService.updateMappings(mappings);
            supplementalDataCacheService.updateDirectionalMappings(directionalMappings);
            log.info("TOPIS road link mapping refreshed: crossroads={}, nearest={}, directional={}, elapsedMs={}",
                    crossroads.size(), mappings.size(), directionalMappings.size(), System.currentTimeMillis() - startedAtMs);
        } catch (Exception e) {
            log.warn("TOPIS road link mapping refresh failed: {}", e.getMessage());
        }
    }

    @Scheduled(initialDelay = 15000, fixedRateString = "${topis.speed.poll.interval-ms:60000}")
    public void refreshRoadSpeeds() {
        long startedAtMs = System.currentTimeMillis();
        if (!topisApiService.isConfigured()) {
            log.debug("TOPIS service key not configured; speed refresh skipped");
            return;
        }

        // 화면 표시에 쓰는 값은 교차로별 대표 링크 하나면 충분하다. 방향별 링크까지 조회하면 구 클릭이 과도하게 느려진다.
        Set<String> linkIds = supplementalDataCacheService.getMappings().stream()
                .map(CrossroadRoadLinkMapping::getLinkId)
                .filter(linkId -> linkId != null && !linkId.isBlank())
                .collect(Collectors.toSet());
        AtomicInteger successCount = new AtomicInteger(0);
        forEachParallel(linkIds, linkId -> {
            try {
                Optional<RoadSpeedSnapshot> speed = topisApiService.fetchSpeed(linkId);
                if (speed.isPresent()) {
                    supplementalDataCacheService.updateSpeed(speed.get());
                    successCount.incrementAndGet();
                }
            } catch (Exception e) {
                supplementalDataCacheService.markSpeedsStale();
                log.warn("TOPIS speed refresh failed (linkId={}): {}", linkId, e.getMessage());
            }
        });
        log.info("TOPIS speed refreshed: success={}/{}, elapsedMs={}", successCount.get(), linkIds.size(), System.currentTimeMillis() - startedAtMs);
    }

    @Scheduled(initialDelay = 20000, fixedRateString = "${road-risk.poll.interval-ms:300000}")
    public void refreshRoadRisks() {
        long startedAtMs = System.currentTimeMillis();
        if (!roadRiskApiService.isConfigured()) {
            log.debug("Road risk service key not configured; risk refresh skipped");
            return;
        }

        // 위험도도 현재 대시보드가 사용하는 대표 링크 기준으로만 수집한다.
        Collection<CrossroadRoadLinkMapping> mappings = supplementalDataCacheService.getMappings();
        AtomicInteger successCount = new AtomicInteger(0);
        forEachParallel(mappings, mapping -> {
            try {
                Optional<RoadRiskSnapshot> risk = roadRiskApiService.fetchRisk(mapping);
                if (risk.isPresent()) {
                    supplementalDataCacheService.updateRisk(mapping.getLinkId(), risk.get());
                    successCount.incrementAndGet();
                }
            } catch (Exception e) {
                supplementalDataCacheService.markRisksStale();
                log.warn("Road risk refresh failed (linkId={}): {}", mapping.getLinkId(), e.getMessage());
            }
        });
        log.info("Road risk refreshed: success={}/{}, elapsedMs={}", successCount.get(), mappings.size(), System.currentTimeMillis() - startedAtMs);
    }

    private <T> void forEachParallel(Collection<T> items, Consumer<T> action) {
        if (items.isEmpty()) {
            return;
        }

        int threadCount = Math.max(1, Math.min(supplementalParallelism, items.size()));
        ExecutorService executor = Executors.newFixedThreadPool(threadCount);
        try {
            List<Callable<Void>> tasks = new ArrayList<>();
            for (T item : items) {
                tasks.add(() -> {
                    action.accept(item);
                    return null;
                });
            }
            executor.invokeAll(tasks);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.warn("Supplemental parallel refresh interrupted: {}", e.getMessage());
        } finally {
            executor.shutdownNow();
        }
    }
}
