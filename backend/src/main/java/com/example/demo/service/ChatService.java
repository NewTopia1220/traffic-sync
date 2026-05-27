package com.example.demo.service;

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

import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class ChatService {

    private final WebClient webClient;
    private final SignalService signalService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${agent.api.url:http://localhost:8001}")
    private String agentUrl;

    // 자유 챗봇 — 지도 페이지 (교차로 선택 여부 무관)
    public String ask(String crsrdId, String question) {
        try {
            ObjectNode body = objectMapper.createObjectNode();
            body.put("question", question);
            if (crsrdId != null && !crsrdId.isBlank()) {
                body.put("crsrdId", crsrdId);
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

    // 시뮬레이션 페이지 챗봇 — 신호계획 내부 조립 후 AI 분석
    public String simulationChat(String intNo, String question, List<Map<String, Object>> simulation) {
        try {
            // Spring 내부에서 신호계획 컨텍스트 조립 (LLM이 MCP 도구 호출 불필요)
            Map<String, Object> context = (intNo != null && !intNo.isBlank())
                    ? signalService.getSimulationContext(intNo)
                    : Map.of();

            ObjectNode body = objectMapper.createObjectNode();
            body.put("question", question);
            body.set("context", objectMapper.valueToTree(context));
            if (simulation != null && !simulation.isEmpty()) {
                body.set("simulation", objectMapper.valueToTree(simulation));
            }

            String response = webClient.post()
                    .uri(agentUrl + "/api/agent/simulation-chat")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            JsonNode root = objectMapper.readTree(response);
            return root.path("answer").asText("응답 없음");

        } catch (WebClientResponseException e) {
            log.error("시뮬레이션 에이전트 오류 {} - {}", e.getStatusCode(), e.getResponseBodyAsString());
            return "AI 분석 실패 (" + e.getStatusCode() + ")";
        } catch (Exception e) {
            log.error("시뮬레이션 에이전트 호출 실패: {}", e.getMessage());
            return "AI 분석 중 오류가 발생했습니다.";
        }
    }

    // 병목 이메일 — 10km/h 이하만 필터링해서 메일 발송
    public String bottleneckEmail(String districtName) {
        try {
            ObjectNode body = objectMapper.createObjectNode();
            body.put("district", districtName);

            String response = webClient.post()
                    .uri(agentUrl + "/api/agent/bottleneck-email")
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            JsonNode root = objectMapper.readTree(response);
            return root.path("answer").asText("메일 전송 완료");
        } catch (Exception e) {
            log.error("병목 메일 전송 실패: {}", e.getMessage());
            return "메일 전송 중 오류가 발생했습니다.";
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
