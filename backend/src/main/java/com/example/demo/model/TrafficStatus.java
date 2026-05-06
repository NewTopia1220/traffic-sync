package com.example.demo.model;

import lombok.Data;
import java.util.Map;

// WebSocket으로 프론트에 전송하는 최종 데이터
@Data
public class TrafficStatus {
    private String crsrdId;
    private String crsrdNm;
    private double lat;
    private double lon;

    // key: "nt","et","st","wt","ne","se","sw","nw"
    private Map<String, SignalDirection> signals;

    private String totDt;       // API 원본 수집 시각 (예: "20260506113801")
    private long serverTimeMs;  // Spring Boot가 데이터를 처리한 시각 (epoch ms)
                                // 프론트에서 (serverTimeMs - parseTotDt) 로 경과시간 계산
}
