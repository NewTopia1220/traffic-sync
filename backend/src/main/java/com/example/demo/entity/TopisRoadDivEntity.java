package com.example.demo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "TOPIS_ROAD_DIV")
@Getter
@Setter
@NoArgsConstructor
public class TopisRoadDivEntity {

    @Id
    @Column(name = "ROAD_DIV_CD")
    private String roadDivCd;

    @Column(name = "ROAD_DIV_NM")
    private String roadDivNm;

    @Column(name = "UPDATED_AT_MS")
    private Long updatedAtMs;
}
