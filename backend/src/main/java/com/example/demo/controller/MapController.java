package com.example.demo.controller;

import com.example.demo.model.TrafficStatus;
import com.example.demo.service.TrafficCacheService;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ResponseBody;

import java.util.Collection;

@Controller
@RequiredArgsConstructor
public class MapController {

    private final TrafficCacheService cacheService;

    @Value("${kakao.map.app-key}")
    private String kakaoAppKey;

    @Value("${jamsil.lat}")
    private double jamsilLat;

    @Value("${jamsil.lon}")
    private double jamsilLon;

    // 메인 지도 페이지
    @GetMapping("/")
    public String index(Model model) {
        model.addAttribute("kakaoAppKey", kakaoAppKey);
        model.addAttribute("jamsilLat", jamsilLat);
        model.addAttribute("jamsilLon", jamsilLon);
        return "map";
    }

    // 현재 캐시된 신호 데이터 REST로도 제공 (디버깅용)
    @GetMapping("/api/signals")
    @ResponseBody
    public Collection<TrafficStatus> getSignals() {
        return cacheService.getAllSignals().values();
    }
}
