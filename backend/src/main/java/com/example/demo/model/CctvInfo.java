package com.example.demo.model;

import lombok.AllArgsConstructor;
import lombok.Getter;

@Getter
@AllArgsConstructor
public class CctvInfo {
    private String cctvId;
    private String cctvNm;
    private double lat;
    private double lon;
    private String streamId; // UTIC 내부 ID (iframe url의 id= 파라미터)
    private Integer cctvCh;  // 채널 번호 (cctvch= 파라미터)
}
