package com.example.demo.service;

import com.example.demo.model.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.*;

@Slf4j
@Service
public class V2xApiService {

    private final WebClient webClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${v2x.api.crossroad-url}")
    private String crossroadUrl;

    @Value("${v2x.api.signal-url}")
    private String signalUrl;

    @Value("${v2x.api.service-key}")
    private String serviceKey;

    @Value("${v2x.api.num-of-rows}")
    private int numOfRows;

    @Value("${jamsil.lat}")
    private double jamsilLat;

    @Value("${jamsil.lon}")
    private double jamsilLon;

    @Value("${jamsil.radius-km}")
    private double radiusKm;

    private static final String[] DIRECTIONS = {"nt", "et", "st", "wt", "ne", "se", "sw", "nw"};
    private static final String[] SIGNAL_TYPES = {"Stsg", "Ltsg", "Pdsg", "Utsg", "Bssg", "Bcsg"};

    public V2xApiService(WebClient webClient) {
        this.webClient = webClient;
    }

    // 임의 좌표 + 반경으로 교차로 목록 가져오기 (구 클릭 시 사용)
    public List<CrossroadInfo> fetchCrossroads(double centerLat, double centerLon, double radiusKm) {
        List<CrossroadInfo> result = new ArrayList<>();
        int pageNo = 1;
        while (true) {
            try {
                URI uri = UriComponentsBuilder.fromHttpUrl(crossroadUrl)
                        .queryParam("serviceKey", serviceKey)
                        .queryParam("pageNo", pageNo)
                        .queryParam("numOfRows", numOfRows)
                        .queryParam("type", "JSON")
                        .queryParam("stdgCd", "1100000000")
                        .build(true).toUri();
                String response = webClient.get().uri(uri).retrieve().bodyToMono(String.class).block();
                JsonNode root = objectMapper.readTree(response);
                JsonNode items = root.path("body").path("items").path("item");
                int totalCount = root.path("body").path("totalCount").asInt();
                if (!items.isArray() || items.size() == 0) break;
                for (JsonNode item : items) {
                    String latStr = item.path("mapCtptIntLat").asText("");
                    String lonStr = item.path("mapCtptIntLot").asText("");
                    if (latStr.isEmpty() || lonStr.isEmpty()) continue;
                    double lat = Double.parseDouble(latStr);
                    double lon = Double.parseDouble(lonStr);
                    if (calcDistKmBetween(lat, lon, centerLat, centerLon) <= radiusKm) {
                        CrossroadInfo info = new CrossroadInfo();
                        info.setCrsrdId(item.path("crsrdId").asText());
                        info.setCrsrdNm(item.path("crsrdNm").asText());
                        info.setLat(lat);
                        info.setLon(lon);
                        result.add(info);
                    }
                }
                if (pageNo * numOfRows >= totalCount) break;
                pageNo++;
            } catch (Exception e) {
                log.error("교차로 API 호출 실패 (page {}): {}", pageNo, e.getMessage());
                break;
            }
        }
        log.info("좌표({},{}) 반경{}km 내 교차로 {}개 수집", centerLat, centerLon, radiusKm, result.size());
        return result;
    }

    // 잠실역 반경 내 교차로 목록 가져오기
    public List<CrossroadInfo> fetchJamsilCrossroads() {
        List<CrossroadInfo> result = new ArrayList<>();
        int pageNo = 1;

        while (true) {
            try {
                URI uri = UriComponentsBuilder.fromHttpUrl(crossroadUrl)
                        .queryParam("serviceKey", serviceKey)
                        .queryParam("pageNo", pageNo)
                        .queryParam("numOfRows", numOfRows)
                        .queryParam("type", "JSON")
                        .queryParam("stdgCd", "1100000000")
                        .build(true).toUri();

                String response = webClient.get()
                        .uri(uri)
                        .retrieve()
                        .bodyToMono(String.class)
                        .block();

                JsonNode root = objectMapper.readTree(response);
                JsonNode items = root.path("body").path("items").path("item");
                int totalCount = root.path("body").path("totalCount").asInt();

                if (!items.isArray() || items.size() == 0) break;

                for (JsonNode item : items) {
                    String latStr = item.path("mapCtptIntLat").asText("");
                    String lonStr = item.path("mapCtptIntLot").asText("");
                    if (latStr.isEmpty() || lonStr.isEmpty()) continue;

                    double lat = Double.parseDouble(latStr);
                    double lon = Double.parseDouble(lonStr);

                    if (isWithinRadius(lat, lon)) {
                        CrossroadInfo info = new CrossroadInfo();
                        info.setCrsrdId(item.path("crsrdId").asText());
                        info.setCrsrdNm(item.path("crsrdNm").asText());
                        info.setLat(lat);
                        info.setLon(lon);
                        result.add(info);
                    }
                }

                if (pageNo * numOfRows >= totalCount) break;
                pageNo++;

            } catch (Exception e) {
                log.error("교차로 API 호출 실패 (page {}): {}", pageNo, e.getMessage());
                break;
            }
        }

        log.info("잠실역 반경 {}km 내 교차로 {}개 수집", radiusKm, result.size());
        return result;
    }

