package com.example.demo.controller;

import com.example.demo.model.context.IntersectionAiContext;
import com.example.demo.service.IntersectionContextService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/chatbot")
public class ChatbotContextController {

    private final IntersectionContextService intersectionContextService;

    // 프론트에서 교차로를 클릭하면 해당 교차로 ID로 호출하는 API다.
    // 응답은 AI 답변 문장이 아니라, 챗봇이 사용할 수 있는 계층형 JSON 데이터다.
    // 예: signal.directions.et.stsg.status / signal.directions.et.stsg.rmndCs
    @GetMapping(value = "/context/{crsrdId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public IntersectionAiContext getContext(@PathVariable String crsrdId) {
        return intersectionContextService.buildContext(crsrdId);
    }
}
