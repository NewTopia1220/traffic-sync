package com.example.demo.model.context;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.LinkedHashMap;
import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class IntersectionAiContext {
    // 선택된 교차로의 식별자와 기본 위치 정보.
    private String crsrdId;
    private String crsrdNm;
    private double lat;
    private double lon;

    // V2X 신호 데이터. signal.directions.et.stsg.status 처럼 계층형 JSON으로 내려간다.
    private SignalContext signal;

    // 날씨, 구간속도, 도로위험도는 보조 API에서 수집한 현재 스냅샷이다.
    private WeatherSnapshot weather;
    private TrafficSpeedContext trafficSpeed;
    private RoadRiskSnapshot roadRisk;

    // 방향별 접근도로 정보. key는 "nt", "et", "st", "wt" 같은 V2X 방향 코드다.
    @Builder.Default
    private Map<String, DirectionRoadContext> directionRoads = new LinkedHashMap<>();
}
