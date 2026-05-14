package com.example.demo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;
import lombok.EqualsAndHashCode;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.io.Serializable;

@Embeddable                          // "나는 PK 묶음 클래스야" — SignalPhaseEntity에서 @EmbeddedId로 사용됨
@Getter @Setter @NoArgsConstructor
@EqualsAndHashCode                   // JPA가 엔티티 동일성 비교 시 equals() 사용 → 자동 생성
public class SignalPhaseId implements Serializable { // JPA 복합PK는 반드시 Serializable 구현 필요

    @Column(name = "INT_NO")
    private String intNo;            // 교차로 번호 — PK 첫 번째 컬럼

    @Column(name = "MAP_NO")
    private String mapNo;            // 맵 번호 (보통 "0") — PK 두 번째 컬럼
    // INT_NO + MAP_NO 두 개를 합쳐야 SIGNAL_PHASE 행 하나를 유일하게 특정 가능
}
