package com.example.demo.service;

import com.example.demo.model.CrossroadInfo;
import com.example.demo.model.TrafficStatus;
import com.example.demo.model.context.CrossroadRoadLinkMapping;
import com.example.demo.model.context.GeoPoint;
import com.example.demo.model.context.IntersectionAiContext;
import com.example.demo.model.context.RoadRiskSnapshot;
import com.example.demo.model.context.RoadSpeedSnapshot;
import com.example.demo.model.context.WeatherSnapshot;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.server.ResponseStatusException;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class IntersectionContextServiceTest {

    @Test
    void buildsIntersectionContextForExistingCrossroad() {
        TrafficCacheService trafficCache = new TrafficCacheService();
        SupplementalDataCacheService supplementalCache = new SupplementalDataCacheService();
        RoadRiskApiService riskApiService = new RoadRiskApiService(WebClient.builder().build());
        ReflectionTestUtils.setField(riskApiService, "vehicleTypeCode", "01");

        CrossroadInfo crossroad = new CrossroadInfo();
        crossroad.setCrsrdId("C1");
        crossroad.setCrsrdNm("잠실역사거리");
        crossroad.setLat(37.5133);
        crossroad.setLon(127.1002);
        trafficCache.updateCrossroads(List.of(crossroad));

        TrafficStatus signal = new TrafficStatus();
        signal.setCrsrdId("C1");
        signal.setCrsrdNm("잠실역사거리");
        signal.setLat(37.5133);
        signal.setLon(127.1002);
        signal.setTotDt("20260507130000");
        trafficCache.updateAllSignals(Map.of("C1", signal));

        supplementalCache.updateWeather(WeatherSnapshot.builder()
                .temperatureC(21.5)
                .precipitationMm(0.0)
                .humidityPercent(55)
                .windSpeedMs(2.3)
                .baseDateTime("202605071300")
                .build());

        supplementalCache.updateMappings(Map.of("C1", CrossroadRoadLinkMapping.builder()
                .crsrdId("C1")
                .linkId("L1")
                .distanceMeters(12.0)
                .vertices(List.of(new GeoPoint(37.5133, 127.1002), new GeoPoint(37.5135, 127.1005)))
                .lineString("LineString(127.1002 37.5133,127.1005 37.5135)")
                .build()));
        supplementalCache.updateSpeed(RoadSpeedSnapshot.builder()
                .linkId("L1")
                .speedKph(34.5)
                .travelTimeSec(44)
                .build());
        supplementalCache.updateRisk("L1", RoadRiskSnapshot.builder()
                .vehicleTypeCode("01")
                .riskIndex(62.0)
                .riskGrade("3")
                .build());

        IntersectionContextService service = new IntersectionContextService(trafficCache, supplementalCache, riskApiService);
        IntersectionAiContext context = service.buildContext("C1");

        assertThat(context.getCrsrdNm()).isEqualTo("잠실역사거리");
        assertThat(context.getSignal().getTotDt()).isEqualTo("20260507130000");
        assertThat(context.getWeather().getTemperatureC()).isEqualTo(21.5);
        assertThat(context.getTrafficSpeed().getLinkId()).isEqualTo("L1");
        assertThat(context.getTrafficSpeed().getSpeedKph()).isEqualTo(34.5);
        assertThat(context.getRoadRisk().getRiskGrade()).isEqualTo("3");
        assertThat(context.getSummaryKo()).contains("잠실역사거리", "구간속도", "도로위험등급");
    }

    @Test
    void throwsNotFoundForUnknownCrossroadId() {
        RoadRiskApiService riskApiService = new RoadRiskApiService(WebClient.builder().build());
        IntersectionContextService service = new IntersectionContextService(
                new TrafficCacheService(),
                new SupplementalDataCacheService(),
                riskApiService
        );

        assertThatThrownBy(() -> service.buildContext("missing"))
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("Unknown crsrdId");
    }
}
