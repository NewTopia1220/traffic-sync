package com.example.demo.service;

import com.example.demo.model.TrafficContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChatService {

    private final WebClient webClient;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${agent.api.url:http://localhost:8000}")
    private String agentUrl;

    // 자유 챗봇 — 지도 페이지 (교차로 선택 여부 무관)
    public String ask(TrafficContext ctx, String question) {
        try {
            ObjectNode body = objectMapper.createObjectNode();
            body.put("question", question);
            if (ctx != null && ctx.getCrsrdId() != null) {
                body.put("crsrdId", ctx.getCrsrdId());
            }

            String response = webClient.post()
                    .uri(agentUrl + "/api/agent/chat")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            JsonNode root = objectMapper.readTree(response);
            return root.path("answer").asText("응답 없음");

        } catch (WebClientResponseException e) {
            log.error("에이전트 오류 {} - {}", e.getStatusCode(), e.getResponseBodyAsString());
            return "AI 분석 실패 (" + e.getStatusCode() + ")";
        } catch (Exception e) {
            log.error("에이전트 호출 실패: {}", e.getMessage());
            return "AI 분석 중 오류가 발생했습니다.";
        }
    }

    // 구 단위 리포트 — 메인 대시보드
    public String districtReport(String districtName) {
        try {
            ObjectNode body = objectMapper.createObjectNode();
            body.put("district", districtName);

            String response = webClient.post()
                    .uri(agentUrl + "/api/agent/district-report")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            JsonNode root = objectMapper.readTree(response);
            return root.path("report").asText("리포트 생성 실패");

        } catch (Exception e) {
            log.error("구 리포트 생성 실패: {}", e.getMessage());
            return "리포트 생성 중 오류가 발생했습니다.";
        }
    }
}
