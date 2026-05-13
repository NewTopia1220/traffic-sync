package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "SIGNAL_PLAN")
@Getter @Setter @NoArgsConstructor
public class SignalPlanEntity {

    @EmbeddedId
    private SignalPlanId id;

    @Column(name = "INT_NM")
    private String intNm;

    @Column(name = "REGION_CD")
    private String regionCd;

    @Column(name = "OPER_PLAN_HH")
    private String operPlanHh;

    @Column(name = "OPER_PLAN_MI")
    private String operPlanMi;

    @Column(name = "CYCLE_VAL")
    private Integer cycleVal;

    @Column(name = "OFFSET_VAL")
    private Integer offsetVal;

    @Column(name = "A_RING_1") private Integer aRing1;
    @Column(name = "A_RING_2") private Integer aRing2;
    @Column(name = "A_RING_3") private Integer aRing3;
    @Column(name = "A_RING_4") private Integer aRing4;
    @Column(name = "A_RING_5") private Integer aRing5;
    @Column(name = "A_RING_6") private Integer aRing6;
    @Column(name = "A_RING_7") private Integer aRing7;
    @Column(name = "A_RING_8") private Integer aRing8;

    @Column(name = "B_RING_1") private Integer bRing1;
    @Column(name = "B_RING_2") private Integer bRing2;
    @Column(name = "B_RING_3") private Integer bRing3;
    @Column(name = "B_RING_4") private Integer bRing4;
    @Column(name = "B_RING_5") private Integer bRing5;
    @Column(name = "B_RING_6") private Integer bRing6;
    @Column(name = "B_RING_7") private Integer bRing7;
    @Column(name = "B_RING_8") private Integer bRing8;
}
