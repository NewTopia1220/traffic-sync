package com.example.demo.controller;

import com.example.demo.entity.CctvEntity;
import com.example.demo.model.CctvInfo;
import com.example.demo.repository.CctvRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;



//@Controller + @ResponseBody 합친 어노테이션
//모든 메서드 반환값이 자동으로 JSON으로 변환
@RestController
//생성자 주입을 위한 Lombok 어노테이션 final필드 생성자 자동 생성해줌
@RequiredArgsConstructor
//공통 URL 매핑
@RequestMapping("/api/cctv")
public class CctvController {

    //CctvRepository는 인터페이스이지만 Spring Data JPA가 런타임에 구현체를 자동으로 생성하여 주입
    private final CctvRepository cctvRepository;

    @GetMapping
    //전체 CCTV 정보 조회
    public List<CctvInfo> getAll() {

        //CctvEntity 리스트를 가져와서 CctvInfo 리스트로 변환하여 반환
        //스트림 API 사용하여 변환
        //각 CctvEntity를 toInfo 메서드를 통해 CctvInfo로 매핑
        //최종적으로 List<CctvInfo>로 수집하여 반환
        //즉, DB에서 모든 CCTV 데이터를 가져와서 API 응답에 필요한 형태로 변환하여 반환하는 과정
        //CctvInfo는 API 응답에 필요한 데이터만 담는 DTO 역할
        //CctvEntity는 DB 테이블과 매핑되는 엔티티 클래스
        //이렇게 분리하는 이유는 보안, 유지보수, 성능 등 여러 측면에서 유리하기 때문
        //예를 들어, CctvEntity에는 DB에 저장된 모든 컬럼이 포함될 수 있지만, API 응답에는 필요한 컬럼만 포함하는 CctvInfo를 사용하여 불필요한 데이터 노출을 방지할 수 있음
        // 예시 [
        //  CctvEntity { cctvId:"C001", cctvNm:"잠실역CCTV", lat:37.51, lon:127.08, streamId:"stream01", cctvCh:1 },
        //  CctvEntity { cctvId:"C002", cctvNm:"석촌호수CCTV", lat:37.50, lon:127.10, streamId:"stream02", cctvCh:2 },
        //  CctvEntity { cctvId:"C003", cctvNm:"롯데타워CCTV", lat:37.51, lon:127.10, streamId:null, cctvCh:null }
        //]
        // .
        // stream() 파이프라인에 흘려보냄:
        //
        //
        //C001 → → →
        //C002 → → →
        //C003 → → →
        //.map(this::toInfo) 각각 변환:
        //
        //
        //CctvEntity { cctvId:"C001", ... }  →  CctvInfo { cctvId:"C001", cctvNm:"잠실역CCTV", lat:37.51, lon:127.08, streamId:"stream01", cctvCh:1 }
        //CctvEntity { cctvId:"C002", ... }  →  CctvInfo { cctvId:"C002", cctvNm:"석촌호수CCTV", lat:37.50, lon:127.10, streamId:"stream02", cctvCh:2 }
        //CctvEntity { cctvId:"C003", ... }  →  CctvInfo { cctvId:"C003", cctvNm:"롯데타워CCTV", lat:37.51, lon:127.10, streamI

        // .toList() 리스트로 모아서 JSON으로 프론트에:
        //
        //
        //[
        //  { "cctvId":"C001", "cctvNm":"잠실역CCTV", "lat":37.51, "lon":127.08, "streamId":"stream01", "cctvCh":1 },
        //  { "cctvId":"C002", "cctvNm":"석촌호수CCTV", "lat":37.50, "lon":127.10, "streamId":"stream02", "cctvCh":2 },
        //  { "cctvId":"C003", "cctvNm":"롯데타워CCTV", "lat":37.51, "lon":127.10, "streamId":null, "cctvCh":null }
        //]

        //cctvRepository.findAll()  // List
        //    .stream()             // List → Stream 으로 변환 (풀어서 흘려보냄)
        //    .map(this::toInfo)    // 각각 변환
        //    .toList()             // Stream → List 로 다시 모음

        return cctvRepository.findAll().stream()
                .map(this::toInfo)
                .toList();
    }

    @GetMapping("/area")
    //특정 위치 주변 CCTV 정보 조회 lat, lon, radiusKm 파라미터로 위치와 반경 지정 radiusKm 기본값 2km
    public List<CctvInfo> getArea(
            @RequestParam double lat,
            @RequestParam double lon,
            @RequestParam(defaultValue = "2.0") double radius) {
        return cctvRepository.findWithinRadius(lat, lon, radius).stream()
                .map(this::toInfo)
                .toList();
    }

    //CctvEntity → CctvInfo 변환 메서드
    private CctvInfo toInfo(CctvEntity e) {
        return new CctvInfo(e.getCctvId(), e.getCctvNm(), e.getLat(), e.getLon(),
                e.getStreamId(), e.getCctvCh());
    }
}
