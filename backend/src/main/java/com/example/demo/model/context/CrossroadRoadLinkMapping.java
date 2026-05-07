package com.example.demo.model.context;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class CrossroadRoadLinkMapping {
    private String crsrdId;
    private String linkId;
    private double distanceMeters;
    private List<GeoPoint> vertices;
    private String lineString;
}
