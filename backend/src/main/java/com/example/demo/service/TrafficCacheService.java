package com.example.demo.service;

import com.example.demo.model.CrossroadInfo;
import com.example.demo.model.TrafficStatus;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

// 교차로 정보 및 신호 데이터를 메모리에 캐싱 (PoC용, 추후 Redis로 교체)
@Service
public class TrafficCacheService {

    // 잠실 반경 내 교차로 목록 (좌표 포함)
    private volatile List<CrossroadInfo> crossroads = Collections.emptyList();

    // 교차로ID → 최신 신호 상태
    private final ConcurrentHashMap<String, TrafficStatus> signalCache = new ConcurrentHashMap<>();

    public void updateCrossroads(List<CrossroadInfo> list) {
        this.crossroads = list;
    }

    public List<CrossroadInfo> getCrossroads() {
        return crossroads;
    }

    public Optional<CrossroadInfo> getCrossroad(String crsrdId) {
        return crossroads.stream()
                .filter(crossroad -> Objects.equals(crossroad.getCrsrdId(), crsrdId))
                .findFirst();
    }

    public void updateSignal(String crsrdId, TrafficStatus status) {
        signalCache.put(crsrdId, status);
    }

    public void updateAllSignals(Map<String, TrafficStatus> statusMap) {
        signalCache.clear();
        signalCache.putAll(statusMap);
    }

    public TrafficStatus getSignal(String crsrdId) {
        return signalCache.get(crsrdId);
    }

    public Map<String, TrafficStatus> getAllSignals() {
        return Collections.unmodifiableMap(signalCache);
    }
}
