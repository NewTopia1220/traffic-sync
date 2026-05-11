package com.example.demo.model;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class RiskInfo {
    private int grade; // 도로위험도등급 (1~5)
    private int value; // 도로위험도지수값
}
