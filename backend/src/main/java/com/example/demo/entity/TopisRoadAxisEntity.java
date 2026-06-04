package com.example.demo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "TOPIS_ROAD_AXIS")
@Getter
@Setter
@NoArgsConstructor
public class TopisRoadAxisEntity {

    @Id
    @Column(name = "AXIS_CD")
    private String axisCd;

    @Column(name = "ROAD_DIV_CD")
    private String roadDivCd;

    @Column(name = "AXIS_NAME")
    private String axisName;

    @Column(name = "UPDATED_AT_MS")
    private Long updatedAtMs;
}
