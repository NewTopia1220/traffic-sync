package com.example.demo.service;

import com.example.demo.model.context.CrossroadRoadLinkMapping;
import com.example.demo.model.context.GeoPoint;
import com.example.demo.model.context.RoadRiskSnapshot;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;

@Slf4j
@Service
public class RoadRiskApiService {

    private final WebClient webClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${road-risk.api.url:http://apis.data.go.kr/B552061/roadDgdgrLink/getRestRoadDgdgrLink}")
    private String roadRiskUrl;

    @Value("${road-risk.api.service-key:}")
    private String serviceKey;

    @Value("${road-risk.vehicle-type:01}")
    private String vehicleTypeCode;

    @Value("${road-risk.api.num-of-rows:10}")
    private int numOfRows;

    public RoadRiskApiService(WebClient webClient) {
        this.webClient = webClient;
    }

    public boolean isConfigured() {
        return serviceKey != null && !serviceKey.isBlank();
    }

    public String getVehicleTypeCode() {
        return vehicleTypeCode;
    }

    public Optional<RoadRiskSnapshot> fetchRisk(CrossroadRoadLinkMapping mapping) throws Exception {
        if (!isConfigured()) {
            throw new IllegalStateException("Road risk service key is not configured");
        }
        if (mapping == null || mapping.getLineString() == null || mapping.getLineString().isBlank()) {
            return Optional.empty();
        }

        URI uri = UriComponentsBuilder.fromHttpUrl(roadRiskUrl)
                .queryParam("ServiceKey", serviceKey)
                .queryParam("searchLineString", mapping.getLineString())
                .queryParam("vhctyCd", vehicleTypeCode)
                .queryParam("type", "json")
                .queryParam("numOfRows", numOfRows)
                .queryParam("pageNo", 1)
                .build(false)
                .toUri();

        String response = webClient.get()
                .uri(uri)
                .retrieve()
                .bodyToMono(String.class)
                .block();
        return parseRiskResponse(response, mapping.getLineString());
    }

    Optional<RoadRiskSnapshot> parseRiskResponse(String response, String lineString) throws Exception {
        JsonNode root = objectMapper.readTree(response);
        return ApiJsonUtils.rows(root).stream()
                .map(row -> RoadRiskSnapshot.builder()
                        .vehicleTypeCode(vehicleTypeCode)
                        .riskIndex(ApiJsonUtils.decimal(row, "anals_value", "ANALS_VALUE", "riskIndex", "risk_index"))
                        .riskGrade(ApiJsonUtils.text(row, "anals_grd", "ANALS_GRD", "riskGrade", "risk_grade"))
                        .lineString(lineString)
                        .stale(false)
                        .lastFetchedAtMs(System.currentTimeMillis())
                        .build())
                .filter(snapshot -> snapshot.getRiskIndex() != null || snapshot.getRiskGrade() != null && !snapshot.getRiskGrade().isBlank())
                .max(Comparator
                        .comparingInt((RoadRiskSnapshot snapshot) -> parseGrade(snapshot.getRiskGrade()))
                        .thenComparing(snapshot -> snapshot.getRiskIndex() == null ? -1.0 : snapshot.getRiskIndex()));
    }

    static String buildLineString(List<GeoPoint> vertices) {
        if (vertices == null || vertices.size() < 2) {
            return "";
        }

        StringBuilder builder = new StringBuilder("LineString(");
        for (GeoPoint vertex : vertices) {
            String part = String.format(Locale.US, "%.7f %.7f", vertex.getLon(), vertex.getLat());
            if (builder.length() + part.length() + 1 > 3900) {
                break;
            }
            if (builder.length() > "LineString(".length()) {
                builder.append(',');
            }
            builder.append(part);
        }
        builder.append(')');
        return builder.toString();
    }

    private static int parseGrade(String grade) {
        if (grade == null || grade.isBlank()) {
            return -1;
        }
        try {
            return Integer.parseInt(grade.trim());
        } catch (NumberFormatException ignored) {
            return -1;
        }
    }
}
