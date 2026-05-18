package com.example.demo.service;

import com.example.demo.entity.TrafficStationEntity;
import com.example.demo.model.ForecastResult;
import com.example.demo.repository.TrafficStationRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@Service
@RequiredArgsConstructor
public class ForecastService {

    private final TrafficStationRepository trafficStationRepository;
    private final RestTemplate restTemplate = new RestTemplate();

    public List<TrafficStationEntity> findAllStations() {
        // DB(TRAFFIC_STATION 테이블)에서 모든 지점을 가져옴
        return trafficStationRepository.findAll();
    }

    public ForecastResult getForecast(String stationId) {
        try {
            // 1. Flask 서버에 보낼 데이터 준비 (교통량 지점 ID)
            Map<String, Object> request = new HashMap<>();
            request.put("Station_Number", stationId);

            String flaskUrl = "http://127.0.0.1:5000/predict_traffic";

            // 2. Flask 서버 호출
            Map<String, Object> response = restTemplate.postForObject(flaskUrl, request, Map.class);

            // 3. Flask 응답 확인
            if (response == null || Boolean.FALSE.equals(response.get("success"))) {
                System.err.println("Flask 예측 실패: " + stationId);
                return null;
            }

            // 4. 데이터 가공 (List -> int[])
            String stationName = (String) response.get("station_name");
            List<Map<String, Object>> forecastList = (List<Map<String, Object>>) response.get("forecast");

            int[] up = new int[24];
            int[] down = new int[24];

            for (int i = 0; i < 24; i++) {
                up[i] = ((Number) forecastList.get(i).get("direction_0")).intValue();
                down[i] = ((Number) forecastList.get(i).get("direction_1")).intValue();
            }

            // 5. 최종 결과 반환
            return new ForecastResult(stationId, stationName, up, down);

        } catch (Exception e) {
            System.err.println("Flask 통신 에러: " + e.getMessage());
            return null;
        }
    }
}