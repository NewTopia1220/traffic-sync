package com.example.demo.controller;

import com.example.demo.model.TrafficContext;
import com.example.demo.service.ChatService;
import com.example.demo.service.ContextService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api")
public class ChatController {

    private final ContextService contextService;
    private final ChatService chatService;

    @GetMapping("/context/{crsrdId}")
    public ResponseEntity<TrafficContext> getContext(@PathVariable String crsrdId) {
        TrafficContext ctx = contextService.buildContext(crsrdId);
        if (ctx == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(ctx);
    }

    @PostMapping("/chat")
    public ResponseEntity<Map<String, String>> chat(@RequestBody Map<String, String> body) {
        String crsrdId = body.get("crsrdId");
        String question = body.get("question");

        if (question == null || question.isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        TrafficContext ctx = contextService.buildContext(crsrdId);
        if (ctx == null) {
            ctx = contextService.buildDefaultContext();
        }

        String answer = chatService.ask(ctx, question);
        return ResponseEntity.ok(Map.of("answer", answer));
    }
}
