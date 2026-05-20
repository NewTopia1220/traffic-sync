package com.example.demo.service;

import com.example.demo.model.TrafficContext;
import com.example.demo.model.TrafficStatus;
import com.example.demo.service.provider.TrafficContextProvider;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Collections;

//서버 콘솔에 로그 남기는 용도 - 실제 API 연동 전 더미데이터 반환
@Slf4j
//서비스~~
@Service
//Lombok이 생성자 자동으로 만들어줌 - final 필드에 대한 생성자 생성
@RequiredArgsConstructor
public class ContextService {

    // totDt는 "yyyyMMddHHmmss" 형식의 문자열로 제공된함
    private static final DateTimeFormatter TOTDT_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
    // 교차로 신호 상태 캐시 서비스
    private final TrafficCacheService cacheService;
    // 날씨, 속도, 위험도 등 추가 정보 제공자
    private final TrafficContextProvider contextProvider;

    // 교차로ID에 해당하는 트래픽 컨텍스트 생성
    // 신호등 데이터는 캐시에서 가져오고, 날씨/속도/위험도는 contextProvider에서 가져옴
    // totDt를 이용해 신호 데이터의 지연 시간을 계산하여 delayMin에 설정
    // 캐시에 해당 교차로 데이터가 없으면 null 반환
    // 실제 API 연동 전에는 StubTrafficContextProvider가 랜덤 더미데이터 반환
    // 빌드된 트래픽 컨텍스트는 ChatService에서 OpenAI API 호출 시 프롬프트에 포함되어 답변 생성에 활용됨
    // 예시: buildContext("CRSRD001") → TrafficContext { crsrdId: "CRSRD001", crsrdNm: "잠실역 사거리", delayMin: 5, signals: {...}, weather: {...}, speed: {...}, risk: {...} }

    public TrafficContext buildContext(String crsrdId) {
        if (crsrdId == null) return null;
        TrafficStatus signal = cacheService.getSignal(crsrdId);
        if (signal == null) {
            log.warn("캐시에 없는 교차로: {}", crsrdId);
            return null;
        }
        // 캐시에서 가져온 신호 데이터와 contextProvider에서 가져온 날씨/속도/위험도 정보를 조합하여 트래픽 컨텍스트 생성
        System.out.println("캐시에서 가져온 신호 데이터: " + signal);
        TrafficContext ctx = new TrafficContext();
        // 캐시에서 가져온 신호 데이터로 교차로 ID, 이름, 신호 상태 설정
        ctx.setCrsrdId(signal.getCrsrdId());
        ctx.setCrsrdNm(signal.getCrsrdNm());
        ctx.setSignals(signal.getSignals());
        // totDt를 이용해 신호 데이터의 지연 시간을 계산하여 delayMin에 설정
        ctx.setDelayMin(calcDelayMin(signal.getTotDt()));

        // contextProvider에서 가져온 날씨/속도/위험도 정보를 트래픽 컨텍스트에 설정 -> 실제 API 연동 전에는 StubTrafficContextProvider가 랜덤 더미데이터 반환
        //핵심
        //TrafficContext {
        //    crsrdId: "1100000001"
        //    crsrdNm: "잠실역사거리"
        //    delayMin: 2
        //    weather: WeatherInfo {          ← 계층
        //        condition: "비"
        //        temperature: 19
        //        hour: 14
        //    }
        //    speed: SpeedInfo {              ← 계층
        //        north: 18
        //        south: 22
        //        east: 15
        //        west: 25
        //        avg: 20.5
        //        min: 15
        //        max: 25
        //    }
        //    risk: RiskInfo {                ← 계층
        //        score: 87
        //    }
        //    signals: {                      ← 계층
        //        "nt": SignalDirection {
        //            stsg: DirectionSignal { status: "녹색", rmndCs: 150 }
        //        }
        //    }
        //}
        // --> 이런식으로 트래픽 컨텍스트가 완성됨 -> ChatService에서 OpenAI API 호출 시 프롬프트에 포함되어 답변 생성에 활용됨
        ctx.setWeather(contextProvider.getWeather(signal.getLat(), signal.getLon()));
        ctx.setSpeed(contextProvider.getSpeed(signal.getLat(), signal.getLon()));
        ctx.setRisk(contextProvider.getRisk(signal.getLat(), signal.getLon()));
        return ctx;
    }
    //교차로가 없을때 사용 --> 프론트에서 질문은 했는데 해당 교차로 데이터가 캐시에 없을 때, 트래픽 컨텍스트가 null이 되면 ChatService에서 buildDefaultContext()로 기본 트래픽 컨텍스트를 만들어서 답변 생성에 활용
    public TrafficContext buildDefaultContext() {
        TrafficContext ctx = new TrafficContext();
        ctx.setCrsrdId("DEFAULT");
        ctx.setCrsrdNm("잠실역 일대");
        ctx.setDelayMin(0);
        ctx.setSignals(Collections.emptyMap());
        ctx.setWeather(contextProvider.getWeather(37.5133, 127.1002));
        ctx.setSpeed(contextProvider.getSpeed(37.5133, 127.1002));
        ctx.setRisk(contextProvider.getRisk(37.5133, 127.1002));
        return ctx;
    }

    // totDt 문자열을 파싱하여 현재 시간과의 차이를 분 단위로 계산
    private long calcDelayMin(String totDt) {
        if (totDt == null || totDt.length() < 14) return -1;
        try {
            // totDt는 "yyyyMMddHHmmss" 형식의 문자열로 제공된다고 가정
            //"20250510143022" 문자열을 LocalDateTime 객체로 변환:
            //"20250510143022" → 2025년 5월 10일 14시 30분 22초
            LocalDateTime dt = LocalDateTime.parse(totDt, TOTDT_FMT);
            // LocalDateTime 객체를 KST 시간대의 ZonedDateTime으로 변환
            //LocalDateTime dt = 2025-05-10 14:30:22
            //                   (시간대 정보 없음)
            //        ↓
            //dt.atZone(ZoneId.of("Asia/Seoul"))
            //        ↓
            //ZonedDateTime = 2025-05-10 14:30:22 Asia/Seoul
            //                (한국 시간대 붙음)
            ZonedDateTime totDtKst = dt.atZone(ZoneId.of("Asia/Seoul"));

            // 현재 시간과 totDtKst의 차이를 분 단위로 계산하여 반환
            return java.time.Duration.between(totDtKst, ZonedDateTime.now(ZoneId.of("Asia/Seoul"))).toMinutes();
        } catch (Exception e) {
            return -1;
        }
    }
}
