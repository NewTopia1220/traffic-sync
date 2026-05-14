package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "SIGNAL_PHASE")       // SIGNAL_PHASE 테이블과 매핑
@Getter @Setter @NoArgsConstructor
public class SignalPhaseEntity {

    @EmbeddedId                      // PK가 2개(INT_NO + MAP_NO)라서 묶음 클래스 사용
    private SignalPhaseId id;        // id.intNo, id.mapNo 로 접근

    @Column(name = "INT_NM")
    private String intNm;            // 교차로 이름

    @Column(name = "REGION_CD")
    private String regionCd;         // 지역 코드

    // A링: 현시코드 문자열 — 방향 정보 (예: "S183003" → 남→북 직진)
    // 형식: [S/L/P][출발방위각 3자리][도착방위각 3자리]
    @Column(name = "A_RING_1") private String aRing1;
    @Column(name = "A_RING_2") private String aRing2;
    @Column(name = "A_RING_3") private String aRing3;
    @Column(name = "A_RING_4") private String aRing4;
    @Column(name = "A_RING_5") private String aRing5;
    @Column(name = "A_RING_6") private String aRing6;
    @Column(name = "A_RING_7") private String aRing7;
    @Column(name = "A_RING_8") private String aRing8;

    // B링: A링과 같은 인덱스끼리 쌍 — 동시에 켜지는 반대 방향
    // (예: aRing1="S183003"(남→북) ↔ bRing1="S003183"(북→남) → 현시1번에 함께 green)
    @Column(name = "B_RING_1") private String bRing1;
    @Column(name = "B_RING_2") private String bRing2;
    @Column(name = "B_RING_3") private String bRing3;
    @Column(name = "B_RING_4") private String bRing4;
    @Column(name = "B_RING_5") private String bRing5;
    @Column(name = "B_RING_6") private String bRing6;
    @Column(name = "B_RING_7") private String bRing7;
    @Column(name = "B_RING_8") private String bRing8;
}
