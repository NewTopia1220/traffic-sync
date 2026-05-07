package com.example.demo.model.context;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IntersectionAiContext {
    private String crsrdId;
    private String crsrdNm;
    private double lat;
    private double lon;
    private SignalContext signal;
    private WeatherSnapshot weather;
    private TrafficSpeedContext trafficSpeed;
    private RoadRiskSnapshot roadRisk;
    private String summaryKo;
}
