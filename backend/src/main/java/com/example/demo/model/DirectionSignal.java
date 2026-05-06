package com.example.demo.model;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class DirectionSignal {
    private String status;   // protected-Movement-Allowed | stop-And-Remain | protected-clearance 등
    private int rmndCs;      // 잔여시간 (데시초, /10 하면 초)
}
