package com.example.demo.scheduler;

import com.example.demo.model.CrossroadInfo;
import com.example.demo.model.TrafficStatus;
import com.example.demo.service.TrafficCacheService;
import com.example.demo.service.V2xApiService;
import com.example.demo.websocket.TrafficWebSocketHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Component
@EnableScheduling
@ConditionalOnProperty(name = "traffic.scheduler.enabled", havingValue = "true", matchIfMissing = true)
@RequiredArgsConstructor
public class TrafficScheduler {

    private static final int STALE_THRESHOLD_MIN = 180;
    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter TOTDT_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    private final V2xApiService v2xApiService;
    private final TrafficCacheService cacheService;
    private final TrafficWebSocketHandler webSocketHandler;

    @Scheduled(initialDelay = 1000, fixedRateString = "${traffic.poll.interval-ms}")
    public void pollTrafficData() {
        log.info("Traffic polling started");

        try {
            List<CrossroadInfo> crossroads = v2xApiService.fetchJamsilCrossroads();
            cacheService.updateCrossroads(crossroads);

            if (crossroads.isEmpty()) {
                log.warn("No crossroads found in the configured Jamsil radius");
                return;
            }

            Map<String, TrafficStatus> freshData = v2xApiService.fetchSignalData(crossroads);
            cacheService.updateAllSignals(freshData);

            Map<String, TrafficStatus> filtered = filterRecentSignals(freshData);
            webSocketHandler.broadcast(filtered);

            log.info("Traffic polling finished: fetched={} broadcast={}", freshData.size(), filtered.size());
        } catch (Exception e) {
            log.error("Traffic polling failed: {}", e.getMessage(), e);
        }
    }

    private Map<String, TrafficStatus> filterRecentSignals(Map<String, TrafficStatus> freshData) {
        Map<String, TrafficStatus> filtered = new HashMap<>();
        ZonedDateTime now = ZonedDateTime.now(KST);

        freshData.forEach((id, status) -> {
            try {
                String totDt = status.getTotDt();
                if (totDt == null || totDt.length() != 14) {
                    return;
                }

                LocalDateTime parsed = LocalDateTime.parse(totDt, TOTDT_FMT);
                ZonedDateTime collectedAt = parsed.atZone(KST);
                long minutesOld = Duration.between(collectedAt, now).toMinutes();
                if (minutesOld <= STALE_THRESHOLD_MIN) {
                    filtered.put(id, status);
                } else {
                    log.debug("Skipped stale signal data: {} ({} minutes old)", status.getCrsrdNm(), minutesOld);
                }
            } catch (Exception e) {
                log.warn("Failed to parse totDt: {}", status.getTotDt());
            }
        });

        return filtered;
    }
}
