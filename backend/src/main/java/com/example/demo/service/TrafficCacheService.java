package com.example.demo.service;

import com.example.demo.model.CrossroadInfo;
import com.example.demo.model.TrafficStatus;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

// 교차로 정보 및 신호 데이터를 메모리에 캐싱 (PoC용, 추후 Redis로 교체)
@Service
public class TrafficCacheService {

    // 현재 모니터링 중심 좌표 (구 클릭 시 업데이트)
    private volatile double centerLat;
    private volatile double centerLon;
    private volatile double centerRadius = 1.0;

    public void setCenter(double lat, double lon, double radius) {
        this.centerLat = lat;
        this.centerLon = lon;
        this.centerRadius = radius;
    }

    public double getCenterLat() { return centerLat; }
    public double getCenterLon() { return centerLon; }
    public double getCenterRadius() { return centerRadius; }

    // 교차로ID → 최신 신호 상태
    private final ConcurrentHashMap<String, TrafficStatus> signalCache = new ConcurrentHashMap<>();



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
