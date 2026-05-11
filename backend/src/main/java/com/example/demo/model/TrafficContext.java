package com.example.demo.model;

import lombok.Data;
import java.util.Map;

@Data
// 교차로의 실시간 교통 상황을 나타내는 클래스
// 교차로 ID, 이름, 지연 시간, 신호 상태, 날씨 정보, 속도 정보, 위험 정보 등을 포함
public class TrafficContext {
    private String crsrdId;
    private String crsrdNm;
    private long delayMin;
    //TrafficStatus 중요 !!
    //└── signals: Map
    //      ├── "et" (String key)
    //      │     └── SignalDirection
    //      │           └── stsg: DirectionSignal { status, rmndCs }
    //      ├── "st"
    //      │     └── SignalDirection
    //      │           └── pdsg: DirectionSignal { status, rmndCs }
    //      └── "wt"
    //            └── SignalDirection
    //                  └── stsg: DirectionSignal { status, rmndCs }
    private Map<String, SignalDirection> signals;
    private WeatherInfo weather;
    private SpeedInfo speed;
    private RiskInfo risk;
}
