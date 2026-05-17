package com.example.demo.service;

import com.example.demo.model.*;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.util.*;

@Slf4j
@Service
public class V2xApiService {

    // WebClient는 Bean으로 주입받아 재사용 (커넥션 풀링, 설정 일관성)
    private final WebClient webClient;

    // JSON 처리용 ObjectMapper (필요 시 커스터마이징 가능)
    // Java 객체 ↔ JSON 변환해주는 도구
    private final ObjectMapper objectMapper = new ObjectMapper();

    @Value("${v2x.api.crossroad-url}")
    private String crossroadUrl;

    @Value("${v2x.api.signal-url}")
    private String signalUrl;

    @Value("${v2x.api.service-key}")
    private String serviceKey;

    @Value("${v2x.api.num-of-rows}")
    private int numOfRows;

    // 신호등 API에서 방향과 신호 유형을 조합하여 필드명을 구성하기 위한 상수 배열
    private static final String[] DIRECTIONS = {"nt", "et", "st", "wt", "ne", "se", "sw", "nw"};
    // 신호 유형 배열: Stsg, Ltsg, Pdsg, Utsg, Bssg, Bcsg
    private static final String[] SIGNAL_TYPES = {"Stsg", "Ltsg", "Pdsg", "Utsg", "Bssg", "Bcsg"};


    // 생성자 주입 방식으로 WebClient를 받아옴 (Lombok @RequiredArgsConstructor 사용)
    public V2xApiService(WebClient webClient) {
        this.webClient = webClient;
    }


