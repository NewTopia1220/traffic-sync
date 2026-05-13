package com.example.demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class DemoApplication {

	public static void main(String[] args) {
		// JPA Repository를 사용하므로 DataSource/JPA 자동 설정을 제외하면 안 된다.
		SpringApplication.run(DemoApplication.class, args);
	}

}
