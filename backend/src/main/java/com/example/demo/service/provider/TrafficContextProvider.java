package com.example.demo.service.provider;

import com.example.demo.model.WeatherInfo;
import com.example.demo.model.SpeedInfo;
import com.example.demo.model.RiskInfo;

public interface TrafficContextProvider {
    WeatherInfo getWeather(double lat, double lon);
    SpeedInfo getSpeed(double lat, double lon);
    RiskInfo getRisk(double lat, double lon);
}
