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

@Slf4j
@Service
@RequiredArgsConstructor
public class ContextService {

    private static final DateTimeFormatter TOTDT_FMT = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");

    private final TrafficCacheService cacheService;
    private final TrafficContextProvider contextProvider;

    public TrafficContext buildContext(String crsrdId) {
        TrafficStatus signal = cacheService.getSignal(crsrdId);
        if (signal == null) {
            log.warn("캐시에 없는 교차로: {}", crsrdId);
            return null;
        }

        TrafficContext ctx = new TrafficContext();
        ctx.setCrsrdId(signal.getCrsrdId());
        ctx.setCrsrdNm(signal.getCrsrdNm());
        ctx.setSignals(signal.getSignals());
        ctx.setDelayMin(calcDelayMin(signal.getTotDt()));
        ctx.setWeather(contextProvider.getWeather(signal.getLat(), signal.getLon()));
        ctx.setSpeed(contextProvider.getSpeed(signal.getLat(), signal.getLon()));
        ctx.setRisk(contextProvider.getRisk(signal.getLat(), signal.getLon()));
        return ctx;
    }

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

    private long calcDelayMin(String totDt) {
        if (totDt == null || totDt.length() < 14) return -1;
        try {
            LocalDateTime dt = LocalDateTime.parse(totDt, TOTDT_FMT);
            ZonedDateTime totDtKst = dt.atZone(ZoneId.of("Asia/Seoul"));
            return java.time.Duration.between(totDtKst, ZonedDateTime.now(ZoneId.of("Asia/Seoul"))).toMinutes();
        } catch (Exception e) {
            return -1;
        }
    }
}
