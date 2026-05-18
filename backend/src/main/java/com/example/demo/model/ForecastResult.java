package com.example.demo.model;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ForecastResult {
    private String stationId;   // 교통량 지점 ID
    private String stationNm;   // 교통량 지점 이름
    private int[] up;           // 상행 예측 데이터 (24개)
    private int[] down;         // 하행 예측 데이터 (24개)
}