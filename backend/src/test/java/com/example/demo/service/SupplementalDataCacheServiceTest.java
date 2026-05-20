package com.example.demo.service;

import com.example.demo.model.DirectionSignal;
import com.example.demo.model.SignalDirection;
import com.example.demo.model.TrafficStatus;
import com.example.demo.model.context.CrossroadRoadLinkMapping;
import com.example.demo.model.context.RoadRiskSnapshot;
import com.example.demo.model.context.RoadSpeedSnapshot;
import com.example.demo.model.context.WeatherSnapshot;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class SupplementalDataCacheServiceTest {

    @Test
    void enrichesTrafficStatusWithRealSupplementalSnapshots() {
        SupplementalDataCacheService service = new SupplementalDataCacheService();

        TrafficStatus status = new TrafficStatus();
        status.setCrsrdId("C1");
        status.setCrsrdNm("잠실3사거리");
        status.setSignals(Map.of("nt", straightSignal("stop-And-Remain", 450)));

        service.updateWeather(WeatherSnapshot.builder()
                .temperatureC(22.0)
                .humidityPercent(60)
                .build());
        service.updateMappings(Map.of("C1", CrossroadRoadLinkMapping.builder()
                .crsrdId("C1")
                .linkId("L1")
                .speedLinkId("S1")
                .build()));
        service.updateSpeed(RoadSpeedSnapshot.builder()
                .linkId("S1")
                .speedKph(18.4)
                .travelTimeSec(70)
                .build());
        service.updateRisk("L1", RoadRiskSnapshot.builder()
                .riskIndex(73.2)
                .riskGrade("4")
                .build());

        service.enrichTrafficStatus(status);

        assertThat(status.getSpeedKph()).isEqualTo(18.4);
        assertThat(status.getTravelTimeSec()).isEqualTo(70);
        assertThat(status.getRiskScore()).isEqualTo(73.2);
        assertThat(status.getRiskGrade()).isEqualTo("4");
        assertThat(status.getAvgWaitSec()).isEqualTo(45);
        assertThat(status.getCongestion()).isEqualTo("혼잡");
        assertThat(status.getWeather().getTemperatureC()).isEqualTo(22.0);
    }

    @Test
    void usesRawRoadRiskIndexAsDisplayScoreWithoutGradeBanding() {
        assertThat(riskScoreFor(12.3, "01")).isEqualTo(12.3);
        assertThat(riskScoreFor(120.0, "02")).isEqualTo(120.0);
        assertThat(riskScoreFor(12.0, "03")).isEqualTo(12.0);
        assertThat(riskScoreFor(131.5, "04")).isEqualTo(131.5);
    }

    @Test
    void usesLinkIdAsSpeedFallbackWhenSpeedLinkIdIsMissing() {
        SupplementalDataCacheService service = new SupplementalDataCacheService();
        TrafficStatus status = new TrafficStatus();
        status.setCrsrdId("C1");
        status.setSignals(Map.of("nt", straightSignal("stop-And-Remain", 100)));

        service.updateMappings(Map.of("C1", CrossroadRoadLinkMapping.builder()
                .crsrdId("C1")
                .linkId("L1")
                .build()));
        service.updateSpeed(RoadSpeedSnapshot.builder()
                .linkId("L1")
                .speedKph(22.5)
                .build());

        service.enrichTrafficStatus(status);

        assertThat(status.getSpeedKph()).isEqualTo(22.5);
        assertThat(status.isSpeedStale()).isFalse();
    }

    @Test
    void keepsRiskGradeWhenRiskIndexIsMissingWithoutMakingDefaultScore() {
        SupplementalDataCacheService service = new SupplementalDataCacheService();
        TrafficStatus status = new TrafficStatus();
        status.setCrsrdId("C1");
        status.setSignals(Map.of("nt", straightSignal("stop-And-Remain", 100)));
        service.updateMappings(Map.of("C1", CrossroadRoadLinkMapping.builder()
                .crsrdId("C1")
                .linkId("L1")
                .build()));
        service.updateRisk("L1", RoadRiskSnapshot.builder()
                .riskGrade("04")
                .build());

        service.enrichTrafficStatus(status);

        assertThat(status.getRiskScore()).isNull();
        assertThat(status.getRiskIndex()).isNull();
        assertThat(status.getRiskGrade()).isEqualTo("04");
    }

    @Test
    void keepsRoadRiskCacheWhenAreaSupplementalDataIsCleared() {
        SupplementalDataCacheService service = new SupplementalDataCacheService();
        service.updateRisk("L1", RoadRiskSnapshot.builder()
                .riskIndex(131.5)
                .riskGrade("04")
                .lastFetchedAtMs(System.currentTimeMillis())
                .build());

        service.clearRoadSupplementalData();

        assertThat(service.getRisk("L1")).isPresent();
    }

    private Double riskScoreFor(Double riskIndex, String riskGrade) {
        SupplementalDataCacheService service = new SupplementalDataCacheService();
        TrafficStatus status = new TrafficStatus();
        status.setCrsrdId("C1");
        status.setSignals(Map.of("nt", straightSignal("stop-And-Remain", 100)));
        service.updateMappings(Map.of("C1", CrossroadRoadLinkMapping.builder()
                .crsrdId("C1")
                .linkId("L1")
                .build()));
        service.updateRisk("L1", RoadRiskSnapshot.builder()
                .riskIndex(riskIndex)
                .riskGrade(riskGrade)
                .build());

        service.enrichTrafficStatus(status);
        return status.getRiskScore();
    }

    private SignalDirection straightSignal(String signalStatus, int rmndCs) {
        SignalDirection direction = new SignalDirection();
        direction.setStsg(new DirectionSignal(signalStatus, rmndCs));
        return direction;
    }
}
