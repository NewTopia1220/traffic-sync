package com.example.demo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.EmbeddedId;
import jakarta.persistence.Entity;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "TOPIS_LINK_VERTEX")
@Getter
@Setter
@NoArgsConstructor
public class TopisLinkVertexEntity {

    @EmbeddedId
    private TopisLinkVertexId id;

    @Column(name = "GRS80TM_X")
    private Double grs80tmX;

    @Column(name = "GRS80TM_Y")
    private Double grs80tmY;

    @Column(name = "LAT")
    private Double lat;

    @Column(name = "LON")
    private Double lon;

    @Column(name = "UPDATED_AT_MS")
    private Long updatedAtMs;
}
