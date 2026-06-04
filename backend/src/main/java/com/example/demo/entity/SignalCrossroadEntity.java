package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

@Entity                              // 이 클래스가 DB 테이블과 매핑되는 JPA 엔티티임을 선언
@Table(name = "SIGNAL_CROSSROAD")   // 매핑할 DB 테이블 이름
@Getter @Setter @NoArgsConstructor  // Lombok: getter/setter/기본생성자 자동 생성
public class SignalCrossroadEntity {

    @Id                             // PK가 1개짜리라서 @EmbeddedId 없이 그냥 @Id 사용
    @Column(name = "INT_NO")        // DB 컬럼명 INT_NO와 매핑
    private String intNo;           // 교차로 번호 (예: "3253")

    @Column(name = "INT_NM")
    private String intNm;           // 교차로 이름 (예: "사당삼성생명")

    @Column(name = "REGION_CD")
    private String regionCd;        // 지역 코드

    @Column(name = "X_COORD")
    private String xCoord;          // 경도 (예: "1269876543" → /1e7 → 126.98...)

    @Column(name = "Y_COORD")
    private String yCoord;          // 위도 (예: "374567890" → /1e7 → 37.45...)

    @Column(name = "UPD_DTIME")
    private String updDtime;        // 데이터 갱신 일시

    @Override
    public String toString() {
        return "SignalCrossroadEntity{" +
                "intNo='" + intNo + '\'' +
                ", intNm='" + intNm + '\'' +
                ", regionCd='" + regionCd + '\'' +
                ", xCoord='" + xCoord + '\'' +
                ", yCoord='" + yCoord + '\'' +
                ", updDtime='" + updDtime + '\'' +
                '}';
    }
}
