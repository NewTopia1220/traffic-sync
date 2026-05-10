package com.example.demo.service;

import com.example.demo.model.DirectionSignal;
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

    // 트래픽 컨텍스트와 사용자 질문을 받아 AI API에 요청하고, 응답을 반환하는 메서드
    public String ask(TrafficContext ctx, String question) {
        try {
            // AI API 요청 바디 구성
            //createObjectNode()는 빈 JSON 객체를 만드는 것
            ObjectNode body = objectMapper.createObjectNode();
            body.put("model", model);
            body.put("max_tokens", 300);

            // 메시지 배열 구성 (system + user)
            //body 안에 "messages" 키로 빈 배열 만든다:
            //
            //
            //{
            //  "model": "grok-2",
            //  "messages": []   ← 여기
            //}
            ArrayNode messages = body.putArray("messages");
            //배열 안에 빈 객체 하나 추가:
            //
            //
            //{
            //  "messages": [
            //    {}   ← 여기
            //  ]
            //}
            ObjectNode sysMsg = messages.addObject();
            sysMsg.put("role", "system");
            //최종적으로 Grok API가 받는 구조:
            //
            //
            //{
            //  "model": "grok-2",
            //  "max_tokens": 300,
            //  "messages": [
            //    { "role": "system", "content": "당신은 교통 관제 AI..." }, --> 이건 밑에 프롬포트 보면됨
            //    { "role": "user",   "content": "지금 날씨 어때?" } --> 이건 유저임
            //  ]
            //}
            sysMsg.put("content", buildSystemPrompt());

            // 사용자 메시지에는 트래픽 컨텍스트와 질문을 함께 담아서 보냄 → AI가 상황을 이해하고 답변 생성할 수 있도록
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


    // 트래픽 컨텍스트의 다양한 정보를 프롬프트에 보기 좋게 정리하여 포함시키는 메서드
    // AI가 현재 상황을 최대한 이해할 수 있도록 상세히 기술 → 답변의 정확도와 유용성 향상 기대
    private String buildUserPrompt(TrafficContext ctx, String question) {

        // 트래픽 컨텍스트의 신호등 정보는 방향별로 다를 수 있으므로, 각 방향에 대해 신호 상태와 남은 시간을 보기 좋게 정리하여 프롬프트에 포함
        //String은 더할 때마다 새로 만들어서 비효율적이라 StringBuilder 사용함
        StringBuilder signals = new StringBuilder();

        if (ctx.getSignals() != null) {

            //{
            //  "nt" → SignalDirection { stsg: { status: "protected-Movement-Allowed", rmndCs: 150 } }
            //  "et" → SignalDirection { stsg: { status: "stop-And-Remain", rmndCs: 200 } }
            //  "st" → SignalDirection { stsg: null }
            //}
            ctx.getSignals().forEach((dir, sd) -> {
                //private DirectionSignal stsg; // 그록엔 직진정보만 넘김
                if (sd.getStsg() != null) {
                    //정보 파신 신호 상태
                    String status = sd.getStsg().getStatus();
                    //정보 파싱 신호 남은 시간(초) → API에서 10초 단위로 줘서 10으로 나눠서 초 단위로 환산
                    int sec = sd.getStsg().getRmndCs() / 10;
                    //녹색 적색으로 넘김 -> API에서 "protected-Movement-Allowed" 이런식으로 주는데, "Movement"라는 단어가 들어가면 녹색, 아니면 적색으로 간단히 구분해서 프롬프트에 넣어줌
                    String color = status != null && status.contains("Movement") ? "녹색" : "적색";
                    //ctx {
                    //  crsrdId: "1007"
                    //  crsrdNm: "잠실역사거리"
                    //  delayMin: 2
                    //  weather: { condition: "비", temperature: 19, hour: 14 }
                    //  speed: { north: 18, south: 22, east: 15, west: 25, avg: 20 }
                    //  risk: { score: 87 }
                    //  signals: {
                    //    "et" → { stsg: ("protected-Movement-Allowed", 445) }
                    //    "st" → { pdsg: ("stop-And-Remain", 495) }
                    //    "wt" → { stsg: ("protected-Movement-Allowed", 445) }
                    //  }
                    //}
                     //교차로 클릭하고 질문할때 이런식으로 데이터를 계속 이런식으로 프롬프트에 넣어서 AI가 상황을 이해할 수 있도록 도와줌
                    signals.append(String.format("  - %s 직진: %s %d초\n", dirLabel(dir), color, sec));
                }
            });
        }

        String delayStr = ctx.getDelayMin() <= 0 ? "실시간" : ctx.getDelayMin() + "분 지연";
        //팀원들 이 주는 데이터에 따라 유동적으로 바뀔예정
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
