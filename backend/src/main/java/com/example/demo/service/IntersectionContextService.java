package com.example.demo.service;

import com.example.demo.model.CrossroadInfo;
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
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

@Service
@RequiredArgsConstructor
public class IntersectionContextService {

    private final TrafficCacheService trafficCacheService;
    private final SupplementalDataCacheService supplementalDataCacheService;
    private final RoadRiskApiService roadRiskApiService;

    public IntersectionAiContext buildContext(String crsrdId) {
        TrafficStatus signal = trafficCacheService.getSignal(crsrdId);
        Optional<CrossroadInfo> crossroad = trafficCacheService.getCrossroad(crsrdId);

        if (signal == null && crossroad.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown crsrdId: " + crsrdId);
        }

        String name = signal != null ? signal.getCrsrdNm() : crossroad.get().getCrsrdNm();
        double lat = signal != null ? signal.getLat() : crossroad.get().getLat();
        double lon = signal != null ? signal.getLon() : crossroad.get().getLon();

        WeatherSnapshot weather = supplementalDataCacheService.getWeather().orElse(null);
        CrossroadRoadLinkMapping mapping = supplementalDataCacheService.getMapping(crsrdId).orElse(null);
        TrafficSpeedContext speedContext = buildSpeedContext(mapping);
        RoadRiskSnapshot roadRisk = buildRoadRiskContext(mapping);
        Map<String, DirectionRoadContext> directionRoads = buildDirectionRoadContexts(crsrdId);

        IntersectionAiContext context = IntersectionAiContext.builder()
                .crsrdId(crsrdId)
                .crsrdNm(name)
                .lat(lat)
                .lon(lon)
                .signal(buildSignalContext(signal))
                .weather(weather)
                .trafficSpeed(speedContext)
                .roadRisk(roadRisk)
                .directionRoads(directionRoads)
                .build();
        context.setSummaryKo(buildSummary(context));
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

    private String buildSummary(IntersectionAiContext context) {
        StringBuilder summary = new StringBuilder();
        summary.append(context.getCrsrdNm()).append(" 교차로입니다.");

        if (context.getSignal() != null && context.getSignal().getTotDt() != null) {
            summary.append(" 신호 수집시각은 ").append(context.getSignal().getTotDt()).append("입니다.");
        } else {
            summary.append(" 신호 정보는 아직 없습니다.");
        }

        if (context.getWeather() != null) {
            summary.append(" 날씨는 기온 ").append(format(context.getWeather().getTemperatureC())).append("도");
            summary.append(", 강수 ").append(format(context.getWeather().getPrecipitationMm())).append("mm");
            summary.append(", 습도 ").append(context.getWeather().getHumidityPercent() == null
                    ? "정보없음"
                    : context.getWeather().getHumidityPercent() + "%");
            summary.append(", 풍속 ").append(format(context.getWeather().getWindSpeedMs())).append("m/s입니다.");
        } else {
            summary.append(" 날씨 정보는 아직 없습니다.");
        }

        if (context.getTrafficSpeed() != null && context.getTrafficSpeed().getSpeedKph() != null) {
            summary.append(" 인접 TOPIS 링크 ").append(context.getTrafficSpeed().getLinkId());
            summary.append("의 구간속도는 ").append(format(context.getTrafficSpeed().getSpeedKph())).append("km/h입니다.");
        } else {
            summary.append(" 구간속도 정보는 아직 없습니다.");
        }

        if (context.getRoadRisk() != null && context.getRoadRisk().getRiskGrade() != null) {
            summary.append(" 도로위험 등급은 ").append(context.getRoadRisk().getRiskGrade());
            if (context.getRoadRisk().getRiskIndex() != null) {
                summary.append(", 위험지수는 ").append(format(context.getRoadRisk().getRiskIndex()));
            }
            summary.append("입니다.");
        } else {
            summary.append(" 도로위험 정보는 아직 없습니다.");
        }

        return summary.toString();
    }

    private String format(Double value) {
        if (value == null) {
            return "정보없음";
        }
        return String.format(Locale.KOREA, "%.1f", value);
    }
}
