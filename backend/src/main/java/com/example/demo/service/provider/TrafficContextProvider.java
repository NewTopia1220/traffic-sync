package com.example.demo.service.provider;

import com.example.demo.model.WeatherInfo;
import com.example.demo.model.SpeedInfo;
import com.example.demo.model.RiskInfo;


// 교통 상황에 필요한 외부 정보 제공 인터페이스
public interface TrafficContextProvider {
    WeatherInfo getWeather(double lat, double lon);
    SpeedInfo getSpeed(double lat, double lon);
    RiskInfo getRisk(double lat, double lon);
}
