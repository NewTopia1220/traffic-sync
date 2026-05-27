package com.example.demo.config;

import com.example.demo.entity.UserEntity;
import com.example.demo.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

// 서버 시작 시 관리자 계정이 없으면 자동 생성
@Component
@RequiredArgsConstructor
public class AdminInitializer implements ApplicationRunner {

    private final UserRepository userRepo;

    @Override
    public void run(ApplicationArguments args) {
        if (userRepo.existsById("admin")) return;

        UserEntity admin = new UserEntity();
        admin.setUserId("admin");
        admin.setPassword("admin1234");
        admin.setName("관리자");
        admin.setRole("ADMIN");
        admin.setStatus("APPROVED");
        admin.setAlertEmail(0);
        admin.setCreatedAt(LocalDateTime.now());
        admin.setIsTempPw(0);
        userRepo.save(admin);
    }
}
