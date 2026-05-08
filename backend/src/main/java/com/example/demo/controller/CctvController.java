package com.example.demo.controller;

import com.example.demo.entity.CctvEntity;
import com.example.demo.model.CctvInfo;
import com.example.demo.repository.CctvRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequiredArgsConstructor
@RequestMapping("/api/cctv")
public class CctvController {

    private final CctvRepository cctvRepository;

    @GetMapping
    public List<CctvInfo> getAll() {
        return cctvRepository.findAll().stream()
                .map(this::toInfo)
                .toList();
    }

    @GetMapping("/area")
    public List<CctvInfo> getArea(
            @RequestParam double lat,
            @RequestParam double lon,
            @RequestParam(defaultValue = "2.0") double radius) {
        return cctvRepository.findWithinRadius(lat, lon, radius).stream()
                .map(this::toInfo)
                .toList();
    }

    private CctvInfo toInfo(CctvEntity e) {
        return new CctvInfo(e.getCctvId(), e.getCctvNm(), e.getLat(), e.getLon(),
                e.getStreamId(), e.getCctvCh());
    }
}
