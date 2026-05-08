package com.example.demo.scheduler;

import com.example.demo.entity.CrossroadEntity;
import com.example.demo.model.CrossroadInfo;
import com.example.demo.model.TrafficStatus;
import com.example.demo.repository.CrossroadRepository;
import com.example.demo.service.TrafficCacheService;
import com.example.demo.service.V2xApiService;
import com.example.demo.websocket.TrafficWebSocketHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Component
@EnableScheduling
@RequiredArgsConstructor
public class TrafficScheduler {

    private final V2xApiService v2xApiService;
    private final TrafficCacheService cacheService;
    private final TrafficWebSocketHandler webSocketHandler;
    private final CrossroadRepository crossroadRepository;

    @Value("${jamsil.lat}")
    private double jamsilLat;

    @Value("${jamsil.lon}")
    private double jamsilLon;

    @Value("${jamsil.radius-km}")
    private double radiusKm;

    @Scheduled(initialDelay = 5000, fixedRateString = "${traffic.poll.interval-ms}")
    public void pollTrafficData() {
        log.info("===== 교통 데이터 폴링 시작 =====");
        try {
            // DB에서 잠실 반경 교차로 조회
            List<CrossroadEntity> entities = crossroadRepository.findWithinRadius(jamsilLat, jamsilLon, radiusKm);
            if (entities.isEmpty()) {
                log.warn("DB에 반경 내 교차로 없음 - 초기 적재 대기 중");
                return;
            }

            List<CrossroadInfo> crossroads = entities.stream().map(e -> {
                CrossroadInfo info = new CrossroadInfo();
                info.setCrsrdId(e.getCrsrdId());
                info.setCrsrdNm(e.getCrsrdNm());
                info.setLat(e.getLat());
                info.setLon(e.getLon());
                return info;
            }).collect(Collectors.toList());

            log.info("DB 교차로 조회: {}개", crossroads.size());

            Map<String, TrafficStatus> freshData = v2xApiService.fetchSignalData(crossroads);
            cacheService.updateAllSignals(freshData);
            webSocketHandler.broadcast(freshData);

            log.info("===== 폴링 완료: {}개 브로드캐스트 =====", freshData.size());

        } catch (Exception e) {
            log.error("폴링 중 오류 발생: {}", e.getMessage(), e);
        }
    }
}
