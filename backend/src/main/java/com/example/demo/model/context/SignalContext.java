package com.example.demo.model.context;

import com.example.demo.model.SignalDirection;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.Map;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SignalContext {
    // V2X 원본 수집 시각. 예: 20260512103000
    private String totDt;

    // 서버가 신호 데이터를 처리한 시각(epoch millisecond).
    private long serverTimeMs;

    // 방향 코드별 신호 정보.
    // 예: directions.et.stsg.status, directions.et.stsg.rmndCs
    //     directions.st.pdsg.status, directions.wt.ltsg.rmndCs
    private Map<String, SignalDirection> directions;
}
