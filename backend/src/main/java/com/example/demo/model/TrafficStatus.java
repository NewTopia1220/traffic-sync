package com.example.demo.model;

import lombok.Data;

import java.util.Map;

// WebSocket과 REST API로 내려주는 교차로별 최신 신호 데이터.
@Data
public class TrafficStatus {
    private String crsrdId;
    private String crsrdNm;
    private double lat;
    private double lon;

    // key: "nt","et","st","wt","ne","se","sw","nw"
    private Map<String, SignalDirection> signals;

    // V2X 원본 수집 시각. 예: "20260506113801"
    private String totDt;

    // Spring Boot가 데이터를 처리한 시각(epoch ms).
    private long serverTimeMs;
}
