package com.example.demo.model;

import lombok.Data;

// 한 방향에서 받을 수 있는 신호 종류별 상태.
@Data
public class SignalDirection {
    private DirectionSignal stsg; // 직진
    private DirectionSignal ltsg; // 좌회전
    private DirectionSignal pdsg; // 보행
    private DirectionSignal utsg; // 유턴
    private DirectionSignal bssg; // 버스
    private DirectionSignal bcsg; // 자전거
}
