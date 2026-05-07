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
        String prompt = buildPrompt(ctx, question);
        try {
            ObjectNode body = objectMapper.createObjectNode();
            body.put("model", model);
            body.put("max_tokens", 300);

            ArrayNode messages = body.putArray("messages");
            ObjectNode msg = messages.addObject();
            msg.put("role", "user");
            msg.put("content", prompt);

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

    private String buildPrompt(TrafficContext ctx, String question) {
        StringBuilder signals = new StringBuilder();
        if (ctx.getSignals() != null) {
            ctx.getSignals().forEach((dir, sd) -> {
                if (sd.getStsg() != null) {
                    String status = sd.getStsg().getStatus();
                    int sec = sd.getStsg().getRmndCs() / 10;
                    String color = status != null && status.contains("Movement") ? "녹색" : "적색";
                    signals.append(String.format("  - %s 직진: %s %d초%n", dirLabel(dir), color, sec));
                }
            });
        }

        String delayStr = ctx.getDelayMin() <= 0 ? "실시간" : ctx.getDelayMin() + "분 지연";

        return String.format(
                "당신은 교통 관제 AI입니다. 3문장 이내로 한국어로 답하세요.\n"
                + "교통 외 질문은 '교통 관련 질문만 답변 가능합니다' 라고 답하세요.\n\n"
                + "[실시간 데이터]\n"
                + "교차로: %s (%s)\n"
                + "날씨: %s %d°C %d시\n"
                + "구간속도: %dkm/h (평시 %dkm/h)\n"
                + "도로위험등급: %d등급 / 위험지수: %d\n"
                + "데이터 상태: %s\n"
                + "신호현황:\n%s\n"
                + "[사용자 질문]\n%s",
                ctx.getCrsrdNm(), ctx.getCrsrdId(),
                ctx.getWeather().getCondition(), ctx.getWeather().getTemp(), ctx.getWeather().getHour(),
                ctx.getSpeed().getCurrent(), ctx.getSpeed().getNormal(),
                ctx.getRisk().getGrade(), ctx.getRisk().getValue(),
                delayStr, signals, question
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
