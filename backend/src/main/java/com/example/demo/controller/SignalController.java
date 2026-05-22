package com.example.demo.controller;

import com.example.demo.service.SignalService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/signal")
@CrossOrigin(origins = "http://localhost:5173")
@RequiredArgsConstructor
public class SignalController {

    private final SignalService signalService;

    // 교차로 전체 목록 (지도에 핀 표시용)
    @GetMapping("/crossroads")
    public ResponseEntity<List<Map<String, Object>>> getCrossroads() {
        return ResponseEntity.ok(signalService.getAllCrossroads());
    }

    // 교차로 클릭 시 현시구성 + 운영계획 조회
    @GetMapping("/crossroads/{intNo}")
    public ResponseEntity<Map<String, Object>> getSignalData(@PathVariable String intNo) {
        Map<String, Object> data = signalService.getSignalData(intNo);
        if (data.containsKey("error")) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(data);
    }
}
