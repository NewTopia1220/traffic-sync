package com.example.demo.controller;

import com.example.demo.entity.CrossroadEntity;
import com.example.demo.model.CrossroadInfo;
import com.example.demo.model.TrafficStatus;
import com.example.demo.repository.CrossroadRepository;
import com.example.demo.service.ChatService;
import com.example.demo.service.TrafficCacheService;
import com.example.demo.service.V2xApiService;
import com.example.demo.websocket.TrafficWebSocketHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@RestController
@RequiredArgsConstructor
@CrossOrigin(origins = "http://localhost:5173")
public class MapController {


    //서비스 주입
    private final TrafficCacheService cacheService;
    private final V2xApiService v2xApiService;
    private final TrafficWebSocketHandler webSocketHandler;
    private final CrossroadRepository crossroadRepository;
    private final ChatService chatService;

    @Value("${kakao.map.app-key}")
    private String kakaoAppKey;

    @Value("${jamsil.lat}")
    private double jamsilLat;

    @Value("${jamsil.lon}")
    private double jamsilLon;


    //지도 페이지 렌더링
    //캐시에 있는 전체 신호 데이터 반환하는 REST API 엔드포인트
    //웹소켓으로 이미 실시간으로 받고 있으니 --> 디버깅용임
    @GetMapping("/api/signals")
    @ResponseBody
    public Collection<TrafficStatus> getSignals() {
        return cacheService.getAllSignals().values();
    }

    @PostMapping("/api/fetch-area")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> fetchArea(
            @RequestParam double lat,
            @RequestParam double lon,
            @RequestParam(defaultValue = "1.0") double radius) {
        try {
            // 선택된 구 좌표 캐시에 저장 → 스케줄러가 이 좌표로 폴링
            cacheService.setCenter(lat, lon, radius);

            // DB에서 해당 좌표 반경 교차로 조회
            List<CrossroadEntity> entities = crossroadRepository.findWithinRadius(lat, lon, radius);
            // 해당 구역에 교차로가 없으면 바로 응답
            if (entities.isEmpty()) {
                return ResponseEntity.ok(Map.of("count", 0, "message", "해당 구역에 교차로 없음"));
            }
            //[
            //  CrossroadEntity { crsrdId: "1007", crsrdNm: "잠실역사거리", lat: 37.51, lon: 127.08 }
            //  CrossroadEntity { crsrdId: "1008", crsrdNm: "석촌역사거리", lat: 37.50, lon: 127.10 }
            //  CrossroadEntity { crsrdId: "1009", crsrdNm: "롯데타워교차로", lat: 37.51, lon: 127.10 }
            //]

            //e = CrossroadEntity { crsrdId: "1007", ... } --> 하나씩 CrossroadInfo로 변환
            List<CrossroadInfo> crossroads = entities.stream().map(e -> {
                CrossroadInfo info = new CrossroadInfo();
                info.setCrsrdId(e.getCrsrdId());
                info.setCrsrdNm(e.getCrsrdNm());
                info.setLat(e.getLat());
                info.setLon(e.getLon());
                return info;

            }).collect(Collectors.toList()); // .collect(Collectors.toList())  // Stream → List (파이프라인 종료)

            //최종적으론 List<CrossroadInfo> crossroads = [
            //    CrossroadInfo { crsrdId: "1007", crsrdNm: "잠실역사거리",  lat: 37.51, lon: 127.08 },
            //    CrossroadInfo { crsrdId: "1008", crsrdNm: "석촌역사거리",  lat: 37.50, lon: 127.10 },
            //    CrossroadInfo { crsrdId: "1009", crsrdNm: "롯데타워교차로", lat: 37.51, lon: 127.10 }
            //] 이렇게 저장되서 v2xApiService.fetchSignalData(crossroads)로 전달됨

            Map<String, TrafficStatus> signals = v2xApiService.fetchSignalData(crossroads);

            //위에서 다 찾은 교차로ID → 신호 상태 맵을 캐시에 업데이트
            //signals = {
            //    "1007" → TrafficStatus { crsrdNm: "잠실역사거리", signals: {...} }
            //    "1008" → TrafficStatus { crsrdNm: "석촌역사거리", signals: {...} }
            //    "1009" → TrafficStatus { crsrdNm: "롯데타워교차로", signals: {...} }
            //}

            //forEach 돌면:
            //cacheService.updateSignal("1007", TrafficStatus {...})  // 캐시에 저장
            //cacheService.updateSignal("1008", TrafficStatus {...})  // 캐시에 저장
            //cacheService.updateSignal("1009", TrafficStatus {...})  // 캐시에 저장
            signals.forEach(cacheService::updateSignal);

            webSocketHandler.broadcast(signals);
            log.info("구역 수집: ({},{}) 반경{}km → {}개", lat, lon, radius, signals.size());
            return ResponseEntity.ok(Map.of("count", signals.size(), "message", "ok"));
        } catch (Exception e) {
            log.error("구역 수집 실패: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("message", e.getMessage()));
        }
    }

    // 구 단위 AI 리포트 — 메인 대시보드 구 클릭 시 호출
    @PostMapping("/api/district/report")
    @ResponseBody
    public ResponseEntity<Map<String, Object>> districtReport(@RequestBody Map<String, String> body) {
        String district = body.get("district");
        if (district == null || district.isBlank()) {
            return ResponseEntity.badRequest().body(Map.of("error", "district 파라미터가 필요합니다."));
        }
        try {
            String report = chatService.districtReport(district);
            return ResponseEntity.ok(Map.of("report", report, "district", district));
        } catch (Exception e) {
            log.error("구 리포트 생성 실패: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("error", e.getMessage()));
        }
    }
}