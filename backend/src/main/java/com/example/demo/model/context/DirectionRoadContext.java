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
    // V2X 방향 코드. 예: nt, et, st, wt, ne, se, sw, nw
    private String directionCode;

    // 화면이나 챗봇에서 바로 읽기 쉬운 한국어 방향명.
    private String directionNameKo;

    // 선택 교차로와 매칭된 TOPIS 링크 정보.
    private String linkId;
    private Double distanceMeters;
    private Double bearingDegrees;

    // 해당 방향 접근도로의 현재 속도/통행시간 스냅샷.
    private Double speedKph;
    private Integer travelTimeSec;
    private boolean speedStale;

    // 해당 방향 접근도로의 도로위험도 스냅샷.
    private RoadRiskSnapshot roadRisk;
}
