package com.example.demo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity
@Table(name = "TOPIS_AXIS_LINK")
@Getter
@Setter
@NoArgsConstructor
public class TopisAxisLinkEntity {

    @Id
    @Column(name = "LINK_ID")
    private String linkId;

    @Column(name = "AXIS_CD")
    private String axisCd;

    @Column(name = "AXIS_DIR")
    private String axisDir;

    @Column(name = "LINK_SEQ")
    private Integer linkSeq;

    @Column(name = "UPDATED_AT_MS")
    private Long updatedAtMs;
}
