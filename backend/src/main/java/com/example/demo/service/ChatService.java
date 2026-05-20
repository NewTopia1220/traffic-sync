package com.example.demo.service;

import com.example.demo.model.DirectionSignal;
import com.example.demo.model.SignalDirection;
import com.example.demo.model.TrafficStatus;
import com.example.demo.model.context.WeatherSnapshot;
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

import java.util.Locale;
import java.util.Map;

// AI API 호출 및 응답 처리 서비스
@Slf4j
@Service
@RequiredArgsConstructor
public class ChatService {

    // WebClient는 Bean으로 주입받아 재사용 (커넥션 풀링, 설정 일관성)
    // AI API 호출용 WebClient
    // WebClient는 스프링에서 제공하는 비동기 HTTP 클라이언트로, REST API 호출에 최적화되어 있음.
    //3곳에서 같은 WebClient 빈을 주입

    //V2xApiService	V2X 공공API 호출
    //ChatService	Grok AI API 호출
    //CrossroadDataInitService	교차로 초기 적재 API 호출
    private final WebClient webClient;

    // JSON 처리용 ObjectMapper (필요 시 커스터마이징 가능)
    //Java 객체 ↔ JSON 변환해주는 도구
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${grok.api.key}")
    private String apiKey;

    @Value("${grok.api.url:https://api.groq.com/openai/v1/chat/completions}")
    private String apiUrl;

    @Value("${grok.api.model:llama-3.3-70b-versatile}")
    private String model;

    // 대시보드와 같은 TrafficStatus를 AI 프롬프트로 바꿔 답변을 요청한다.
    public String ask(TrafficStatus status, String question) {
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
            userMsg.put("content", buildUserPrompt(status, question));

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
             + "1. 반드시 순수한 한국어로만 답하세요. 한자, 중국어, 일본어, 베트남어 등 다른 언어 문자를 절대 사용하지 마세요.\n"
             + "2. 3문장 이내로 간결하게 답하세요.\n"
             + "3. 선택된 교차로 데이터가 있으면 그것을 기반으로 답하고, 없으면 일반적인 교통 지식으로 답하세요.\n"
             + "4. 교차로 ID 숫자는 절대 출력하지 마세요. 교차로 이름만 사용하세요.\n"
             + "5. 교통과 무관한 질문(날씨, 요리 등)은 '교통 관련 질문을 해주세요'라고 답하세요.\n"
             + "6. 영어 단어도 가능하면 한국어로 바꿔서 답하세요.";
    }


    // TrafficStatus를 사람이 읽을 수 있는 요약으로 바꿔 AI에 넘긴다.
    // 여기서 쓰는 속도/위험도는 프론트 더미가 아니라 백엔드에 합쳐진 실제 API 캐시 값이다.
    private String buildUserPrompt(TrafficStatus status, String question) {
        if (status == null) {
            return "[현재 선택된 교차로 데이터]\n"
                    + "교차로 데이터 없음\n"
                    + "[질문]\n"
                    + question;
        }

        String signals = buildSignalSummary(status.getSignals());

        return String.format(
                "[현재 선택된 교차로 데이터]\n"
                + "교차로명: %s\n"
                + "현재 속도: %s\n"
                + "혼잡 상태: %s\n"
                + "평균 대기시간: %s\n"
                + "도로 위험도: %s\n"
                + "날씨: %s\n"
                + "신호 현황:\n%s\n"
                + "[질문]\n%s",
                status.getCrsrdNm(),
                formatSpeed(status),
                valueOrWaiting(status.getCongestion()),
                status.getAvgWaitSec() == null ? "수집 대기" : status.getAvgWaitSec() + "초",
                formatRisk(status),
                formatWeather(status.getWeather()),
                signals,
                question
        );
    }

    private String buildSignalSummary(Map<String, SignalDirection> signals) {
        if (signals == null || signals.isEmpty()) {
            return "  - 신호 데이터 없음\n";
        }

        StringBuilder builder = new StringBuilder();
        signals.forEach((dir, signalDirection) -> {
            if (signalDirection == null) {
                return;
            }
            appendSignal(builder, dir, "직진", signalDirection.getStsg());
            appendSignal(builder, dir, "좌회전", signalDirection.getLtsg());
            appendSignal(builder, dir, "보행", signalDirection.getPdsg());
        });
        return builder.length() == 0 ? "  - 신호 데이터 없음\n" : builder.toString();
    }

    private void appendSignal(StringBuilder builder, String dir, String type, DirectionSignal signal) {
        if (signal == null) {
            return;
        }
        builder.append(String.format(
                "  - %s %s: %s %d초\n",
                dirLabel(dir),
                type,
                signalColor(signal.getStatus()),
                signal.getRmndCs() / 10
        ));
    }

    private String formatSpeed(TrafficStatus status) {
        if (status.getSpeedKph() == null) {
            return "수집 대기";
        }
        String stale = status.isSpeedStale() ? " (갱신 대기)" : "";
        return String.format(Locale.KOREA, "%.1fkm/h%s", status.getSpeedKph(), stale);
    }

    private String formatRisk(TrafficStatus status) {
        if (status.getRiskScore() == null && status.getRiskGrade() == null) {
            return "수집 대기";
        }
        String stale = status.isRiskStale() ? " (갱신 대기)" : "";
        String score = status.getRiskScore() == null
                ? "점수 수집 대기"
                : status.getRiskScore() + "점";
        return String.format("%s, 등급 %s%s", score, valueOrWaiting(status.getRiskGrade()), stale);
    }

    private String formatWeather(WeatherSnapshot weather) {
        if (weather == null) {
            return "수집 대기";
        }

        return String.format(Locale.KOREA,
                "기온 %s, 강수량 %s, 습도 %s, 풍속 %s%s",
                weather.getTemperatureC() == null ? "수집 대기" : String.format(Locale.KOREA, "%.1f°C", weather.getTemperatureC()),
                weather.getPrecipitationMm() == null ? "수집 대기" : String.format(Locale.KOREA, "%.1fmm", weather.getPrecipitationMm()),
                weather.getHumidityPercent() == null ? "수집 대기" : weather.getHumidityPercent() + "%",
                weather.getWindSpeedMs() == null ? "수집 대기" : String.format(Locale.KOREA, "%.1fm/s", weather.getWindSpeedMs()),
                weather.isStale() ? " (갱신 대기)" : ""
        );
    }

    private String signalColor(String status) {
        if (status == null) {
            return "상태 불명";
        }
        String lower = status.toLowerCase();
        if (lower.contains("movement-allowed")) {
            return "녹색";
        }
        if (lower.contains("stop")) {
            return "적색";
        }
        if (lower.contains("clearance")) {
            return "전환";
        }
        return status;
    }

    private String valueOrWaiting(String value) {
        return value == null || value.isBlank() ? "수집 대기" : value;
    }

    private String dirLabel(String dir) {
        return switch (dir) {
            case "nt" -> "북";
            case "st" -> "남";
            case "et" -> "동";
            case "wt" -> "서";
            case "ne" -> "북동";
            case "se" -> "남동";
            case "sw" -> "남서";
            case "nw" -> "북서";
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
