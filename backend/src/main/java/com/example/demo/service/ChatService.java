package com.example.demo.service;

import com.example.demo.model.TrafficContext;
import com.example.demo.model.DirectionSignal;
import com.example.demo.model.SignalDirection;
import com.example.demo.model.TrafficStatus;
import com.example.demo.model.context.WeatherSnapshot;
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

import java.util.Locale;
import java.util.Map;

// AI API 호출 및 응답 처리 서비스
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
