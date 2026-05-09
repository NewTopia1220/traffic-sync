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

    private static final String[] DIRECTIONS = {"nt", "et", "st", "wt", "ne", "se", "sw", "nw"};
    private static final String[] SIGNAL_TYPES = {"Stsg", "Ltsg", "Pdsg", "Utsg", "Bssg", "Bcsg"};

    public V2xApiService(WebClient webClient) {
        this.webClient = webClient;
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

}
