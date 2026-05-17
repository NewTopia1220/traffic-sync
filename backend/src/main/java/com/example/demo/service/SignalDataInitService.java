package com.example.demo.service;

import com.example.demo.entity.*;
import com.example.demo.repository.*;
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
public class SignalDataInitService {

    private final SignalCrossroadRepository crossroadRepo;
    private final SignalPhaseRepository phaseRepo;
    private final SignalPlanRepository planRepo;
    private final WebClient webClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${signal.api.crossroad-url}")
    private String crossroadUrl;

    @Value("${signal.api.phase-url}")
    private String phaseUrl;

    @Value("${signal.api.plan-url}")
    private String planUrl;

    @Value("${v2x.api.service-key}")
    private String serviceKey;

    @Value("${signal.api.region-cd}")
    private String regionCd;

    @Value("${signal.api.num-of-rows}")
    private int numOfRows;

    @PostConstruct
    public void init() {
        if (crossroadRepo.count() > 0) {
            log.info("신호 교차로 DB 이미 적재됨 ({}개) - 스킵", crossroadRepo.count());
            return;
        }
        log.info("신호 시뮬레이션 데이터 적재 시작...");
        loadCrossroads();
        loadPhases();
        loadPlans();
        log.info("신호 시뮬레이션 데이터 적재 완료");
    }

    private void loadCrossroads() {
        List<SignalCrossroadEntity> batch = new ArrayList<>();
        int pageNo = 1;
        int total = 0;

        while (true) {
            try {
                URI uri = UriComponentsBuilder.fromHttpUrl(crossroadUrl)
                        .queryParam("serviceKey", serviceKey)
                        .queryParam("type", "json")
                        .queryParam("srchCTId", regionCd)
                        .queryParam("pageNo", pageNo)
                        .queryParam("numOfRows", numOfRows)
                        .build(true).toUri();

                String response = webClient.get().uri(uri).retrieve().bodyToMono(String.class).block();
                JsonNode root = objectMapper.readTree(response);

                if (!root.isArray() || root.size() < 2) break;

                JsonNode meta = root.get(0);
                int totalCount = Integer.parseInt(meta.path("totalCount").asText("0"));
                int pageSize = root.size() - 1;
                log.info("[교차로] totalCount={}, 이번 페이지={}개", totalCount, pageSize);

                for (int i = 1; i < root.size(); i++) {
                    JsonNode item = root.get(i);
                    SignalCrossroadEntity e = new SignalCrossroadEntity();
                    e.setIntNo(item.path("INT_NO").asText());
                    e.setIntNm(item.path("INT_NM").asText());
                    e.setRegionCd(item.path("REGION_CD").asText());
                    e.setXCoord(item.path("X_COORD").asText(""));
                    e.setYCoord(item.path("Y_COORD").asText(""));
                    e.setUpdDtime(item.path("UPD_DTIME").asText(""));
                    batch.add(e);

                    if (batch.size() >= 500) {
                        crossroadRepo.saveAll(batch);
                        total += batch.size();
                        batch.clear();
                    }
                }

                if (pageSize < numOfRows || total + batch.size() >= totalCount) break;
                pageNo++;

            } catch (Exception e) {
                log.error("교차로 위치정보 적재 실패 (page {}): {}", pageNo, e.getMessage());
                break;
            }
        }

        if (!batch.isEmpty()) {
            crossroadRepo.saveAll(batch);
            total += batch.size();
        }
        log.info("교차로 위치정보 적재 완료: {}개", total);
    }

    private void loadPhases() {
        List<SignalPhaseEntity> batch = new ArrayList<>();
        int pageNo = 1;
        int total = 0;

        while (true) {
            try {
                URI uri = UriComponentsBuilder.fromHttpUrl(phaseUrl)
                        .queryParam("serviceKey", serviceKey)
                        .queryParam("type", "json")
                        .queryParam("srchCTId", regionCd)
                        .queryParam("pageNo", pageNo)
                        .queryParam("numOfRows", numOfRows)
                        .build(true).toUri();

                String response = webClient.get().uri(uri).retrieve().bodyToMono(String.class).block();
                JsonNode root = objectMapper.readTree(response);

                if (!root.isArray() || root.size() < 2) break;

                JsonNode meta = root.get(0);
                int totalCount = Integer.parseInt(meta.path("totalCount").asText("0"));
                int pageSize = root.size() - 1;
                log.info("[현시구성] totalCount={}, 이번 페이지={}개", totalCount, pageSize);

                for (int i = 1; i < root.size(); i++) {
                    JsonNode item = root.get(i);
                    SignalPhaseId id = new SignalPhaseId();
                    id.setIntNo(item.path("INT_NO").asText());
                    id.setMapNo(item.path("MAP_NO").asText());

                    SignalPhaseEntity e = new SignalPhaseEntity();
                    e.setId(id);
                    e.setIntNm(item.path("INT_NM").asText());
                    e.setRegionCd(item.path("REGION_CD").asText());
                    e.setARing1(item.path("A_RING_1_PHASE_CONF_CD").asText(""));
                    e.setARing2(item.path("A_RING_2_PHASE_CONF_CD").asText(""));
                    e.setARing3(item.path("A_RING_3_PHASE_CONF_CD").asText(""));
                    e.setARing4(item.path("A_RING_4_PHASE_CONF_CD").asText(""));
                    e.setARing5(item.path("A_RING_5_PHASE_CONF_CD").asText(""));
                    e.setARing6(item.path("A_RING_6_PHASE_CONF_CD").asText(""));
                    e.setARing7(item.path("A_RING_7_PHASE_CONF_CD").asText(""));
                    e.setARing8(item.path("A_RING_8_PHASE_CONF_CD").asText(""));
                    e.setBRing1(item.path("B_RING_1_PHASE_CONF_CD").asText(""));
                    e.setBRing2(item.path("B_RING_2_PHASE_CONF_CD").asText(""));
                    e.setBRing3(item.path("B_RING_3_PHASE_CONF_CD").asText(""));
                    e.setBRing4(item.path("B_RING_4_PHASE_CONF_CD").asText(""));
                    e.setBRing5(item.path("B_RING_5_PHASE_CONF_CD").asText(""));
                    e.setBRing6(item.path("B_RING_6_PHASE_CONF_CD").asText(""));
                    e.setBRing7(item.path("B_RING_7_PHASE_CONF_CD").asText(""));
                    e.setBRing8(item.path("B_RING_8_PHASE_CONF_CD").asText(""));
                    batch.add(e);

                    if (batch.size() >= 500) {
                        phaseRepo.saveAll(batch);
                        total += batch.size();
                        batch.clear();
                    }
                }

                if (pageSize < numOfRows || total + batch.size() >= totalCount) break;
                pageNo++;

            } catch (Exception e) {
                log.error("현시구성 적재 실패 (page {}): {}", pageNo, e.getMessage());
                break;
            }
        }

        if (!batch.isEmpty()) {
            phaseRepo.saveAll(batch);
            total += batch.size();
        }
        log.info("현시구성 적재 완료: {}개", total);
    }

