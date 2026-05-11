package com.example.demo.model;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class ForecastResult {
    private String crsrdId;   // 교차로 ID (Station_Number)
    private String crsrdNm;   // 교차로 이름
    private int[] up;         // direction_0 데이터들
    private int[] down;       // direction_1 데이터들
}