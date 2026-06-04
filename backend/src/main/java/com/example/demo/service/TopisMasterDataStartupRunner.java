package com.example.demo.service;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

import java.util.Map;

@Slf4j
@Component
@RequiredArgsConstructor
public class TopisMasterDataStartupRunner implements ApplicationRunner {

    private final TopisMasterDataService topisMasterDataService;
    private final TopisApiService topisApiService;

    @Value("${topis.master.auto-sync-on-startup:true}")
    private boolean autoSyncOnStartup;

    @Override
    public void run(ApplicationArguments args) {
        if (!autoSyncOnStartup) {
            log.info("TOPIS master auto sync is disabled");
            return;
        }

        Map<String, Object> status = topisMasterDataService.masterDataStatus();
        if (Boolean.TRUE.equals(status.get("ready"))) {
            log.info("TOPIS master data already exists; startup sync skipped: {}", status);
            return;
        }

        if (!topisApiService.isConfigured()) {
            log.warn("TOPIS master data is empty but API key is not configured; startup sync skipped: {}", status);
            return;
        }

        try {
            log.info("TOPIS master data is empty; startup sync started: {}", status);
            Map<String, Object> result = topisMasterDataService.syncMasterData();
            log.info("TOPIS master startup sync finished: {}", result);
        } catch (Exception e) {
            log.warn("TOPIS master startup sync failed: {}", e.getMessage(), e);
        }
    }
}
