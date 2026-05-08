package com.example.demo.service;

import com.example.demo.entity.CrossroadEntity;
import com.example.demo.repository.CrossroadRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class CrossroadDataInitService {

    private final CrossroadRepository crossroadRepository;
    private final WebClient webClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${v2x.api.crossroad-url}")
    private String crossroadUrl;

    @Value("${v2x.api.service-key}")
    private String serviceKey;

    @Value("${v2x.api.num-of-rows}")
    private int numOfRows;

    @PostConstruct
    public void init() {
        if (crossroadRepository.count() > 0) {
            log.info("교차로 DB 이미 적재됨 ({}개) - 스킵", crossroadRepository.count());
            return;
        }
        log.info("교차로 DB 적재 시작...");
        loadAllCrossroads();
    }

    private void loadAllCrossroads() {
        List<CrossroadEntity> batch = new ArrayList<>();
        int pageNo = 1;
        int total = 0;

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
                    String latStr = item.path("mapCtptIntLat").asText("").trim();
                    String lonStr = item.path("mapCtptIntLot").asText("").trim();
                    if (latStr.isEmpty() || lonStr.isEmpty()) continue;

                    CrossroadEntity e = new CrossroadEntity();
                    e.setCrsrdId(item.path("crsrdId").asText());
                    e.setCrsrdNm(item.path("crsrdNm").asText());
                    e.setLat(Double.parseDouble(latStr));
                    e.setLon(Double.parseDouble(lonStr));
                    batch.add(e);

                    if (batch.size() >= 500) {
                        crossroadRepository.saveAll(batch);
                        total += batch.size();
                        batch.clear();
                    }
                }

                if (pageNo * numOfRows >= totalCount) break;
                pageNo++;

            } catch (Exception e) {
                log.error("교차로 DB 적재 실패 (page {}): {}", pageNo, e.getMessage());
                break;
            }
        }

        if (!batch.isEmpty()) {
            crossroadRepository.saveAll(batch);
            total += batch.size();
        }

        log.info("교차로 DB 적재 완료: {}개", total);
    }
}
