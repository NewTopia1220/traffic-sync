package com.example.demo.service;

import com.example.demo.model.context.WeatherSnapshot;
import org.junit.jupiter.api.Test;
import org.springframework.web.reactive.function.client.WebClient;

import java.time.ZoneId;
import java.time.ZonedDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class WeatherApiServiceTest {

    private final WeatherApiService service = new WeatherApiService(
            WebClient.builder().build(),
            new KmaGridConverter()
    );

    @Test
    void parsesUltraShortNowcastWeatherCategories() throws Exception {
        String response = """
                {
                  "response": {
                    "body": {
                      "items": {
                        "item": [
                          {"baseDate":"20260507","baseTime":"1300","category":"T1H","obsrValue":"21.5"},
                          {"baseDate":"20260507","baseTime":"1300","category":"RN1","obsrValue":"0"},
                          {"baseDate":"20260507","baseTime":"1300","category":"REH","obsrValue":"55"},
                          {"baseDate":"20260507","baseTime":"1300","category":"WSD","obsrValue":"2.3"}
                        ]
                      }
                    }
                  }
                }
                """;

        WeatherSnapshot snapshot = service.parseWeatherResponse(response);

        assertThat(snapshot.getTemperatureC()).isEqualTo(21.5);
        assertThat(snapshot.getPrecipitationMm()).isEqualTo(0.0);
        assertThat(snapshot.getHumidityPercent()).isEqualTo(55);
        assertThat(snapshot.getWindSpeedMs()).isEqualTo(2.3);
        assertThat(snapshot.getBaseDateTime()).isEqualTo("202605071300");
    }

    @Test
    void usesPreviousHourBeforeUltraShortDataIsLikelyAvailable() {
        WeatherApiService.BaseDateTime base = service.latestUltraSrtBaseDateTime(
                ZonedDateTime.of(2026, 5, 7, 14, 30, 0, 0, ZoneId.of("Asia/Seoul"))
        );

        assertThat(base.date()).isEqualTo("20260507");
        assertThat(base.time()).isEqualTo("1300");
    }
}
