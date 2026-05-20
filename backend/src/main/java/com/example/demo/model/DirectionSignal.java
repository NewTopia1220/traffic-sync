package com.example.demo.model;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class DirectionSignal {
    private String status; // protected-Movement-Allowed | stop-And-Remain | protected-clearance 등
    private int rmndCs;    // 잔여 시간. API 값은 보통 1/10초 단위로 들어온다.
}