    // 신호등 데이터 가져오기 (교차로 ID 기준으로 필터)
    public Map<String, TrafficStatus> fetchSignalData(List<CrossroadInfo> crossroads) {
        Map<String, CrossroadInfo> crossroadMap = new HashMap<>();
        for (CrossroadInfo c : crossroads) {
            crossroadMap.put(c.getCrsrdId(), c);
        }

        Map<String, TrafficStatus> result = new HashMap<>();
        int pageNo = 1;

        while (true) {
            try {
                URI signalUri = UriComponentsBuilder.fromHttpUrl(signalUrl)
                        .queryParam("serviceKey", serviceKey)
                        .queryParam("pageNo", pageNo)
                        .queryParam("numOfRows", numOfRows)
                        .queryParam("type", "JSON")
                        .queryParam("stdgCd", "1100000000")
                        .build(true).toUri();

                String response = webClient.get()
                        .uri(signalUri)
                        .retrieve()
                        .bodyToMono(String.class)
                        .block();

                JsonNode root = objectMapper.readTree(response);
                JsonNode items = root.path("body").path("items").path("item");
                int totalCount = root.path("body").path("totalCount").asInt();

                if (!items.isArray() || items.size() == 0) break;

                for (JsonNode item : items) {
                    String crsrdId = item.path("crsrdId").asText();
                    if (!crossroadMap.containsKey(crsrdId)) continue;

                    CrossroadInfo crossroad = crossroadMap.get(crsrdId);
                    TrafficStatus status = parseSignalItem(item, crossroad);
                    result.put(crsrdId, status);
                }

                // 대상 교차로를 모두 찾았으면 조기 종료
                if (result.size() == crossroads.size()) break;
                if (pageNo * numOfRows >= totalCount) break;
                pageNo++;

            } catch (Exception e) {
                log.error("신호등 API 호출 실패 (page {}): {}", pageNo, e.getMessage());
                break;
            }
        }

        log.info("신호 데이터 수집 완료: {}개", result.size());
        return result;
    }

    // API 응답 item 하나를 TrafficStatus로 파싱
    private TrafficStatus parseSignalItem(JsonNode item, CrossroadInfo crossroad) {
        TrafficStatus status = new TrafficStatus();
        status.setCrsrdId(crossroad.getCrsrdId());
        status.setCrsrdNm(crossroad.getCrsrdNm());
        status.setLat(crossroad.getLat());
        status.setLon(crossroad.getLon());
        status.setTotDt(item.path("totDt").asText());
        status.setServerTimeMs(System.currentTimeMillis());

        // 원본 API 데이터 디버그 로그
        log.debug("[RAW] crsrdId={} totDt={} raw={}",
                crossroad.getCrsrdId(), item.path("totDt").asText(), item);

        Map<String, SignalDirection> signals = new HashMap<>();

        for (String dir : DIRECTIONS) {
            SignalDirection direction = new SignalDirection();
            boolean hasData = false;

            for (String sigType : SIGNAL_TYPES) {
                // 필드명 조합: dir + sigType + "SttsNm" / "RmndCs"
                // 예: ntStsgSttsNm, ntStsgRmndCs
                String statusKey = dir + sigType + "SttsNm";
                String rmndKey   = dir + sigType + "RmndCs";

                String sttsNm = item.path(statusKey).asText("").trim();
                String rmndCs = item.path(rmndKey).asText("").trim();

                if (sttsNm.isEmpty()) continue;

                int rmnd = 0;
                try { rmnd = Integer.parseInt(rmndCs); } catch (NumberFormatException ignored) {}

                // 36001 = V2X 센티넬 값 (잔여시간 불명), 해당 신호 무시
                if (rmnd >= 36000) continue;

                DirectionSignal ds = new DirectionSignal(sttsNm, rmnd);
                hasData = true;

                switch (sigType.toLowerCase()) {
                    case "stsg" -> direction.setStsg(ds);
                    case "ltsg" -> direction.setLtsg(ds);
                    case "pdsg" -> direction.setPdsg(ds);
                    case "utsg" -> direction.setUtsg(ds);
                    case "bssg" -> direction.setBssg(ds);
                    case "bcsg" -> direction.setBcsg(ds);
                }
            }

            if (hasData) signals.put(dir, direction);
        }

        status.setSignals(signals);
        return status;
    }

    private boolean isWithinRadius(double lat, double lon) {
        return calcDistKmBetween(lat, lon, jamsilLat, jamsilLon) <= radiusKm;
    }

    private double calcDistKmBetween(double lat1, double lon1, double lat2, double lon2) {
        final int R = 6371;
        double dLat = Math.toRadians(lat1 - lat2);
        double dLon = Math.toRadians(lon1 - lon2);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat2)) * Math.cos(Math.toRadians(lat1))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }
}
