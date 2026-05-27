package com.example.demo.repository;

import com.example.demo.entity.UserEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;

public interface UserRepository extends JpaRepository<UserEntity, String> {

    Optional<UserEntity> findByUserIdAndPassword(String userId, String password);

    Optional<UserEntity> findByNameAndPhone(String name, String phone);

    Optional<UserEntity> findByUserIdAndEmail(String userId, String email);

    // 메일 알림 수신 동의한 유저 목록 (병목 알림 발송용)
    List<UserEntity> findByAlertEmailAndStatus(Integer alertEmail, String status);
}
