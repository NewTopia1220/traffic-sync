package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "SIGNAL_PHASE")
@Getter @Setter @NoArgsConstructor
public class SignalPhaseEntity {

    @EmbeddedId
    private SignalPhaseId id;

    @Column(name = "INT_NM")
    private String intNm;

    @Column(name = "REGION_CD")
    private String regionCd;

    @Column(name = "A_RING_1") private String aRing1;
    @Column(name = "A_RING_2") private String aRing2;
    @Column(name = "A_RING_3") private String aRing3;
    @Column(name = "A_RING_4") private String aRing4;
    @Column(name = "A_RING_5") private String aRing5;
    @Column(name = "A_RING_6") private String aRing6;
    @Column(name = "A_RING_7") private String aRing7;
    @Column(name = "A_RING_8") private String aRing8;

    @Column(name = "B_RING_1") private String bRing1;
    @Column(name = "B_RING_2") private String bRing2;
    @Column(name = "B_RING_3") private String bRing3;
    @Column(name = "B_RING_4") private String bRing4;
    @Column(name = "B_RING_5") private String bRing5;
    @Column(name = "B_RING_6") private String bRing6;
    @Column(name = "B_RING_7") private String bRing7;
    @Column(name = "B_RING_8") private String bRing8;
}
