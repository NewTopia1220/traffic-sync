package com.example.demo.service;

import com.example.demo.model.context.GeoPoint;
import com.example.demo.model.context.RoadRiskSnapshot;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class RoadRiskApiServiceTest {

    private final RoadRiskApiService service = new RoadRiskApiService(WebClient.builder().build());

    @Test
    void parsesHighestRiskGradeFromRoadRiskResponse() throws Exception {
        ReflectionTestUtils.setField(service, "vehicleTypeCode", "01");
        String response = """
                {
                  "response": {
                    "body": {
                      "items": {
                        "item": [
                          {"anals_value":"12.3","anals_grd":"1"},
                          {"anals_value":"71.8","anals_grd":"3"}
                        ]
                      }
                    }
                  }
                }
                """;

        Optional<RoadRiskSnapshot> risk = service.parseRiskResponse(response, "LineString(127.1 37.5,127.2 37.6)");

        assertThat(risk).isPresent();
        assertThat(risk.get().getVehicleTypeCode()).isEqualTo("01");
        assertThat(risk.get().getRiskIndex()).isEqualTo(71.8);
        assertThat(risk.get().getRiskGrade()).isEqualTo("3");
    }

    @Test
    void buildsRoadRiskLineStringInLonLatOrder() {
        String lineString = RoadRiskApiService.buildLineString(List.of(
                new GeoPoint(37.5133, 127.1002),
                new GeoPoint(37.5135, 127.1005)
        ));

        assertThat(lineString).isEqualTo("LineString(127.1002000 37.5133000,127.1005000 37.5135000)");
    }

    @Test
    void buildsShortRoadRiskLineStringNearCrossroadPoint() {
        String lineString = RoadRiskApiService.buildLineStringNearPoint(List.of(
                new GeoPoint(37.0000, 127.0000),
                new GeoPoint(37.0000, 127.0020)
        ), new GeoPoint(37.0000, 127.0010), 60.0);

        assertThat(RoadRiskApiService.lineStringCoordinateCount(lineString)).isEqualTo(3);
        assertThat(RoadRiskApiService.estimateLineStringLengthMeters(lineString)).isLessThan(70.0);
        assertThat(lineString).contains("127.0010000 37.0000000");
    }
}
