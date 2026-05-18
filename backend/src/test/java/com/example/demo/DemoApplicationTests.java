package com.example.demo;

import com.example.demo.repository.CctvRepository;
import com.example.demo.repository.CrossroadRepository;
import com.example.demo.repository.SignalCrossroadRepository;
import com.example.demo.repository.SignalPhaseRepository;
import com.example.demo.repository.SignalPlanRepository;
import com.example.demo.service.CctvDataInitService;
import com.example.demo.service.CrossroadDataInitService;
import com.example.demo.service.SignalDataInitService;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.mock.mockito.MockBean;

@SpringBootTest(properties = {
		"traffic.scheduler.enabled=false",
		"traffic.supplemental.enabled=false",
		"spring.autoconfigure.exclude=org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration,org.springframework.boot.autoconfigure.orm.jpa.HibernateJpaAutoConfiguration"
})
class DemoApplicationTests {

	// 이 테스트는 DB/JPA 자동 설정을 끄고 애플리케이션 컨텍스트만 확인한다.
	// Repository 구현체가 만들어지지 않으므로 컨트롤러/초기화 서비스 주입용 mock을 둔다.
	@MockBean
	private CctvRepository cctvRepository;

	@MockBean
	private CrossroadRepository crossroadRepository;

	@MockBean
	private SignalCrossroadRepository signalCrossroadRepository;

	@MockBean
	private SignalPhaseRepository signalPhaseRepository;

	@MockBean
	private SignalPlanRepository signalPlanRepository;

	@MockBean
	private CctvDataInitService cctvDataInitService;

	@MockBean
	private CrossroadDataInitService crossroadDataInitService;

	@MockBean
	private SignalDataInitService signalDataInitService;

	@Test
	void contextLoads() {
	}

}
