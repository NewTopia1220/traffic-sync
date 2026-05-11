package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.Setter;

@Entity
@Table(name = "CCTV3")
@Getter
@Setter
public class CctvEntity {

    @Id
    @Column(name = "CCTV_ID")
    private String cctvId;

    @Column(name = "CCTV_NM")
    private String cctvNm;

    @Column(name = "LAT")
    private Double lat;

    @Column(name = "LON")
    private Double lon;

    // UTIC getCctvInfoById API에서 얻는 내부 ID (iframe URL의 id= 파라미터)
    @Column(name = "STREAM_ID")
    private String streamId;

    // CCTV 채널 번호 (iframe URL의 cctvch= 파라미터)
    @Column(name = "CCTV_CH")
    private Integer cctvCh;
}