    // 신호등 데이터 가져오기 (교차로 ID 기준으로 필터)
    //예시 데이터 List<CrossroadInfo> crossroads = [
    //    CrossroadInfo { crsrdId: "1007", crsrdNm: "잠실역사거리",  lat: 37.51, lon: 127.08 },
    //    CrossroadInfo { crsrdId: "1008", crsrdNm: "석촌역사거리",  lat: 37.50, lon: 127.10 },
    //    CrossroadInfo { crsrdId: "1009", crsrdNm: "롯데타워교차로", lat: 37.51, lon: 127.10 }
    //] 이렇게 넘엉옴
    public Map<String, TrafficStatus> fetchSignalData(List<CrossroadInfo> crossroads) {


        Map<String, CrossroadInfo> crossroadMap = new HashMap<>();

        // 교차로 리스트를 ID 기준으로 맵핑하여 빠른 조회 가능하도록 준비
        for (CrossroadInfo c : crossroads) {
            crossroadMap.put(c.getCrsrdId(), c);
        }

        // API는 페이지네이션이 있으므로, 대상 교차로를 모두 찾거나 전체 페이지를 다 조회할 때까지 반복
        Map<String, TrafficStatus> result = new HashMap<>();
        int pageNo = 1;

        while (true) {
            try {
                // API 요청 URI 구성 (페이지 번호, 페이지당 행 수, 기타 고정 파라미터 포함)
                //https://apis.data.go.kr/signal?serviceKey=abc123
                //
                //.queryParam("pageNo", pageNo)
                //
                //?serviceKey=abc123&pageNo=1
                //
                //.queryParam("numOfRows", numOfRows)
                //
                //?serviceKey=abc123&pageNo=1&numOfRows=100
                //
                //.queryParam("type", "JSON")
                //
                //?serviceKey=abc123&pageNo=1&numOfRows=100&type=JSON
                //
                //.queryParam("stdgCd", "1100000000")
                //
                //?serviceKey=abc123&pageNo=1&numOfRows=100&type=JSON&stdgCd=1100000000
                //
                //.build(true).toUri() --> 조립함
                URI signalUri = UriComponentsBuilder.fromHttpUrl(signalUrl)
                        .queryParam("serviceKey", serviceKey)
                        .queryParam("pageNo", pageNo)
                        .queryParam("numOfRows", numOfRows)
                        .queryParam("type", "JSON")
                        .queryParam("stdgCd", "1100000000")
                        .build(true).toUri();


                // API 호출 및 응답 수신
                //String response = webClient.get()   // GET 방식
                //    .uri(signalUri)                 // 만들어둔 URL 사용
                //    .retrieve()                     // 요청 전송
                //    .bodyToMono(String.class)       // 응답 → 문자열
                //    .block();                       // 올 때까지 대기
                String response = webClient.get()
                        .uri(signalUri)
                        .retrieve()
                        .bodyToMono(String.class)
                        .block();


                //"{\"body\":{\"totalCount\":2576,\"items\":{\"item\":[{\"crsrdId\":\"1007\",
                // \"etStsgSttsNm\":\"protected-Movement-Allowed\",\"etStsgRmndCs\":\"445\"}]}}}"
                //--> 이런식으로 복잡하게 옴 그래서 readTree로 JSON 파싱해서 필요한 데이터 추출해야함
                //objectMapper.readTree(response) 후 JsonNode:
                //
                //
                //JsonNode root = {
                //    "body": {
                //        "totalCount": 2576,
                //        "items": {
                //            "item": [
                //                {
                //                    "crsrdId": "1007",
                //                    "etStsgSttsNm": "protected-Movement-Allowed",
                //                    "etStsgRmndCs": "445"
                //                }
                //            ]
                //        }
                //    }


                //} --> 이런식으로 트리 구조로 파싱됨
                JsonNode root = objectMapper.readTree(response);
                // API 응답에서 신호등 데이터가 담긴 배열 추출 (body → items → item)
                JsonNode items = root.path("body").path("items").path("item");
                // API 응답에서 전체 데이터 수 추출 (페이지네이션 종료 조건으로 사용)
                int totalCount = root.path("body").path("totalCount").asInt();

                if (!items.isArray() || items.size() == 0) break;

                for (JsonNode item : items) {
                    String crsrdId = item.path("crsrdId").asText();
                    if (!crossroadMap.containsKey(crsrdId)) continue;

                    // API 응답의 각 item에서 교차로 ID 추출 →
                    // 대상 교차로 리스트에 있는지 확인 →
                    // 있으면 해당 교차로 정보와 함께 신호등 상태 파싱하여 결과 맵에 저장

                    //crossroadMap.get("1007")
                    // → CrossroadInfo { crsrdId: "1007", crsrdNm: "잠실역사거리", lat: 37.51, lon: 127.08 }
                    CrossroadInfo crossroad = crossroadMap.get(crsrdId);
                    TrafficStatus status = parseSignalItem(item, crossroad);
                    result.put(crsrdId, status);
                }

                // 대상 교차로를 모두 찾았으면 조기 종료
                if (result.size() == crossroads.size()) break;
                if (pageNo * numOfRows >= totalCount) break;
                pageNo++;

            } catch (Exception e) {
                log.error("신호등 API 호출 실패 (page {}): {}", pageNo, e.getMessage());
                break;
            }
        }

        log.info("신호 데이터 수집 완료: {}개", result.size());
        return result;
    }

    // API 응답 item 하나를 TrafficStatus로 파싱
    // item (V2X API에서 받은 신호 데이터)
    //JsonNode item = {
    //    "crsrdId": "1007",
    //    "totDt": "20260510150801",
    //    "etStsgSttsNm": "protected-Movement-Allowed",
    //    "etStsgRmndCs": "445"
    //}
    //

