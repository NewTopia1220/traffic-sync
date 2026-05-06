package com.example.demo.websocket;

import com.example.demo.model.TrafficStatus;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.*;
import org.springframework.web.socket.handler.TextWebSocketHandler;

import java.io.IOException;
import java.util.Collection;
import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

@Slf4j
@Component
public class TrafficWebSocketHandler extends TextWebSocketHandler {

    // 연결된 클라이언트 세션 목록 (Thread-safe)
    private final CopyOnWriteArrayList<WebSocketSession> sessions = new CopyOnWriteArrayList<>();
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.add(session);
        log.info("WebSocket 연결: {} (총 {}명)", session.getId(), sessions.size());
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session);
        log.info("WebSocket 종료: {} (총 {}명)", session.getId(), sessions.size());
    }

    // 신호 데이터 전체를 모든 클라이언트에 브로드캐스트
    public void broadcast(Map<String, TrafficStatus> statusMap) {
        if (sessions.isEmpty()) return;

        try {
            Collection<TrafficStatus> payload = statusMap.values();
            String json = objectMapper.writeValueAsString(payload);
            TextMessage message = new TextMessage(json);

            for (WebSocketSession session : sessions) {
                if (session.isOpen()) {
                    try {
                        session.sendMessage(message);
                    } catch (IOException e) {
                        log.warn("세션 전송 실패 ({}): {}", session.getId(), e.getMessage());
                    }
                }
            }
        } catch (Exception e) {
            log.error("브로드캐스트 실패: {}", e.getMessage());
        }
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        // 클라이언트 → 서버 메시지는 PoC에서 사용 안 함
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable exception) {
        log.error("WebSocket 오류 ({}): {}", session.getId(), exception.getMessage());
        sessions.remove(session);
    }
}
