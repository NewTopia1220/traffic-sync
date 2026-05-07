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

    @GetMapping(value = "/context/{crsrdId}", produces = MediaType.APPLICATION_JSON_VALUE)
    public IntersectionAiContext getContext(@PathVariable String crsrdId) {
        return intersectionContextService.buildContext(crsrdId);
    }
}
