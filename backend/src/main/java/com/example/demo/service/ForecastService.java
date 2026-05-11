package com.example.demo.service;

import com.example.demo.entity.CrossroadEntity;
import com.example.demo.model.ForecastResult;
import com.example.demo.repository.CrossroadRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.HashMap;
import java.util.List;
import java.util.Map;


@Service
@RequiredArgsConstructor
public class ForecastService {

    private final CrossroadRepository crossroadRepository;
    private RestTemplate restTemplate = new RestTemplate(); // Flask와 통신용

    // ForecastService.java의 getForecast 메소드 내부 수정 버전
    public ForecastResult getForecast(String crsrdId) {
        CrossroadEntity entity = crossroadRepository.findById(crsrdId).orElse(null);
        if (entity == null) return null;

        try {
            Map<String, Object> request = new HashMap<>();
            request.put("Station_Number", crsrdId);

            String flaskUrl = "http://localhost:5000/predict_traffic";

            // Flask 호출
            Map<String, Object> response = restTemplate.postForObject(flaskUrl, request, Map.class);

            // ★ 추가: 파이썬이 "success: False"를 보냈을 경우 처리
            if (response == null || Boolean.FALSE.equals(response.get("success"))) {
                System.err.println("Flask에서 예측 실패 응답을 보냄: " + crsrdId);
                return null;
            }

            List<Map<String, Object>> forecast = (List<Map<String, Object>>) response.get("forecast");
            int[] up = new int[24];
            int[] down = new int[24];

            for (int i = 0; i < 24; i++) {
                // Number로 캐스팅하여 정수형으로 안전하게 변환
                up[i] = ((Number) forecast.get(i).get("direction_0")).intValue();
                down[i] = ((Number) forecast.get(i).get("direction_1")).intValue();
            }

            return new ForecastResult(crsrdId, entity.getCrsrdNm(), up, down);

        } catch (Exception e) {
            System.err.println("Flask 연결 에러: " + e.getMessage());
            return null;
        }
    }
}