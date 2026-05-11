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
// - 교차로ID → 교차로 정보
public class TrafficCacheService {

    // 현재 모니터링 중심 좌표 (구 클릭 시 업데이트)
    private volatile double centerLat;
    private volatile double centerLon;
    private volatile double centerRadius = 1.0;

    // 교차로ID → 교차로 정보
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

    // 업데이트 메서드 (API 호출 후 교차로ID별로 신호 상태 업데이트) -->구 클릭했을때
    public void updateSignal(String crsrdId, TrafficStatus status) {
        signalCache.put(crsrdId, status);
    }

    // 전체 업데이트 메서드 (API 호출 후 전체 교차로ID → 신호 상태 맵으로 업데이트)-->구 클릭했을때  그 구만 스케줄러 5초마다
    public void updateAllSignals(Map<String, TrafficStatus> statusMap) {
        // 기존 캐시 전체 삭제 후 새 데이터로 교체 (원자적 업데이트)
        signalCache.clear();
        // 새 데이터로 캐시 채우기
        signalCache.putAll(statusMap);
    }

    // 조회 메서드 (교차로ID로 신호 상태 조회, 캐시에 없으면 null 반환) --> 챗봇이 답변 생성할 때 그 교차로ID에 해당하는 신호 상태 가져올 때
    public TrafficStatus getSignal(String crsrdId) {
        return signalCache.get(crsrdId);
    }

    // 전체 조회 메서드 (전체 교차로ID → 신호 상태 맵 반환, 수정 불가능한 형태로 반환)
    //dead Code - 현재는 사용되지 않지만, 추후 전체 신호 상태를 한 번에 조회할 필요가 있을 때 활용 가능
    public Map<String, TrafficStatus> getAllSignals() {
        return Collections.unmodifiableMap(signalCache);
    }
}
