package com.example.demo.service;

import com.example.demo.entity.UserEntity;
import com.example.demo.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class UserService {

    private final UserRepository userRepo;

    // 로그인 — 아이디/비번 확인 후 상태 체크
    public Map<String, Object> login(String userId, String password) {
        Optional<UserEntity> opt = userRepo.findByUserIdAndPassword(userId, password);
        if (opt.isEmpty()) return Map.of("success", false, "message", "아이디 또는 비밀번호가 올바르지 않습니다.");

        UserEntity user = opt.get();
        if ("PENDING".equals(user.getStatus()))
            return Map.of("success", false, "message", "관리자 승인 대기 중입니다.");
        if ("REJECTED".equals(user.getStatus()))
            return Map.of("success", false, "message", "가입이 거절되었습니다. 관리자에게 문의하세요.");

        return Map.of(
            "success",  true,
            "userId",   user.getUserId(),
            "name",     user.getName(),
            "role",     user.getRole(),
            "isTempPw", user.getIsTempPw()
        );
    }

    // 회원가입
    public Map<String, Object> register(UserEntity req) {
        if (userRepo.existsById(req.getUserId()))
            return Map.of("success", false, "message", "이미 사용 중인 아이디입니다.");

        req.setRole("USER");
        req.setStatus("PENDING");
        req.setCreatedAt(LocalDateTime.now());
        req.setIsTempPw(0);
        userRepo.save(req);
        return Map.of("success", true, "message", "가입 신청이 완료되었습니다. 관리자 승인 후 로그인 가능합니다.");
    }

    // 아이디 찾기 — 이름 + 전화번호
    public Map<String, Object> findId(String name, String phone) {
        Optional<UserEntity> opt = userRepo.findByNameAndPhone(name, phone);
        if (opt.isEmpty()) return Map.of("success", false, "message", "일치하는 회원 정보가 없습니다.");

        String id = opt.get().getUserId();
        // 뒤 3자리 마스킹: parkjs → par***
        String masked = id.length() <= 3 ? "***" : id.substring(0, id.length() - 3) + "***";
        return Map.of("success", true, "userId", masked, "createdAt", opt.get().getCreatedAt().toString().substring(0, 10));
    }

    // 비밀번호 찾기 — 임시 비밀번호 발급 후 반환 (메일 발송은 Controller에서)
    public Map<String, Object> findPw(String userId, String email) {
        Optional<UserEntity> opt = userRepo.findByUserIdAndEmail(userId, email);
        if (opt.isEmpty()) return Map.of("success", false, "message", "아이디 또는 이메일이 올바르지 않습니다.");

        String tempPw = UUID.randomUUID().toString().replace("-", "").substring(0, 8);
        UserEntity user = opt.get();
        user.setPassword(tempPw);
        user.setIsTempPw(1);
        userRepo.save(user);
        return Map.of("success", true, "tempPw", tempPw, "email", email, "name", user.getName());
    }

    // 관리자: 전체 유저 목록
    public List<UserEntity> getAllUsers() {
        return userRepo.findAll();
    }

    // 관리자: 승인
    public Map<String, Object> approve(String userId) {
        return userRepo.findById(userId).map(u -> {
            u.setStatus("APPROVED");
            userRepo.save(u);
            return Map.<String, Object>of("success", true);
        }).orElse(Map.of("success", false, "message", "유저 없음"));
    }

    // 관리자: 거절
    public Map<String, Object> reject(String userId) {
        return userRepo.findById(userId).map(u -> {
            u.setStatus("REJECTED");
            userRepo.save(u);
            return Map.<String, Object>of("success", true);
        }).orElse(Map.of("success", false, "message", "유저 없음"));
    }

    // 알림 수신 토글
    public Map<String, Object> updateAlert(String userId, Integer alertEmail) {
        return userRepo.findById(userId).map(u -> {
            u.setAlertEmail(alertEmail);
            userRepo.save(u);
            return Map.<String, Object>of("success", true);
        }).orElse(Map.of("success", false, "message", "유저 없음"));
    }

    // 비밀번호 변경
    public Map<String, Object> changePassword(String userId, String currentPassword, String newPassword) {
        Optional<UserEntity> opt = userRepo.findByUserIdAndPassword(userId, currentPassword);
        if (opt.isEmpty()) return Map.of("success", false, "message", "현재 비밀번호가 올바르지 않습니다.");
        UserEntity user = opt.get();
        user.setPassword(newPassword);
        user.setIsTempPw(0);
        userRepo.save(user);
        return Map.of("success", true, "message", "비밀번호가 변경되었습니다.");
    }

    // 메일 알림 수신 동의한 APPROVED 유저 이메일 목록 (병목 알림 발송용)
    public List<String> getAlertEmails() {
        return userRepo.findByAlertEmailAndStatus(1, "APPROVED")
            .stream()
            .map(UserEntity::getEmail)
            .filter(e -> e != null && !e.isBlank())
            .toList();
    }
}
