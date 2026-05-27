package com.example.demo.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.LocalDateTime;

@Entity
@Table(name = "USERS")
@Getter @Setter @NoArgsConstructor
public class UserEntity {

    @Id
    @Column(name = "USER_ID", length = 50)
    private String userId;

    @Column(name = "PASSWORD", length = 100)
    private String password;

    @Column(name = "NAME", length = 50)
    private String name;

    @Column(name = "PHONE", length = 20)
    private String phone;

    @Column(name = "EMAIL", length = 100)
    private String email;

    // 1 = 알림 수신, 0 = 미수신
    @Column(name = "ALERT_EMAIL")
    private Integer alertEmail = 0;

    // USER | ADMIN
    @Column(name = "ROLE", length = 10)
    private String role = "USER";

    // PENDING | APPROVED | REJECTED
    @Column(name = "STATUS", length = 10)
    private String status = "PENDING";

    @Column(name = "CREATED_AT")
    private LocalDateTime createdAt = LocalDateTime.now();

    // 임시 비밀번호 발송 여부
    @Column(name = "IS_TEMP_PW")
    private Integer isTempPw = 0;
}
