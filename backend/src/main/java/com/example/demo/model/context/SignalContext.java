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
    private String totDt;
    private long serverTimeMs;
    private Map<String, SignalDirection> directions;
}
