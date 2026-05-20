package com.example.demo.service;

import com.example.demo.model.context.WeatherSnapshot;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;

@Slf4j
@Service
public class WeatherApiService {

    private static final ZoneId KST = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyyMMdd");
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("HH00");

    private final WebClient webClient;
    private final KmaGridConverter gridConverter;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${kma.api.url:http://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getUltraSrtNcst}")
    private String weatherUrl;

    @Value("${kma.api.service-key:}")
    private String serviceKey;

    @Value("${kma.api.num-of-rows:1000}")
    private int numOfRows;

    @Value("${jamsil.lat}")
    private double jamsilLat;

    @Value("${jamsil.lon}")
    private double jamsilLon;

    public WeatherApiService(WebClient webClient, KmaGridConverter gridConverter) {
        this.webClient = webClient;
        this.gridConverter = gridConverter;
    }

    public boolean isConfigured() {
        return serviceKey != null && !serviceKey.isBlank();
    }

    public WeatherSnapshot fetchJamsilWeather() throws Exception {
        if (!isConfigured()) {
            throw new IllegalStateException("KMA service key is not configured");
        }

        KmaGridConverter.GridPoint grid = gridConverter.toGrid(jamsilLat, jamsilLon);
        BaseDateTime baseDateTime = latestUltraSrtBaseDateTime(ZonedDateTime.now(KST));

        URI uri = UriComponentsBuilder.fromHttpUrl(weatherUrl)
                .queryParam("ServiceKey", serviceKey)
                .queryParam("pageNo", 1)
                .queryParam("numOfRows", numOfRows)
                .queryParam("dataType", "JSON")
                .queryParam("base_date", baseDateTime.date())
                .queryParam("base_time", baseDateTime.time())
                .queryParam("nx", grid.nx())
                .queryParam("ny", grid.ny())
                .build(false)
                .toUri();

        String response = webClient.get()
                .uri(uri)
                .retrieve()
                .bodyToMono(String.class)
                .block();

        WeatherSnapshot snapshot = parseWeatherResponse(response);
        snapshot.setStale(false);
        snapshot.setLastFetchedAtMs(System.currentTimeMillis());
        return snapshot;
    }

    WeatherSnapshot parseWeatherResponse(String response) throws Exception {
        JsonNode root = objectMapper.readTree(response);
        WeatherSnapshot snapshot = WeatherSnapshot.builder().build();

        for (JsonNode item : ApiJsonUtils.rows(root)) {
            String category = ApiJsonUtils.text(item, "category");
            switch (category) {
                case "T1H" -> snapshot.setTemperatureC(ApiJsonUtils.decimal(item, "obsrValue"));
                case "RN1" -> snapshot.setPrecipitationMm(ApiJsonUtils.decimal(item, "obsrValue"));
                case "REH" -> snapshot.setHumidityPercent(ApiJsonUtils.integer(item, "obsrValue"));
                case "WSD" -> snapshot.setWindSpeedMs(ApiJsonUtils.decimal(item, "obsrValue"));
                default -> {
                }
            }

            String baseDate = ApiJsonUtils.text(item, "baseDate");
            String baseTime = ApiJsonUtils.text(item, "baseTime");
            if (!baseDate.isBlank() && !baseTime.isBlank()) {
                snapshot.setBaseDateTime(baseDate + baseTime);
            }
        }

        return snapshot;
    }

    BaseDateTime latestUltraSrtBaseDateTime(ZonedDateTime now) {
        ZonedDateTime base = now.withZoneSameInstant(KST);
        if (base.getMinute() < 45) {
            base = base.minusHours(1);
        }
        return new BaseDateTime(base.format(DATE_FMT), base.format(TIME_FMT));
    }

    record BaseDateTime(String date, String time) {
    }
}