    private void loadPlans() {
        List<SignalPlanEntity> batch = new ArrayList<>();
        int pageNo = 1;
        int total = 0;

        while (true) {
            try {
                URI uri = UriComponentsBuilder.fromHttpUrl(planUrl)
                        .queryParam("serviceKey", serviceKey)
                        .queryParam("type", "json")
                        .queryParam("srchCTId", regionCd)
                        .queryParam("pageNo", pageNo)
                        .queryParam("numOfRows", numOfRows)
                        .build(true).toUri();

                String response = webClient.get().uri(uri).retrieve().bodyToMono(String.class).block();
                JsonNode root = objectMapper.readTree(response);

                if (!root.isArray() || root.size() < 2) break;

                JsonNode meta = root.get(0);
                int totalCount = Integer.parseInt(meta.path("totalCount").asText("0"));
                int pageSize = root.size() - 1;
                log.info("[운영계획] totalCount={}, 이번 페이지={}개", totalCount, pageSize);

                for (int i = 1; i < root.size(); i++) {
                    JsonNode item = root.get(i);
                    int cycleVal = item.path("INT_OPER_CYCLE_VAL").asInt(0);
                    // cycleVal=0인 행도 일단 저장 (나중에 시뮬레이션에서 필터)

                    SignalPlanId id = new SignalPlanId();
                    id.setIntNo(item.path("INT_NO").asText());
                    id.setPlanNo(item.path("INT_PLAN_NO").asText());
                    id.setPlanIdxNo(item.path("INT_PLAN_IDX_NO").asText());

                    SignalPlanEntity e = new SignalPlanEntity();
                    e.setId(id);
                    e.setIntNm(item.path("INT_NM").asText());
                    e.setRegionCd(item.path("REGION_CD").asText());
                    e.setOperPlanHh(item.path("OPER_PLAN_HH").asText(""));
                    e.setOperPlanMi(item.path("OPER_PLAN_MI").asText(""));
                    e.setCycleVal(cycleVal);
                    e.setOffsetVal(item.path("INT_OPER_OFFSET_VAL").asInt(0));
                    e.setARing1(nullableInt(item, "A_RING_1_PHASE_VAL"));
                    e.setARing2(nullableInt(item, "A_RING_2_PHASE_VAL"));
                    e.setARing3(nullableInt(item, "A_RING_3_PHASE_VAL"));
                    e.setARing4(nullableInt(item, "A_RING_4_PHASE_VAL"));
                    e.setARing5(nullableInt(item, "A_RING_5_PHASE_VAL"));
                    e.setARing6(nullableInt(item, "A_RING_6_PHASE_VAL"));
                    e.setARing7(nullableInt(item, "A_RING_7_PHASE_VAL"));
                    e.setARing8(nullableInt(item, "A_RING_8_PHASE_VAL"));
                    e.setBRing1(nullableInt(item, "B_RING_1_PHASE_VAL"));
                    e.setBRing2(nullableInt(item, "B_RING_2_PHASE_VAL"));
                    e.setBRing3(nullableInt(item, "B_RING_3_PHASE_VAL"));
                    e.setBRing4(nullableInt(item, "B_RING_4_PHASE_VAL"));
                    e.setBRing5(nullableInt(item, "B_RING_5_PHASE_VAL"));
                    e.setBRing6(nullableInt(item, "B_RING_6_PHASE_VAL"));
                    e.setBRing7(nullableInt(item, "B_RING_7_PHASE_VAL"));
                    e.setBRing8(nullableInt(item, "B_RING_8_PHASE_VAL"));
                    batch.add(e);

                    if (batch.size() >= 500) {
                        planRepo.saveAll(batch);
                        total += batch.size();
                        batch.clear();
                    }
                }

                if (pageSize < numOfRows || total + batch.size() >= totalCount) break;
                pageNo++;

            } catch (Exception e) {
                log.error("운영계획 적재 실패 (page {}): {}", pageNo, e.getMessage());
                break;
            }
        }

        if (!batch.isEmpty()) {
            planRepo.saveAll(batch);
            total += batch.size();
        }
        log.info("운영계획 적재 완료: {}개", total);
    }

    private Integer nullableInt(JsonNode node, String field) {
        JsonNode n = node.path(field);
        if (n.isNull() || n.isMissingNode() || n.asText("").isEmpty()) return null;
        int v = n.asInt(0);
        return v > 0 ? v : null;
    }
}
