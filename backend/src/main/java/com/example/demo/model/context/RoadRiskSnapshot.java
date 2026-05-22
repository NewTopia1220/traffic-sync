package com.example.demo.model.context;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class RoadRiskSnapshot {
    private String vehicleTypeCode;
    private Double riskIndex;
    private String riskGrade;
    private String lineString;
    private boolean stale;
    private long lastFetchedAtMs;
}
