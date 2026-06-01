package com.example.demo.service;

import com.example.demo.entity.ComplaintEntity;
import com.example.demo.repository.ComplaintRepository;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.File;
import java.io.IOException;
import java.time.LocalDateTime;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ComplaintService {

    private final ComplaintRepository complaintRepo;

    @Value("${complaint.upload.dir:uploads/complaints}")
    private String uploadDir;

    // 서버 시작 시 guName 없는 기존 레코드 자동 삭제
    @PostConstruct
    public void cleanLegacyData() {
        int deleted = complaintRepo.deleteByGuNameIsNull();
        if (deleted > 0) log.info("[민원] 구 정보 없는 기존 레코드 {}건 삭제", deleted);
    }

    // 전체 조회 (민원 관리 페이지용)
    public List<Map<String, Object>> getAll() {
        return complaintRepo.findAllByOrderByCreatedAtDesc()
            .stream().map(this::toMap).collect(Collectors.toList());
    }

    // 구별 조회 (지도 폴링용)
    public List<Map<String, Object>> getByGu(String guName) {
        List<ComplaintEntity> list = (guName == null || guName.isBlank())
            ? complaintRepo.findAllByOrderByCreatedAtDesc()
            : complaintRepo.findByGuNameOrderByCreatedAtDesc(guName);
        return list.stream().map(this::toMap).collect(Collectors.toList());
    }

    public Map<String, Object> create(
            String userId, String userName,
            String title, String category, String content,
            Double lat, Double lng, String address,
            List<MultipartFile> photos) {

        List<String> savedUrls = new ArrayList<>();
        if (photos != null) {
            for (MultipartFile photo : photos) {
                if (photo.isEmpty()) continue;
                try { savedUrls.add(savePhoto(photo)); }
                catch (IOException e) { log.warn("[민원] 사진 저장 실패: {}", e.getMessage()); }
            }
        }

        ComplaintEntity c = new ComplaintEntity();
        c.setUserId(userId);
        c.setUserName(userName);
        c.setTitle(title);
        c.setCategory(category);
        c.setContent(content);
        c.setLat(lat);
        c.setLng(lng);
        c.setAddress(address);
        c.setGuName(extractGuName(address));   // 주소에서 구 자동 추출
        c.setPhotoUrls(savedUrls.isEmpty() ? null : String.join(",", savedUrls));
        c.setStatus("접수");
        c.setCreatedAt(LocalDateTime.now());

        complaintRepo.save(c);
        return Map.of("success", true, "id", c.getId(),
                      "guName", c.getGuName() != null ? c.getGuName() : "",
                      "message", "민원이 접수되었습니다.");
    }

    public Map<String, Object> updateStatus(Long id, String status) {
        return complaintRepo.findById(id).map(c -> {
            c.setStatus(status);
            complaintRepo.save(c);
            return Map.<String, Object>of("success", true);
        }).orElse(Map.of("success", false, "message", "민원을 찾을 수 없습니다."));
    }

    // ── 내부 유틸 ────────────────────────────────────────────────────────────────

    // "서울 서초구 서초동 370-6" → "서초구"
    private static final Pattern GU_PATTERN = Pattern.compile("([가-힣]+구)");

    private String extractGuName(String address) {
        if (address == null || address.isBlank()) return null;
        Matcher m = GU_PATTERN.matcher(address);
        return m.find() ? m.group(1) : null;
    }

    private String savePhoto(MultipartFile file) throws IOException {
        File dir = new File(uploadDir);
        if (!dir.exists()) dir.mkdirs();
        String ext = Optional.ofNullable(file.getOriginalFilename())
            .filter(n -> n.contains("."))
            .map(n -> n.substring(n.lastIndexOf(".")))
            .orElse(".jpg");
        String fileName = UUID.randomUUID() + ext;
        file.transferTo(new File(dir, fileName));
        return "/uploads/complaints/" + fileName;
    }

    private Map<String, Object> toMap(ComplaintEntity c) {
        List<String> photoList = (c.getPhotoUrls() == null || c.getPhotoUrls().isBlank())
            ? List.of() : Arrays.asList(c.getPhotoUrls().split(","));
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("id",        c.getId());
        m.put("userId",    c.getUserId());
        m.put("userName",  c.getUserName());
        m.put("title",     c.getTitle());
        m.put("category",  c.getCategory());
        m.put("content",   c.getContent());
        m.put("lat",       c.getLat());
        m.put("lng",       c.getLng());
        m.put("address",   c.getAddress());
        m.put("guName",    c.getGuName());
        m.put("photoUrls", photoList);
        m.put("status",    c.getStatus());
        m.put("createdAt", c.getCreatedAt() != null ? c.getCreatedAt().toString() : null);
        return m;
    }
}
