package com.example.demo.controller;

import com.example.demo.service.ComplaintService;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
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
            @RequestParam("address")                          String address,
            @RequestParam(value = "department", required = false) String department,
            @RequestParam(value = "aiReason",   required = false) String aiReason,
            @RequestParam(value = "photos",     required = false) List<MultipartFile> photos) {

        return ResponseEntity.ok(
            complaintService.create(userId, userName, title, category, content, lat, lng, address, department, aiReason, photos)
        );
    }

    // 민원 상태 변경 (관리자용)
    @PatchMapping("/api/complaints/{id}/status")
    public ResponseEntity<Map<String, Object>> updateStatus(
            @PathVariable Long id,
            @RequestBody Map<String, String> body) {
        return ResponseEntity.ok(complaintService.updateStatus(id, body.get("status")));
    }

    // 민원 삭제 (사진 포함)
    @DeleteMapping("/api/complaints/{id}")
    public ResponseEntity<Map<String, Object>> delete(@PathVariable Long id) {
        return ResponseEntity.ok(complaintService.delete(id));
    }

    // 사진 BLOB 조회
    @GetMapping("/api/complaints/photos/{photoId}")
    public ResponseEntity<byte[]> getPhoto(@PathVariable Long photoId) {
        return complaintService.getPhoto(photoId)
            .map(p -> ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_TYPE, p.getMimeType() != null ? p.getMimeType() : "image/jpeg")
                .body(p.getData()))
            .orElse(ResponseEntity.notFound().build());
    }
}
