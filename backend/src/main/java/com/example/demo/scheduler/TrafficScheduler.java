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
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Component
@RequiredArgsConstructor
public class TrafficScheduler {

    // V2X 공공API 호출 서비스
    private final V2xApiService v2xApiService;
    // 교차로 신호 상태 캐시 서비스
    private final TrafficCacheService cacheService;
    // WebSocket 핸들러 (실시간 데이터 브로드캐스트)
    private final TrafficWebSocketHandler webSocketHandler;
    // 교차로 정보 DB 접근 레포지토리
    private final CrossroadRepository crossroadRepository;

    @Value("${jamsil.lat}")
    private double jamsilLat;

    @Value("${jamsil.lon}")
    private double jamsilLon;

    @Value("${jamsil.radius-km}")
    private double radiusKm;

    @PostConstruct
    // 애플리케이션 시작 시 초기 중심 좌표 설정 (잠실)
    public void init() {
        cacheService.setCenter(jamsilLat, jamsilLon, radiusKm);
    }

    // 5초 후 첫 실행, 이후 ${traffic.poll.interval-ms}마다 실행 (예: 10000ms = 10초)
    @Scheduled(initialDelay = 100000, fixedRateString = "${traffic.poll.interval-ms}")
    public void pollTrafficData() {
        log.info("===== 교통 데이터 폴링 시작 =====");
        try {
            // DB에서 현재 선택된 구 반경 교차로 조회 (기본: 잠실)
            List<CrossroadEntity> entities = crossroadRepository.findWithinRadius(
                cacheService.getCenterLat(), cacheService.getCenterLon(), cacheService.getCenterRadius()
            );
            if (entities.isEmpty()) {
                log.warn("DB에 반경 내 교차로 없음 - 초기 적재 대기 중");
                return;
            }


            // DB에서 조회된 교차로 엔티티를 API 호출에 필요한 CrossroadInfo 모델로 변환
            List<CrossroadInfo> crossroads = entities.stream().map(e -> {
                CrossroadInfo info = new CrossroadInfo();
                info.setCrsrdId(e.getCrsrdId());
                info.setCrsrdNm(e.getCrsrdNm());
                info.setLat(e.getLat());
                info.setLon(e.getLon());
                return info;
            }).collect(Collectors.toList());

            log.info("DB 교차로 조회: {}개", crossroads.size());

            // V2X API 호출하여 교차로별 최신 신호 상태 가져오기
            Map<String, TrafficStatus> freshData = v2xApiService.fetchSignalData(crossroads);
            // API 호출 결과를 캐시에 업데이트 (교차로ID → 신호 상태 맵)
            cacheService.updateAllSignals(freshData);
            // WebSocket 핸들러를 통해 프론트엔드에 실시간 데이터 브로드캐스트 (예: { "CRSRD001": { stsg: "녹색", rmndCs: 150 }, ... })
            webSocketHandler.broadcast(freshData);

            log.info("===== 폴링 완료: {}개 브로드캐스트 =====", freshData.size());

        } catch (Exception e) {
            log.error("폴링 중 오류 발생: {}", e.getMessage(), e);
        }
    }
}
