package com.example.demo.scheduler;

import com.example.demo.model.CrossroadInfo;
import com.example.demo.model.TrafficStatus;
import com.example.demo.service.TrafficCacheService;
import com.example.demo.service.V2xApiService;
import com.example.demo.websocket.TrafficWebSocketHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

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
@RequiredArgsConstructor
public class TrafficScheduler {

    private static final int STALE_THRESHOLD_MIN = 99999;
    private static final DateTimeFormatter TOTDT_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    private final V2xApiService v2xApiService;
    private final TrafficCacheService cacheService;
    private final TrafficWebSocketHandler webSocketHandler;

    @Scheduled(initialDelay = 1000, fixedRateString = "${traffic.poll.interval-ms}")
    public void pollTrafficData() {
        log.info("===== 교통 데이터 폴링 시작 =====");

        try {
            // 교차로 목록은 매번 새로 가져옴 (서버 재시작 없이 좌표 변경 대응)
            List<CrossroadInfo> crossroads = v2xApiService.fetchJamsilCrossroads();
            cacheService.updateCrossroads(crossroads);

            if (crossroads.isEmpty()) {
                log.warn("설정된 반경 내 교차로 데이터 없음");
                return;
            }

            // 2. 신호 데이터 수집
            Map<String, TrafficStatus> freshData = v2xApiService.fetchSignalData(crossroads);

            // 3. 캐시 업데이트
            cacheService.updateAllSignals(freshData);

            // 4. 5분 이상 오래된 교차로 제외
            Map<String, TrafficStatus> filtered = new HashMap<>();
            ZonedDateTime now = ZonedDateTime.now(ZoneId.of("Asia/Seoul"));
            freshData.forEach((id, status) -> {
                try {
                    String totDt = status.getTotDt();
                    if (totDt != null && totDt.length() == 14) {
                        LocalDateTime dt = LocalDateTime.parse(totDt, TOTDT_FMT);
                        ZonedDateTime totDtKst = dt.atZone(ZoneId.of("Asia/Seoul"));
                        long minutesOld = java.time.Duration.between(totDtKst, now).toMinutes();
                        if (minutesOld <= STALE_THRESHOLD_MIN) {
                            filtered.put(id, status);
                        } else {
                            log.debug("오래된 데이터 제외: {} ({}분 전)", status.getCrsrdNm(), minutesOld);
                        }
                    }
                } catch (Exception e) {
                    log.warn("totDt 파싱 실패: {}", status.getTotDt());
                }
            });

            // 5. WebSocket으로 필터링된 데이터 브로드캐스트
            webSocketHandler.broadcast(filtered);

            log.info("===== 폴링 완료: 전체 {}개 / 정상 {}개 브로드캐스트 =====", freshData.size(), filtered.size());

        } catch (Exception e) {
            log.error("폴링 중 오류 발생: {}", e.getMessage(), e);
        }
    }
}
