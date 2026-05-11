package com.example.demo.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class WeatherInfo {
    private String condition; // 맑음, 흐림, 비, 눈
    private int temp;         // 기온 (°C)
    private int hour;         // 현재 시각
}
