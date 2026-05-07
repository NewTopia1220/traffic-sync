package com.example.demo.model;

import lombok.Data;
import java.util.Map;

@Data
public class TrafficContext {
    private String crsrdId;
    private String crsrdNm;
    private long delayMin;
    private Map<String, SignalDirection> signals;
    private WeatherInfo weather;
    private SpeedInfo speed;
    private RiskInfo risk;
}
