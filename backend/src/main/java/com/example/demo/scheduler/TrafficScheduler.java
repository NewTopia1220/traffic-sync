package com.example.demo.scheduler;

import com.example.demo.entity.CrossroadEntity;
import com.example.demo.model.CrossroadInfo;
import com.example.demo.model.TrafficStatus;
import com.example.demo.repository.CrossroadRepository;
import com.example.demo.service.SupplementalDataCacheService;
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
    // TOPIS 속도, 도로위험도, 날씨 등 보조 API 캐시를 TrafficStatus에 합치는 서비스
    private final SupplementalDataCacheService supplementalDataCacheService;

    @Value("${jamsil.lat}")
    private double jamsilLat;

    @Value("${jamsil.lon}")
    private double jamsilLon;

    @Value("${jamsil.radius-km}")
    private double radiusKm;

    @PostConstruct
    // 애플리케이션 시작 시 기본 구역(강남구) 좌표 설정 — 10초 후 첫 폴링이 이 좌표로 수집
    public void init() {
        cacheService.setCenter(jamsilLat, jamsilLon, radiusKm);
    }

    // 5초 후 첫 실행, 이후 ${traffic.poll.interval-ms}마다 실행 (예: 10000ms = 10초)
    @Scheduled(initialDelay = 10000, fixedRateString = "${traffic.poll.interval-ms}")
    public void pollTrafficData() {
        if (cacheService.isAreaRefreshInProgress()) {
            log.info("구역 수집 중이라 정기 폴링을 건너뜀");
            return;
        }
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

            // V2X API 타임아웃 등으로 빈 결과가 오면 캐시를 빈 맵으로 덮어쓰지 않고 건너뜀
            if (freshData.isEmpty()) {
                log.warn("폴링: V2X API 빈 결과 (DB 교차로 {}개) — 캐시 유지, 다음 폴링에서 재시도", crossroads.size());
                return;
            }

            // 프론트와 챗봇이 같은 값을 쓰도록 실제 보조 API 캐시와 계산 지표를 합친다.
            supplementalDataCacheService.enrichTrafficStatuses(freshData);
            // API 호출 결과를 캐시에 업데이트 (교차로ID → 신호 상태 맵)
            cacheService.updateAllSignals(freshData);
            // WebSocket 핸들러를 통해 프론트엔드에 실시간 데이터 브로드캐스트
            webSocketHandler.broadcast(freshData);

            log.info("===== 폴링 완료: {}개 브로드캐스트 =====", freshData.size());

        } catch (Exception e) {
            log.error("폴링 중 오류 발생: {}", e.getMessage(), e);
        }
    }
}
