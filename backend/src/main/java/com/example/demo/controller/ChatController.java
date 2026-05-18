package com.example.demo.controller;

import com.example.demo.model.TrafficStatus;
import com.example.demo.service.ChatService;
import com.example.demo.service.SupplementalDataCacheService;
import com.example.demo.service.TrafficCacheService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

// 챗봇 질문/응답을 처리하는 컨트롤러.
// 프론트는 교차로 ID와 질문만 보내고, 백엔드가 TrafficStatus에 실제 보조 데이터를 합쳐 AI에 넘긴다.
@RestController
@RequiredArgsConstructor
@RequestMapping("/api")
public class ChatController {
    private final TrafficCacheService trafficCacheService;
    private final SupplementalDataCacheService supplementalDataCacheService;
    private final ChatService chatService;

    // 디버깅용: 현재 챗봇이 참고할 교차로 통합 상태를 그대로 확인한다.
    @GetMapping("/context/{crsrdId}")
    public ResponseEntity<TrafficStatus> getContext(@PathVariable String crsrdId) {
        TrafficStatus status = trafficCacheService.getSignal(crsrdId);
        if (status == null) {
            return ResponseEntity.notFound().build();
        }
        return ResponseEntity.ok(supplementalDataCacheService.enrichTrafficStatus(status));
    }

    // 사용자가 질문과 교차로 ID를 보내면, 같은 TrafficStatus 데이터를 기준으로 AI 답변을 만든다.
    @PostMapping("/chat")
    public ResponseEntity<Map<String, String>> chat(@RequestBody Map<String, String> body) {
        String crsrdId = body.get("crsrdId");
        String question = body.get("question");

        if (question == null || question.isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        TrafficStatus status = null;
        if (crsrdId != null && !crsrdId.isBlank()) {
            status = trafficCacheService.getSignal(crsrdId);
        }
        if (status != null) {
            supplementalDataCacheService.enrichTrafficStatus(status);
        }

        String answer = chatService.ask(status, question);
        return ResponseEntity.ok(Map.of("answer", answer));
    }
}
