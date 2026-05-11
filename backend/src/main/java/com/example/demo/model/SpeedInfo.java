package com.example.demo.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class SpeedInfo {
    private int current; // 현재 구간속도 (km/h)
    private int normal;  // 평시 속도 (km/h)
}
