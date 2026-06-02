package com.example.demo.controller;

import com.example.demo.entity.UserEntity;
import com.example.demo.model.context.WeatherSnapshot;
import com.example.demo.repository.UserRepository;
import com.example.demo.service.WeatherApiService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;

/**
 * 민원 시민 전용 인증 컨트롤러
 * - 회원가입 즉시 APPROVED (관리자 승인 불필요)
 * - role = CIVIL
 */
@Slf4j
@RestController
@RequestMapping("/api/civil/auth")
@RequiredArgsConstructor
public class CivilController {

    private final UserRepository userRepo;
    private final WeatherApiService weatherApiService;

    // 민원 로그인
    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@RequestBody Map<String, String> body) {
        String userId   = body.get("userId");
        String password = body.get("password");
        if (userId == null || password == null)
            return ResponseEntity.badRequest().build();

        Optional<UserEntity> opt = userRepo.findByUserIdAndPassword(userId, password);
        if (opt.isEmpty())
            return ResponseEntity.ok(Map.of("success", false, "message", "아이디 또는 비밀번호가 올바르지 않습니다."));

        UserEntity user = opt.get();
        if (!"CIVIL".equals(user.getRole()))
            return ResponseEntity.ok(Map.of("success", false, "message", "민원 계정이 아닙니다. 일반 로그인을 이용하세요."));

        return ResponseEntity.ok(Map.of(
            "success", true,
            "userId",  user.getUserId(),
            "name",    user.getName()
        ));
    }

    // 민원 회원가입 (즉시 APPROVED)
    @PostMapping("/register")
    public ResponseEntity<Map<String, Object>> register(@RequestBody Map<String, String> body) {
        String userId   = body.get("userId");
        String password = body.get("password");
        String name     = body.get("name");
        String phone    = body.get("phone");
        String email    = body.get("email");

        if (userId == null || password == null || name == null || phone == null || email == null)
            return ResponseEntity.ok(Map.of("success", false, "message", "모든 필드를 입력하세요."));

        if (userRepo.existsById(userId))
            return ResponseEntity.ok(Map.of("success", false, "message", "이미 사용 중인 아이디입니다."));

        UserEntity user = new UserEntity();
        user.setUserId(userId);
        user.setPassword(password);
        user.setName(name);
        user.setPhone(phone);
        user.setEmail(email);
        user.setRole("CIVIL");
        user.setStatus("APPROVED");   // 즉시 승인
        user.setAlertEmail(0);
        user.setIsTempPw(0);
        user.setCreatedAt(LocalDateTime.now());
        userRepo.save(user);

        return ResponseEntity.ok(Map.of("success", true, "message", "회원가입이 완료되었습니다."));
    }

    // 민원 브리핑용 날씨 조회 (KMA 초단기실황)
    @GetMapping("/weather")
    public ResponseEntity<Map<String, Object>> getWeather(
            @RequestParam double lat,
            @RequestParam double lng) {
        Map<String, Object> result = new HashMap<>();
        try {
            WeatherSnapshot snap = weatherApiService.fetchWeather(lat, lng);
            result.put("success", true);
            result.put("temperatureC", snap.getTemperatureC());
            result.put("humidityPercent", snap.getHumidityPercent());
            result.put("windSpeedMs", snap.getWindSpeedMs());
            result.put("description", deriveDescription(snap));
        } catch (Exception e) {
            log.warn("날씨 조회 실패: {}", e.getMessage());
            result.put("success", false);
            result.put("description", "정보 없음");
        }
        return ResponseEntity.ok(result);
    }

    private String deriveDescription(WeatherSnapshot snap) {
        Double mm = snap.getPrecipitationMm();
        if (mm == null || mm == 0.0) return "맑음";
        if (mm < 1.0) return "흐림";
        return "비";
    }
}
