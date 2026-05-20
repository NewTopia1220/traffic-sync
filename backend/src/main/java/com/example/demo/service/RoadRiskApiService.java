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
import org.springframework.web.util.UriUtils;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
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

    @Value("${road-risk.api.request-timeout-seconds:3}")
    private long requestTimeoutSeconds;

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

        URI uri = buildRiskUri(mapping.getLineString());

        String response = webClient.get()
                .uri(uri)
                .retrieve()
                .bodyToMono(String.class)
                .timeout(Duration.ofSeconds(requestTimeoutSeconds))
                .block();
        return parseRiskResponse(response, mapping.getLineString());
    }

    URI buildRiskUri(String lineString) {
        String encodedLineString = UriUtils.encodeQueryParam(lineString, StandardCharsets.UTF_8);
        return UriComponentsBuilder.fromHttpUrl(roadRiskUrl)
                .queryParam("ServiceKey", serviceKey)
                .queryParam("searchLineString", encodedLineString)
                .queryParam("vhctyCd", vehicleTypeCode)
                .queryParam("type", "json")
                .queryParam("numOfRows", numOfRows)
                .queryParam("pageNo", 1)
                .build(true)
                .toUri();
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

    static String buildLineStringNearPoint(List<GeoPoint> vertices, GeoPoint point, double lengthMeters) {
        if (vertices == null || vertices.size() < 2 || point == null) {
            return buildLineString(vertices);
        }

        PolylinePosition closest = closestPositionOnPolyline(vertices, point);
        if (closest == null || !Double.isFinite(closest.alongMeters()) || closest.totalMeters() <= 0) {
            return buildLineString(vertices);
        }

        double halfLength = Math.max(10.0, lengthMeters) / 2.0;
        GeoPoint start = interpolateAtDistance(vertices, Math.max(0.0, closest.alongMeters() - halfLength));
        GeoPoint end = interpolateAtDistance(vertices, Math.min(closest.totalMeters(), closest.alongMeters() + halfLength));
        return buildLineString(List.of(start, end));
    }

    static double estimateLineStringLengthMeters(String lineString) {
        List<GeoPoint> points = parseLineStringPoints(lineString);
        if (points.size() < 2) {
            return 0.0;
        }

        double total = 0.0;
        for (int i = 0; i < points.size() - 1; i++) {
            total += GeoDistanceUtils.haversineMeters(points.get(i), points.get(i + 1));
        }
        return total;
    }

    static int lineStringCoordinateCount(String lineString) {
        return parseLineStringPoints(lineString).size();
    }

    private static PolylinePosition closestPositionOnPolyline(List<GeoPoint> vertices, GeoPoint point) {
        double bestDistance = Double.MAX_VALUE;
        double bestAlong = 0.0;
        double cumulative = 0.0;

        for (int i = 0; i < vertices.size() - 1; i++) {
            GeoPoint start = vertices.get(i);
            GeoPoint end = vertices.get(i + 1);
            double segmentLength = GeoDistanceUtils.haversineMeters(start, end);
            SegmentPosition position = projectToSegment(point, start, end);
            if (position.distanceMeters() < bestDistance) {
                bestDistance = position.distanceMeters();
                bestAlong = cumulative + segmentLength * position.ratio();
            }
            cumulative += segmentLength;
        }

        return new PolylinePosition(bestAlong, cumulative);
    }

    private static SegmentPosition projectToSegment(GeoPoint point, GeoPoint start, GeoPoint end) {
        double metersPerDegreeLon = 111_320.0 * Math.cos(Math.toRadians(point.getLat()));
        double px = point.getLon() * metersPerDegreeLon;
        double py = point.getLat() * 111_320.0;
        double ax = start.getLon() * metersPerDegreeLon;
        double ay = start.getLat() * 111_320.0;
        double bx = end.getLon() * metersPerDegreeLon;
        double by = end.getLat() * 111_320.0;

        double dx = bx - ax;
        double dy = by - ay;
        if (dx == 0 && dy == 0) {
            return new SegmentPosition(Math.hypot(px - ax, py - ay), 0.0);
        }

        double ratio = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
        ratio = Math.max(0.0, Math.min(1.0, ratio));
        double closestX = ax + ratio * dx;
        double closestY = ay + ratio * dy;
        return new SegmentPosition(Math.hypot(px - closestX, py - closestY), ratio);
    }

    private static GeoPoint interpolateAtDistance(List<GeoPoint> vertices, double targetMeters) {
        if (targetMeters <= 0.0) {
            return vertices.get(0);
        }

        double cumulative = 0.0;
        for (int i = 0; i < vertices.size() - 1; i++) {
            GeoPoint start = vertices.get(i);
            GeoPoint end = vertices.get(i + 1);
            double segmentLength = GeoDistanceUtils.haversineMeters(start, end);
            if (cumulative + segmentLength >= targetMeters) {
                double ratio = segmentLength == 0.0 ? 0.0 : (targetMeters - cumulative) / segmentLength;
                return new GeoPoint(
                        start.getLat() + (end.getLat() - start.getLat()) * ratio,
                        start.getLon() + (end.getLon() - start.getLon()) * ratio
                );
            }
            cumulative += segmentLength;
        }
        return vertices.get(vertices.size() - 1);
    }

    private static List<GeoPoint> parseLineStringPoints(String lineString) {
        if (lineString == null || lineString.isBlank()) {
            return List.of();
        }

        int start = lineString.indexOf('(');
        int end = lineString.lastIndexOf(')');
        if (start < 0 || end <= start) {
            return List.of();
        }

        return List.of(lineString.substring(start + 1, end).split(",")).stream()
                .map(String::trim)
                .map(RoadRiskApiService::parseLineStringPoint)
                .flatMap(Optional::stream)
                .toList();
    }

    private static Optional<GeoPoint> parseLineStringPoint(String value) {
        String[] parts = value.trim().split("\\s+");
        if (parts.length < 2) {
            return Optional.empty();
        }
        try {
            double lon = Double.parseDouble(parts[0]);
            double lat = Double.parseDouble(parts[1]);
            return Optional.of(new GeoPoint(lat, lon));
        } catch (NumberFormatException ignored) {
            return Optional.empty();
        }
    }

    private record PolylinePosition(double alongMeters, double totalMeters) {
    }

    private record SegmentPosition(double distanceMeters, double ratio) {
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
