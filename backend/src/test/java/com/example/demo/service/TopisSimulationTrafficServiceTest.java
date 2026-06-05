package com.example.demo.service;

import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.assertj.core.api.Assertions.assertThat;

class TopisSimulationTrafficServiceTest {

    @Test
    void classifiesTrafficBySimulationThresholds() throws Exception {
        Method method = TopisSimulationTrafficService.class
                .getDeclaredMethod("generalRoadCongestion", Double.class, Object.class);
        method.setAccessible(true);

        assertThat(method.invoke(null, 14.9, "03")).isEqualTo("\uC815\uCCB4");
        assertThat(method.invoke(null, 15.0, "03")).isEqualTo("\uC11C\uD589");
        assertThat(method.invoke(null, 24.9, "03")).isEqualTo("\uC11C\uD589");
        assertThat(method.invoke(null, 25.0, "03")).isEqualTo("\uC6D0\uD65C");

        assertThat(method.invoke(null, 14.9, "02")).isEqualTo("\uC815\uCCB4");
        assertThat(method.invoke(null, 15.0, "02")).isEqualTo("\uC11C\uD589");
        assertThat(method.invoke(null, 24.9, "02")).isEqualTo("\uC11C\uD589");
        assertThat(method.invoke(null, 25.0, "02")).isEqualTo("\uC6D0\uD65C");
    }
}
