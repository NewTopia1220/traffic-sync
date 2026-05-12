package com.example.demo.controller;

import com.example.demo.model.TrafficContext;
import com.example.demo.service.ChatService;
import com.example.demo.service.ContextService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

//json 형태로 응답하는 컨트롤러
@RestController
//생성자 주입을 위한 Lombok 어노테이션 final필드 생성자 자동 생성해줌
@RequiredArgsConstructor
//공통 URL 매핑
@RequestMapping("/api")
public class ChatController {
    //ContextService와 ChatService는 인터페이스이지만 Spring이 런타임에 구현체를 자동으로 생성하여 주입
    private final ContextService contextService;
    //ChatService는 실제로 OpenAI API를 호출하여 답변을 생성하는 서비스
    private final ChatService chatService;

    //특정 교차로 ID에 대한 트래픽 컨텍스트를 반환하는 GET 엔드포인트 디버깅용!! 데이터 잘 넘어가는지 확인하기 위해 만든 엔드포인트 실제로는 프론트에서 이걸 직접 호출하진 않을 예정
    //예시: GET /api/context/CRSRD001
    //응답 예시:
    //{
    //  "crsrdId": "CRSRD001",
    //  "crsrdNm": "잠실역 사거리",
    //  "delayMin": 5,
    //  "signals": {
    //    "N": { "direction": "straight", "status": "red" },
    //    "S": { "direction": "straight", "status": "green" },
    //    "E": { "direction": "straight", "status": "red"
    //    "W": { "direction": "straight", "status": "green" }
    //  },
    //  "weather": { "condition": "rainy", "temperature": 22
    //  },
    //  "speed": { "current": 20, "normal": 40 },
    //  "risk": { "grade": 3, "score": 70 }
    //}
    @GetMapping("/context/{crsrdId}")
    public ResponseEntity<TrafficContext> getContext(@PathVariable String crsrdId) {
        //ContextService를 사용하여 o어진 교차로 ID에 대한 트래픽 컨텍스트를 빌드
        //빌드된 트래픽 컨텍스트가 null이면 404 Not Found 응답을 반환
        //빌드된 트래픽 컨텍스트가 null이 아니면 200 OK 응답과 함께 트래픽 컨텍스트를 반환
        //이 엔드포인트는 프론트에서 직접 호출하지 않을 예정이지만, 트래픽 컨텍스트가 제대로 빌드되는지 확인하기 위해 디버깅용으로 만들었다요
        TrafficContext ctx = contextService.buildContext(crsrdId);
        if (ctx == null) return ResponseEntity.notFound().build();
        return ResponseEntity.ok(ctx);
    }

    //사용자가 질문과 교차로 ID를 보내면, 해당 교차로의 트래픽 컨텍스트를 빌드하여 OpenAI API에 전달하고, 생성된 답변을 반환하는 POST 엔드포인트
    @PostMapping("/chat")
    public ResponseEntity<Map<String, String>> chat(@RequestBody Map<String, String> body) {
        //요청 본문에서 교차로 ID와 질문을 추출
        String crsrdId = body.get("crsrdId");
        String question = body.get("question");

        //교차로 ID와 질문이 모두 제공되었는지 확인, 하나라도 없거나 빈 문자열이면 400 Bad Request 응답 반환
        if (question == null || question.isBlank()) {
            return ResponseEntity.badRequest().build();
        }

        //ContextService를 사용하여 주어진 교차로 ID에 대한 트래픽 컨텍스트를 빌드
        //빌드된 트래픽 컨텍스트가 null이면, 기본 트래픽 컨텍스트를 빌드하여 사용
        TrafficContext ctx = contextService.buildContext(crsrdId);
        if (ctx == null) {
            ctx = contextService.buildDefaultContext();
        }

        //ChatService를 사용하여 빌드된 트래픽 컨텍스트와 질문을 전달하여 답변 생성
        String answer = chatService.ask(ctx, question);
        //생성된 답변을 "answer"라는 키로 맵에 담아 200 OK 응답과 함께 반환
        return ResponseEntity.ok(Map.of("answer", answer));
    }
}
