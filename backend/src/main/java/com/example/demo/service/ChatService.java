package com.example.demo.service;

import com.example.demo.model.TrafficContext;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
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

    @Value("${grok.api.key}")
    private String apiKey;

    @Value("${grok.api.url:https://api.groq.com/openai/v1/chat/completions}")
    private String apiUrl;

    @Value("${grok.api.model:llama-3.3-70b-versatile}")
    private String model;

    public String ask(TrafficContext ctx, String question) {
        try {
            ObjectNode body = objectMapper.createObjectNode();
            body.put("model", model);
            body.put("max_tokens", 300);

            ArrayNode messages = body.putArray("messages");
            ObjectNode sysMsg = messages.addObject();
            sysMsg.put("role", "system");
            sysMsg.put("content", buildSystemPrompt());

            ObjectNode userMsg = messages.addObject();
            userMsg.put("role", "user");
            userMsg.put("content", buildUserPrompt(ctx, question));

            String response = webClient.post()
                    .uri(apiUrl)
                    .header("Authorization", "Bearer " + apiKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .bodyValue(body)
                    .retrieve()
                    .bodyToMono(String.class)
                    .block();

            JsonNode root = objectMapper.readTree(response);
            return root.path("choices").path(0).path("message").path("content").asText("응답 없음");

        } catch (WebClientResponseException e) {
            log.error("AI API 오류 {} - 응답: {}", e.getStatusCode(), e.getResponseBodyAsString());
            return "AI 분석 실패 (" + e.getStatusCode() + ")";
        } catch (Exception e) {
            log.error("AI API 호출 실패: {}", e.getMessage());
            return "AI 분석 중 오류가 발생했습니다.";
        }
    }

    private String buildSystemPrompt() {
        return "당신은 서울 실시간 교통 관제 AI 어시스턴트입니다.\n"
             + "규칙:\n"
             + "1. 반드시 한국어로만 답하세요.\n"
             + "2. 3문장 이내로 간결하게 답하세요.\n"
             + "3. 선택된 교차로 데이터가 있으면 그것을 기반으로 답하고, 없으면 일반적인 교통 지식으로 답하세요.\n"
             + "4. 교차로 ID 숫자는 절대 출력하지 마세요. 교차로 이름만 사용하세요.\n"
             + "5. 교통과 무관한 질문(날씨, 요리 등)은 '교통 관련 질문을 해주세요'라고 답하세요.";
    }

    private String buildUserPrompt(TrafficContext ctx, String question) {
        StringBuilder signals = new StringBuilder();
        if (ctx.getSignals() != null) {
            ctx.getSignals().forEach((dir, sd) -> {
                if (sd.getStsg() != null) {
                    String status = sd.getStsg().getStatus();
                    int sec = sd.getStsg().getRmndCs() / 10;
                    String color = status != null && status.contains("Movement") ? "녹색" : "적색";
                    signals.append(String.format("  - %s 직진: %s %d초\n", dirLabel(dir), color, sec));
                }
            });
        }

        String delayStr = ctx.getDelayMin() <= 0 ? "실시간" : ctx.getDelayMin() + "분 지연";

        return String.format(
                "[현재 선택된 교차로 데이터]\n"
                + "교차로명: %s\n"
                + "날씨: %s %d°C\n"
                + "현재 구간속도: %dkm/h (평시 %dkm/h)\n"
                + "위험도: %d등급 (위험지수 %d)\n"
                + "데이터 상태: %s\n"
                + "신호 현황:\n%s\n"
                + "[질문]\n%s",
                ctx.getCrsrdNm(),
                ctx.getWeather().getCondition(), ctx.getWeather().getTemp(),
                ctx.getSpeed().getCurrent(), ctx.getSpeed().getNormal(),
                ctx.getRisk().getGrade(), ctx.getRisk().getValue(),
                delayStr,
                signals.length() > 0 ? signals : "  - 신호 데이터 없음\n",
                question
        );
    }

    private String dirLabel(String dir) {
        return switch (dir) {
            case "north" -> "북";
            case "south" -> "남";
            case "east"  -> "동";
            case "west"  -> "서";
            case "northeast" -> "북동";
            case "southeast" -> "남동";
            case "southwest" -> "남서";
            case "northwest" -> "북서";
            default -> dir;
        };
    }
}
