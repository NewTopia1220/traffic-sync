package com.example.demo.model.context;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class WeatherSnapshot {
    private Double temperatureC;
    private Double precipitationMm;
    private Integer humidityPercent;
    private Double windSpeedMs;
    private String baseDateTime;
    private boolean stale;
    private long lastFetchedAtMs;
}
