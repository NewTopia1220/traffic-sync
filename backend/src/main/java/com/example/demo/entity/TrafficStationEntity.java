package com.example.demo.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import lombok.Getter;
import lombok.NoArgsConstructor;

@Entity
@Table(name = "TRAFFIC_STATION") // DB 테이블 이름과 똑같이
@Getter
@NoArgsConstructor
public class TrafficStationEntity {

    @Id
    @Column(name = "STATION_ID")
    private Long stationId;

    @Column(name = "STATION_NAME")
    private String stationName;

    @Column(name = "LATITUDE", columnDefinition = "NUMBER")
    private Double latitude;

    @Column(name = "LONGITUDE", columnDefinition = "NUMBER")
    private Double longitude;
}
