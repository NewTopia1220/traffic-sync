package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "CROSSROAD")
@Getter @Setter @NoArgsConstructor
public class CrossroadEntity {

    @Id
    @Column(name = "CRSRD_ID")
    private String crsrdId;

    @Column(name = "CRSRD_NM")
    private String crsrdNm;

    @Column(name = "LAT")
    private Double lat;

    @Column(name = "LON")
    private Double lon;
}
