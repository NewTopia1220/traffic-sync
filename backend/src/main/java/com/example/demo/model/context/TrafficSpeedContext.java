package com.example.demo.model.context;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TrafficSpeedContext {
    private String linkId;
    private Double speedKph;
    private Integer travelTimeSec;
    private Double distanceMeters;
    private boolean stale;
}
