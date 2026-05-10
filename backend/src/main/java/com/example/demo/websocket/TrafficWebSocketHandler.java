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
// WebSocket 연결 관리 및 신호 데이터 브로드캐스트 핸들러
//빈으로 등록함
@Component
public class TrafficWebSocketHandler extends TextWebSocketHandler {

    // 연결된 클라이언트 세션 목록 (Thread-safe)
    //러 스레드가 동시에 접근해도 안전해요
    //스케줄러가 브로드캐스트하면서 + 새 사용자가 접속하면서 동시에 sessions 건드려도 안전
    private final CopyOnWriteArrayList<WebSocketSession> sessions = new CopyOnWriteArrayList<>();
    //TrafficStatus 객체 → JSON 문자열 변환할 때
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Override
    // 새 클라이언트가 연결되면 세션을 목록에 추가
    public void afterConnectionEstablished(WebSocketSession session) {
        sessions.add(session);
        log.info("WebSocket 연결: {} (총 {}명)", session.getId(), sessions.size());
    }

    @Override
    // 클라이언트 연결이 종료되면 세션을 목록에서 제거
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        sessions.remove(session);
        log.info("WebSocket 종료: {} (총 {}명)", session.getId(), sessions.size());
    }

    // 신호 데이터 전체를 모든 클라이언트에 브로드캐스트
    public void broadcast(Map<String, TrafficStatus> statusMap) {
        if (sessions.isEmpty()) return;

        try {
            // 신호 상태 맵을 JSON 배열로 변환 (교차로ID는 포함 안 함, 단순히 신호 상태 정보만)
            Collection<TrafficStatus> payload = statusMap.values();
            //Java 객체 → JSON 문자열로 변환
            //"[
            //  { \"crsrdId\": \"1007\", \"crsrdNm\": \"잠실역\", \"signals\": {...} },
            //  { \"crsrdId\": \"1008\", \"crsrdNm\": \"석촌역\", \"signals\": {...} }
            //]"
            String json = objectMapper.writeValueAsString(payload);

            //JSON 문자열을 WebSocket 전송용 메시지로 포장
            TextMessage message = new TextMessage(json);

            //for (WebSocketSession session : sessions) {
            //연결된 모든 브라우저 세션 순회
            //session1 (크롬 탭 1)
            //session2 (크롬 탭 2)
            //session3 (다른 사용자)
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
