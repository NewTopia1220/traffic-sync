package com.example.demo.service;

import com.example.demo.model.CrossroadInfo;
import com.example.demo.model.DirectionSignal;
import com.example.demo.model.SignalDirection;
import com.example.demo.model.TrafficStatus;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
public class V2xApiService {

    private static final String SEOUL_STDG_CD = "1100000000";
    private static final String[] DIRECTIONS = {"nt", "et", "st", "wt", "ne", "se", "sw", "nw"};
    private static final String[] SIGNAL_TYPES = {"Stsg", "Ltsg", "Pdsg", "Utsg", "Bssg", "Bcsg"};

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

    public V2xApiService(WebClient webClient) {
        this.webClient = webClient;
    }

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
                        .queryParam("stdgCd", SEOUL_STDG_CD)
                        .build(true)
                        .toUri();

                String response = webClient.get()
                        .uri(uri)
                        .retrieve()
                        .bodyToMono(String.class)
                        .block();

                JsonNode root = objectMapper.readTree(response);
                JsonNode items = root.path("body").path("items").path("item");
                int totalCount = root.path("body").path("totalCount").asInt();

                if (!items.isArray() || items.isEmpty()) {
                    break;
                }

                for (JsonNode item : items) {
                    String latStr = item.path("mapCtptIntLat").asText("");
                    String lonStr = item.path("mapCtptIntLot").asText("");
                    if (latStr.isBlank() || lonStr.isBlank()) {
                        continue;
                    }

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

                if (pageNo * numOfRows >= totalCount) {
                    break;
                }
                pageNo++;
            } catch (Exception e) {
                log.error("Crossroad API fetch failed (page={}): {}", pageNo, e.getMessage());
                break;
            }
        }

        log.info("Loaded {} crossroads within {}km of the Jamsil center", result.size(), radiusKm);
        return result;
    }

    public Map<String, TrafficStatus> fetchSignalData(List<CrossroadInfo> crossroads) {
        if (crossroads == null || crossroads.isEmpty()) {
            return Map.of();
        }

        Map<String, CrossroadInfo> crossroadMap = new HashMap<>();
        for (CrossroadInfo crossroad : crossroads) {
            crossroadMap.put(crossroad.getCrsrdId(), crossroad);
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
                        .queryParam("stdgCd", SEOUL_STDG_CD)
                        .build(true)
                        .toUri();

                String response = webClient.get()
                        .uri(signalUri)
                        .retrieve()
                        .bodyToMono(String.class)
                        .block();

                JsonNode root = objectMapper.readTree(response);
                JsonNode items = root.path("body").path("items").path("item");
                int totalCount = root.path("body").path("totalCount").asInt();

                if (!items.isArray() || items.isEmpty()) {
                    break;
                }

                for (JsonNode item : items) {
                    String crsrdId = item.path("crsrdId").asText();
                    CrossroadInfo crossroad = crossroadMap.get(crsrdId);
                    if (crossroad == null) {
                        continue;
                    }

                    result.put(crsrdId, parseSignalItem(item, crossroad));
                }

                if (result.size() == crossroads.size() || pageNo * numOfRows >= totalCount) {
                    break;
                }
                pageNo++;
            } catch (Exception e) {
                log.error("Signal API fetch failed (page={}): {}", pageNo, e.getMessage());
                break;
            }
        }

        log.info("Loaded signal data for {} crossroads", result.size());
        return result;
    }

    private TrafficStatus parseSignalItem(JsonNode item, CrossroadInfo crossroad) {
        TrafficStatus status = new TrafficStatus();
        status.setCrsrdId(crossroad.getCrsrdId());
        status.setCrsrdNm(crossroad.getCrsrdNm());
        status.setLat(crossroad.getLat());
        status.setLon(crossroad.getLon());
        status.setTotDt(item.path("totDt").asText());
        status.setServerTimeMs(System.currentTimeMillis());

        log.debug("[RAW] crsrdId={} totDt={} raw={}",
                crossroad.getCrsrdId(), item.path("totDt").asText(), item);

        Map<String, SignalDirection> signals = new HashMap<>();
        for (String directionCode : DIRECTIONS) {
            SignalDirection direction = parseDirectionSignals(item, directionCode);
            if (direction != null) {
                signals.put(directionCode, direction);
            }
        }

        status.setSignals(signals);
        return status;
    }

    private SignalDirection parseDirectionSignals(JsonNode item, String directionCode) {
        SignalDirection direction = new SignalDirection();
        boolean hasData = false;

        for (String signalType : SIGNAL_TYPES) {
            String statusKey = directionCode + signalType + "SttsNm";
            String remainKey = directionCode + signalType + "RmndCs";

            String statusName = item.path(statusKey).asText("").trim();
            String remainingText = item.path(remainKey).asText("").trim();
            if (statusName.isBlank()) {
                continue;
            }

            int remaining = parseRemainingCount(remainingText);
            if (remaining >= 36_000) {
                continue;
            }

            DirectionSignal signal = new DirectionSignal(statusName, remaining);
            hasData = true;

            switch (signalType.toLowerCase()) {
                case "stsg" -> direction.setStsg(signal);
                case "ltsg" -> direction.setLtsg(signal);
                case "pdsg" -> direction.setPdsg(signal);
                case "utsg" -> direction.setUtsg(signal);
                case "bssg" -> direction.setBssg(signal);
                case "bcsg" -> direction.setBcsg(signal);
                default -> {
                }
            }
        }

        return hasData ? direction : null;
    }

    private int parseRemainingCount(String value) {
        try {
            return Integer.parseInt(value);
        } catch (NumberFormatException ignored) {
            return 0;
        }
    }

    private boolean isWithinRadius(double lat, double lon) {
        final int earthRadiusKm = 6371;
        double dLat = Math.toRadians(lat - jamsilLat);
        double dLon = Math.toRadians(lon - jamsilLon);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(jamsilLat)) * Math.cos(Math.toRadians(lat))
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        double distance = earthRadiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return distance <= radiusKm;
    }
}
