package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "SIGNAL_PLAN")        // SIGNAL_PLAN 테이블과 매핑
@Getter @Setter @NoArgsConstructor
public class SignalPlanEntity {

    @EmbeddedId                      // PK가 3개(INT_NO + PLAN_NO + PLAN_IDX_NO)라서 묶음 클래스 사용
    private SignalPlanId id;         // id.intNo, id.planNo, id.planIdxNo 로 접근

    @Column(name = "INT_NM")
    private String intNm;            // 교차로 이름

    @Column(name = "REGION_CD")
    private String regionCd;         // 지역 코드

    @Column(name = "OPER_PLAN_HH")
    private String operPlanHh;       // 운영 시작 시각 (예: "08" → 8시부터 이 플랜 적용)

    @Column(name = "OPER_PLAN_MI")
    private String operPlanMi;       // 운영 시작 분 (예: "00" → 8시 00분부터)

    @Column(name = "CYCLE_VAL")
    private Integer cycleVal;        // 전체 사이클 길이(초) — 예: 140초마다 한 바퀴

    @Column(name = "OFFSET_VAL")
    private Integer offsetVal;       // 옵셋값 (인접 교차로 신호 연동용)

    // A링: 숫자! 현시코드 아님! 각 현시별 초록불 지속시간(초)
    // (예: aRing1=30 → 현시1번(남→북 직진)이 30초간 켜짐)
    // PHASE의 aRing1~8(문자열 방향코드)과 헷갈리지 말 것
    @Column(name = "A_RING_1") private Integer aRing1;
    @Column(name = "A_RING_2") private Integer aRing2;
    @Column(name = "A_RING_3") private Integer aRing3;
    @Column(name = "A_RING_4") private Integer aRing4;
    @Column(name = "A_RING_5") private Integer aRing5;
    @Column(name = "A_RING_6") private Integer aRing6;
    @Column(name = "A_RING_7") private Integer aRing7;
    @Column(name = "A_RING_8") private Integer aRing8;

    // B링: B링 각 현시별 지속시간(초)
    @Column(name = "B_RING_1") private Integer bRing1;
    @Column(name = "B_RING_2") private Integer bRing2;
    @Column(name = "B_RING_3") private Integer bRing3;
    @Column(name = "B_RING_4") private Integer bRing4;
    @Column(name = "B_RING_5") private Integer bRing5;
    @Column(name = "B_RING_6") private Integer bRing6;
    @Column(name = "B_RING_7") private Integer bRing7;
    @Column(name = "B_RING_8") private Integer bRing8;
}
