package com.example.demo.controller;

import com.example.demo.model.CrossroadInfo;
import com.example.demo.model.TrafficStatus;
import com.example.demo.service.TrafficCacheService;
import com.example.demo.service.V2xApiService;
import com.example.demo.websocket.TrafficWebSocketHandler;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.*;

import java.util.Collection;
import java.util.List;
import java.util.Map;

@Slf4j
@Controller
@RequiredArgsConstructor
public class MapController {

    private final TrafficCacheService cacheService;
    private final V2xApiService v2xApiService;
    private final TrafficWebSocketHandler webSocketHandler;

    @Value("${kakao.map.app-key}")
    private String kakaoAppKey;

    @Value("${jamsil.lat}")
    private double jamsilLat;

    @Value("${jamsil.lon}")
    private double jamsilLon;

    @GetMapping("/")
    public String index(Model model) {
        model.addAttribute("kakaoAppKey", kakaoAppKey);
        model.addAttribute("jamsilLat", jamsilLat);
        model.addAttribute("jamsilLon", jamsilLon);
        return "map";
    }

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
            @RequestParam(defaultValue = "2.5") double radius) {
        try {
            List<CrossroadInfo> crossroads = v2xApiService.fetchCrossroads(lat, lon, radius);
            if (crossroads.isEmpty()) {
                return ResponseEntity.ok(Map.of("count", 0, "message", "해당 구역에 교차로 없음"));
            }
            Map<String, TrafficStatus> signals = v2xApiService.fetchSignalData(crossroads);
            signals.forEach(cacheService::updateSignal);
            webSocketHandler.broadcast(signals);
            log.info("구역 수동 수집: ({},{}) 반경{}km → {}개", lat, lon, radius, signals.size());
            return ResponseEntity.ok(Map.of("count", signals.size(), "message", "ok"));
        } catch (Exception e) {
            log.error("구역 수집 실패: {}", e.getMessage());
            return ResponseEntity.internalServerError().body(Map.of("message", e.getMessage()));
        }
    }
}