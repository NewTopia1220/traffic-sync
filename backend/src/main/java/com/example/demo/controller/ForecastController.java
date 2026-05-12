package com.example.demo.controller;

import com.example.demo.model.ForecastResult;
import com.example.demo.service.ForecastService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api") // 중복되는 경로를 묶어주면 관리하기 편해요
public class ForecastController {

    private final ForecastService forecastService;

    @GetMapping("/forecast/{crsrdId}")
    public ResponseEntity<ForecastResult> getForecast(@PathVariable String crsrdId) {
        ForecastResult result = forecastService.getForecast(crsrdId);
        if (result == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(result);
    }
}