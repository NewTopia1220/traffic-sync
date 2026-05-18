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
                .build()));
        service.updateSpeed(RoadSpeedSnapshot.builder()
                .linkId("L1")
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
        assertThat(status.getRiskScore()).isEqualTo(73);
        assertThat(status.getRiskGrade()).isEqualTo("4");
        assertThat(status.getAvgWaitSec()).isEqualTo(45);
        assertThat(status.getCongestion()).isEqualTo("혼잡");
        assertThat(status.getWeather().getTemperatureC()).isEqualTo(22.0);
    }

    private SignalDirection straightSignal(String signalStatus, int rmndCs) {
        SignalDirection direction = new SignalDirection();
        direction.setStsg(new DirectionSignal(signalStatus, rmndCs));
        return direction;
    }
}