    // crossroad (DB에서 꺼낸 교차로 정보)
    //CrossroadInfo crossroad = {
    //    crsrdId: "1007",
    //    crsrdNm: "잠실역사거리",
    //    lat: 37.51,
    //    lon: 127.08
    //}
    private TrafficStatus parseSignalItem(JsonNode item, CrossroadInfo crossroad) {

        //데이터 파싱하여 TrafficStatus 객체로 변환
        TrafficStatus status = new TrafficStatus();
        status.setCrsrdId(crossroad.getCrsrdId());
        status.setCrsrdNm(crossroad.getCrsrdNm());
        status.setLat(crossroad.getLat());
        status.setLon(crossroad.getLon());
        status.setTotDt(item.path("totDt").asText());
        status.setServerTimeMs(System.currentTimeMillis());

        // 원본 API 데이터 디버그 로그
        log.debug("[RAW] crsrdId={} totDt={} raw={}",
                crossroad.getCrsrdId(), item.path("totDt").asText(), item);


        // 신호등 데이터는 방향별로 여러 유형이 있을 수 있으므로, DIRECTIONS와 SIGNAL_TYPES 배열을 조합하여 필드명을 동적으로 생성하고 데이터를 추출
        //계층형으로 신호등 데이터 구조화 → SignalDirection 객체에 방향별 신호 상태 저장 → TrafficStatus 객체에 방향별 신호 정보 맵으로 저장
        Map<String, SignalDirection> signals = new HashMap<>();



        // 신호등 API에서 방향과 신호 유형을 조합하여 필드명을 구성하기 위한 상수 배열
//        private static final String[] DIRECTIONS = {"nt", "et", "st", "wt", "ne", "se", "sw", "nw"};
        // 신호 유형 배열: Stsg, Ltsg, Pdsg, Utsg, Bssg, Bcsg
//        private static final String[] SIGNAL_TYPES = {"Stsg", "Ltsg", "Pdsg", "Utsg", "Bssg", "Bcsg"};

        for (String dir : DIRECTIONS) {
            SignalDirection direction = new SignalDirection();
            boolean hasData = false;

            for (String sigType : SIGNAL_TYPES) {
                // 필드명 조합: dir + sigType + "SttsNm" / "RmndCs"
                // 예: ntStsgSttsNm, ntStsgRmndCs
                String statusKey = dir + sigType + "SttsNm";
                String rmndKey   = dir + sigType + "RmndCs";

                //item JSON에서 statusKey 이름의 필드 찾아

                //.asText("")
                //찾은 값을 문자열로 변환해요. 필드가 없거나 null이면 "" 반환

                //.trim()
                //앞뒤 공백 제거


                String sttsNm = item.path(statusKey).asText("").trim();
                String rmndCs = item.path(rmndKey).asText("").trim();

                //못찾은거임
                if (sttsNm.isEmpty()) continue;


                int rmnd = 0;
                try { rmnd = Integer.parseInt(rmndCs); } catch (NumberFormatException ignored) {}

                // 36001 = V2X 센티넬 값 (잔여시간 불명), 해당 신호 무시
                if (rmnd >= 36000) continue;

                // 신호 상태가 존재하는 경우에만 SignalDirection 객체에 저장
                //계층형으로 가는중
                // signals
                //  └── "et" (방향)
                //        └── SignalDirection
                //              └── stsg: DirectionSignal { status, rmndCs }
                DirectionSignal ds = new DirectionSignal(sttsNm, rmnd);
                hasData = true;

                // 신호 유형에 따라 SignalDirection 객체의 해당 필드에 저장 두번째 계층
                switch (sigType.toLowerCase()) {
                    case "stsg" -> direction.setStsg(ds);
                    case "ltsg" -> direction.setLtsg(ds);
                    case "pdsg" -> direction.setPdsg(ds);
                    case "utsg" -> direction.setUtsg(ds);
                    case "bssg" -> direction.setBssg(ds);
                    case "bcsg" -> direction.setBcsg(ds);
                }
            }

            // 해당 방향에 신호 데이터가 하나라도 있으면 signals 맵에 저장
            if (hasData) signals.put(dir, direction);
        }

        //계층형으로 신호등 데이터 구조화 →
        // SignalDirection 객체에 방향별 신호 상태 저장 →
        // TrafficStatus 객체에 방향별 신호 정보 맵으로 저장
        status.setSignals(signals);
        return status;
    }

}
