package com.example.demo.model.context;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DirectionRoadContext {
    private String directionCode;
    private String directionNameKo;
    private String linkId;
    private Double distanceMeters;
    private Double bearingDegrees;
    private Double speedKph;
    private Integer travelTimeSec;
    private boolean speedStale;
    private RoadRiskSnapshot roadRisk;
}
