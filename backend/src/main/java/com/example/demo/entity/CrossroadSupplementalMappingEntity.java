package com.example.demo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "CROSSROAD_SUPPLEMENTAL_MAPPING")
@Getter
@Setter
@NoArgsConstructor
public class CrossroadSupplementalMappingEntity {

    @Id
    @Column(name = "CRSRD_ID")
    private String crsrdId;

    @Column(name = "GU_NAME")
    private String guName;

    @Column(name = "RISK_SOURCE_LINK_ID")
    private String riskSourceLinkId;

    @Column(name = "RISK_LINE_STRING", length = 4000)
    private String riskLineString;

    @Column(name = "RISK_DISTANCE_METERS")
    private Double riskDistanceMeters;

    @Column(name = "SPEED_LINK_ID")
    private String speedLinkId;

    @Column(name = "SPEED_DISTANCE_METERS")
    private Double speedDistanceMeters;

    @Column(name = "UPDATED_AT_MS")
    private Long updatedAtMs;
}
