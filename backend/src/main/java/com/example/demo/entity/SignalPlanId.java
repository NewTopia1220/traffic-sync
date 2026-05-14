package com.example.demo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;

@Embeddable                          // "나는 PK 묶음 클래스야" — SignalPlanEntity에서 @EmbeddedId로 사용됨
@Getter @Setter @NoArgsConstructor
@EqualsAndHashCode                   // JPA 엔티티 동일성 비교용 equals() 자동 생성
public class SignalPlanId implements Serializable {

    @Column(name = "INT_NO")
    private String intNo;            // 교차로 번호 — PK 첫 번째 컬럼

    @Column(name = "PLAN_NO")
    private String planNo;           // 플랜 번호 (시간대별로 다른 플랜) — PK 두 번째 컬럼

    @Column(name = "PLAN_IDX_NO")
    private String planIdxNo;        // 현시 순서 번호 (1,2,3...) — PK 세 번째 컬럼
    // INT_NO + PLAN_NO + PLAN_IDX_NO 세 개를 합쳐야 SIGNAL_PLAN 행 하나를 유일하게 특정 가능
}
