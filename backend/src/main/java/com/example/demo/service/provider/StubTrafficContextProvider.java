package com.example.demo.service.provider;

import com.example.demo.model.WeatherInfo;
import com.example.demo.model.SpeedInfo;
import com.example.demo.model.RiskInfo;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Service;

import java.time.LocalTime;
import java.util.List;
import java.util.Random;

// 실제 API 연동 전 랜덤 더미데이터 반환
// application.properties: traffic.context.stub=true 일 때 활성화
@Service
@ConditionalOnProperty(name = "traffic.context.stub", havingValue = "true", matchIfMissing = true)
public class StubTrafficContextProvider implements TrafficContextProvider {

    private static final List<String> CONDITIONS = List.of("맑음", "흐림", "비", "구름 많음");
    private static final Random RANDOM = new Random();

    @Override
    public WeatherInfo getWeather(double lat, double lon) {
        return new WeatherInfo(
                CONDITIONS.get(RANDOM.nextInt(CONDITIONS.size())),
                10 + RANDOM.nextInt(20),
                LocalTime.now().getHour()
        );
    }

    @Override
    public SpeedInfo getSpeed(double lat, double lon) {
        int normal = 40 + RANDOM.nextInt(20);
        int current = 5 + RANDOM.nextInt(normal);
        return new SpeedInfo(current, normal);
    }

    @Override
    public RiskInfo getRisk(double lat, double lon) {
        int grade = 1 + RANDOM.nextInt(5);
        return new RiskInfo(grade, grade * 10 + RANDOM.nextInt(10));
    }
}
