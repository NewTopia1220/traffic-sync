package com.example.demo.controller;

import com.example.demo.model.context.IntersectionAiContext;
import com.example.demo.service.IntersectionContextService;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.server.ResponseStatusException;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

class ChatbotContextControllerTest {

    private final IntersectionContextService contextService = mock(IntersectionContextService.class);
    private final MockMvc mockMvc = MockMvcBuilders
            .standaloneSetup(new ChatbotContextController(contextService))
            .build();

    @Test
    void returnsContextForExistingCrossroadId() throws Exception {
        when(contextService.buildContext("C1")).thenReturn(IntersectionAiContext.builder()
                .crsrdId("C1")
                .crsrdNm("잠실3사거리")
                .lat(37.5133)
                .lon(127.1002)
                .build());

        mockMvc.perform(get("/api/chatbot/context/C1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.crsrdId").value("C1"))
                .andExpect(jsonPath("$.crsrdNm").value("잠실3사거리"));
    }

    @Test
    void returnsNotFoundForUnknownCrossroadId() throws Exception {
        when(contextService.buildContext("missing"))
                .thenThrow(new ResponseStatusException(HttpStatus.NOT_FOUND, "Unknown crsrdId: missing"));

        mockMvc.perform(get("/api/chatbot/context/missing"))
                .andExpect(status().isNotFound());
    }
}
