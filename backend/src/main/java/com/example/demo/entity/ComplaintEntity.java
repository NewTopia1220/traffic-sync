package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "COMPLAINTS")
@Getter @Setter @NoArgsConstructor
public class ComplaintEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.SEQUENCE, generator = "complaint_seq_gen")
    @SequenceGenerator(name = "complaint_seq_gen", sequenceName = "COMPLAINT_SEQ", allocationSize = 1)
    @Column(name = "ID")
    private Long id;

    @Column(name = "USER_ID", length = 50)
    private String userId;

    @Column(name = "USER_NAME", length = 50)
    private String userName;

    @Column(name = "TITLE", length = 200)
    private String title;

    @Column(name = "CATEGORY", length = 100)
    private String category;

    @Column(name = "CONTENT", length = 2000)
    private String content;

    @Column(name = "LAT")
    private Double lat;

    @Column(name = "LNG")
    private Double lng;

    @Column(name = "ADDRESS", length = 300)
    private String address;

    // 주소에서 추출한 구 이름 (예: 서초구, 강남구)
    @Column(name = "GU_NAME", length = 30)
    private String guName;

    // 사진 URL 목록을 쉼표로 구분해 저장
    @Column(name = "PHOTO_URLS", length = 1000)
    private String photoUrls;

    // 접수 | 처리중 | 완료
    @Column(name = "STATUS", length = 20)
    private String status = "접수";

    @Column(name = "CREATED_AT")
    private LocalDateTime createdAt = LocalDateTime.now();
}
