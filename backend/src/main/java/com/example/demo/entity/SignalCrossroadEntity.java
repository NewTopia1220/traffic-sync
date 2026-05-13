package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "SIGNAL_CROSSROAD")
@Getter @Setter @NoArgsConstructor
public class SignalCrossroadEntity {

    @Id
    @Column(name = "INT_NO")
    private String intNo;

    @Column(name = "INT_NM")
    private String intNm;

    @Column(name = "REGION_CD")
    private String regionCd;

    @Column(name = "X_COORD")
    private String xCoord;

    @Column(name = "Y_COORD")
    private String yCoord;

    @Column(name = "UPD_DTIME")
    private String updDtime;
}
