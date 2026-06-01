package com.example.demo.controller;

import com.example.demo.service.ComplaintService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;

@RestController
@RequiredArgsConstructor
public class ComplaintController {

    private final ComplaintService complaintService;

    // 민원 목록 조회 - guName 없으면 전체, 있으면 해당 구만
    @GetMapping("/api/complaints")
    public ResponseEntity<List<Map<String, Object>>> getAll(
            @RequestParam(value = "guName", required = false) String guName) {
        return ResponseEntity.ok(complaintService.getByGu(guName));
    }

    // 민원 접수 (사진 포함 multipart)
    @PostMapping("/api/complaints")
    public ResponseEntity<Map<String, Object>> create(
            @RequestParam("userId")   String userId,
            @RequestParam("userName") String userName,
            @RequestParam("title")    String title,
            @RequestParam("category") String category,
            @RequestParam("content")  String content,
            @RequestParam("lat")      Double lat,
            @RequestParam("lng")      Double lng,
            @RequestParam("address")  String address,
            @RequestParam(value = "photos", required = false) List<MultipartFile> photos) {

        return ResponseEntity.ok(
            complaintService.create(userId, userName, title, category, content, lat, lng, address, photos)
        );
    }

    // 민원 상태 변경 (관리자용)
    @PatchMapping("/api/complaints/{id}/status")
    public ResponseEntity<Map<String, Object>> updateStatus(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(complaintService.updateStatus(id, body.get("status")));
    }
}
