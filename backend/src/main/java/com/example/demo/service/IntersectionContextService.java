package com.example.demo.service;

import com.example.demo.model.TrafficStatus;
import com.example.demo.model.context.CrossroadRoadLinkMapping;
import com.example.demo.model.context.DirectionRoadContext;
import com.example.demo.model.context.IntersectionAiContext;
import com.example.demo.model.context.RoadRiskSnapshot;
import com.example.demo.model.context.RoadSpeedSnapshot;
import com.example.demo.model.context.SignalContext;
import com.example.demo.model.context.TrafficSpeedContext;
import com.example.demo.model.context.WeatherSnapshot;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class IntersectionContextService {

    private final TrafficCacheService trafficCacheService;
    private final SupplementalDataCacheService supplementalDataCacheService;
    private final RoadRiskApiService roadRiskApiService;

    @Value("${jamsil.lat:37.5133}")
    private double defaultLat;

    @Value("${jamsil.lon:127.1002}")
    private double defaultLon;

    public IntersectionAiContext buildContext(String crsrdId) {
        // 프론트가 교차로를 아직 선택하지 않은 경우에는 잠실 기본 컨텍스트를 내려준다.
        if (crsrdId == null || crsrdId.isBlank()) {
            return buildDefaultContext();
        }

        // 선택된 교차로 1건의 최신 V2X 신호 데이터를 가져온다.
        TrafficStatus signal = trafficCacheService.getSignal(crsrdId);

        if (signal == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown crsrdId: " + crsrdId);
        }

        // 보조 데이터는 선택 교차로와 매핑된 도로 링크 기준으로 붙인다.
        WeatherSnapshot weather = supplementalDataCacheService.getWeather().orElse(null);
        CrossroadRoadLinkMapping mapping = supplementalDataCacheService.getMapping(crsrdId).orElse(null);
        TrafficSpeedContext speedContext = buildSpeedContext(mapping);
        RoadRiskSnapshot roadRisk = buildRoadRiskContext(mapping);
        Map<String, DirectionRoadContext> directionRoads = buildDirectionRoadContexts(crsrdId);

        // 문자열 분석 결과를 만들지 않고, 프론트가 그대로 사용할 수 있는 JSON 객체만 구성한다.
        return IntersectionAiContext.builder()
                .crsrdId(crsrdId)
                .crsrdNm(signal.getCrsrdNm())
                .lat(signal.getLat())
                .lon(signal.getLon())
                .signal(buildSignalContext(signal))
                .weather(weather)
                .trafficSpeed(speedContext)
                .roadRisk(roadRisk)
                .directionRoads(directionRoads)
                .build();
    }

    public IntersectionAiContext buildDefaultContext() {
        // 아직 사용자가 교차로를 클릭하지 않은 경우에는 잠실 기본 범위의 첫 교차로를 우선 사용한다.
        TrafficStatus firstSignal = trafficCacheService.getAllSignals().values().stream().findFirst().orElse(null);
        if (firstSignal != null) {
            return buildContext(firstSignal.getCrsrdId());
        }

        // 서버 시작 직후처럼 교차로 캐시가 비어 있으면 잠실역 일대 기본 컨텍스트만 제공한다.
        IntersectionAiContext context = IntersectionAiContext.builder()
                .crsrdId("DEFAULT_JAMSIL")
                .crsrdNm("잠실역 일대")
                .lat(defaultLat)
                .lon(defaultLon)
                .weather(supplementalDataCacheService.getWeather().orElse(null))
                .build();
        return context;
    }

    private SignalContext buildSignalContext(TrafficStatus signal) {
        if (signal == null) {
            return null;
        }
        return SignalContext.builder()
                .totDt(signal.getTotDt())
                .serverTimeMs(signal.getServerTimeMs())
                .directions(signal.getSignals())
                .build();
    }

    private TrafficSpeedContext buildSpeedContext(CrossroadRoadLinkMapping mapping) {
        // TOPIS 링크 매핑이 없으면 속도 정보도 내려주지 않는다.
        if (!hasLinkId(mapping)) {
            return null;
        }

        RoadSpeedSnapshot speed = supplementalDataCacheService.getSpeed(mapping.getLinkId()).orElse(null);
        return TrafficSpeedContext.builder()
                .linkId(mapping.getLinkId())
                .speedKph(speed == null ? null : speed.getSpeedKph())
                .travelTimeSec(speed == null ? null : speed.getTravelTimeSec())
                .distanceMeters(mapping.getDistanceMeters())
                .stale(speed == null || speed.isStale())
                .build();
    }

    private RoadRiskSnapshot buildRoadRiskContext(CrossroadRoadLinkMapping mapping) {
        // 도로위험도 API는 도로 링크의 LineString이 있어야 조회할 수 있다.
        if (!hasLinkId(mapping)) {
            return null;
        }

        return supplementalDataCacheService.getRisk(mapping.getLinkId())
                .orElseGet(() -> RoadRiskSnapshot.builder()
                        .vehicleTypeCode(roadRiskApiService.getVehicleTypeCode())
                        .lineString(mapping.getLineString())
                        .stale(true)
                        .build());
    }

    private Map<String, DirectionRoadContext> buildDirectionRoadContexts(String crsrdId) {
        // 방향별 접근도로를 nt/et/st/wt 같은 방향 코드로 묶어 JSON map 형태로 만든다.
        Map<String, CrossroadRoadLinkMapping> mappings = supplementalDataCacheService.getDirectionalMappings(crsrdId);
        Map<String, DirectionRoadContext> result = new LinkedHashMap<>();

        for (Map.Entry<String, CrossroadRoadLinkMapping> entry : mappings.entrySet()) {
            String directionCode = entry.getKey();
            CrossroadRoadLinkMapping mapping = entry.getValue();
            if (!hasLinkId(mapping)) {
                continue;
            }

            RoadSpeedSnapshot speed = supplementalDataCacheService.getSpeed(mapping.getLinkId()).orElse(null);
            RoadRiskSnapshot risk = buildRoadRiskContext(mapping);

            result.put(directionCode, DirectionRoadContext.builder()
                    .directionCode(directionCode)
                    .directionNameKo(directionNameKo(directionCode))
                    .linkId(mapping.getLinkId())
                    .distanceMeters(mapping.getDistanceMeters())
                    .bearingDegrees(mapping.getBearingDegrees())
                    .speedKph(speed == null ? null : speed.getSpeedKph())
                    .travelTimeSec(speed == null ? null : speed.getTravelTimeSec())
                    .speedStale(speed == null || speed.isStale())
                    .roadRisk(risk)
                    .build());
        }

        return result;
    }

    private boolean hasLinkId(CrossroadRoadLinkMapping mapping) {
        return mapping != null && mapping.getLinkId() != null && !mapping.getLinkId().isBlank();
    }

    private String directionNameKo(String directionCode) {
        // V2X 방향 코드를 프론트/챗봇에서 읽기 쉬운 한글 방향명으로 함께 내려준다.
        return switch (directionCode) {
            case "nt" -> "북쪽";
            case "ne" -> "북동쪽";
            case "et" -> "동쪽";
            case "se" -> "남동쪽";
            case "st" -> "남쪽";
            case "sw" -> "남서쪽";
            case "wt" -> "서쪽";
            case "nw" -> "북서쪽";
            default -> directionCode;
        };
    }
}
