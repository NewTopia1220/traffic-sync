package com.example.demo.service;

import com.example.demo.entity.CctvEntity;
import com.example.demo.repository.CctvRepository;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.jsoup.Connection;
import org.jsoup.Jsoup;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

import javax.net.ssl.*;
import java.io.InputStream;
import java.security.cert.X509Certificate;
import java.util.*;

@Slf4j
@Service
@RequiredArgsConstructor
public class CctvDataInitService {

    private final CctvRepository cctvRepository;

    @Value("${utic.api.key:}")
    private String uticApiKey;

    private static final String EXCEL_PATH = "cctv_with_Seoul.xlsx";
    private static final String UTIC_LIST_URL = "https://www.utic.go.kr/guide/cctvOpenData.do";
    private static final String UTIC_INFO_URL = "https://www.utic.go.kr/map/getCctvInfoById.do";

    private final ObjectMapper objectMapper = new ObjectMapper();

    @PostConstruct
    public void init() {
        if (cctvRepository.count() > 0) {
            log.info("CCTV DB 이미 적재됨 ({}개) - 스킵", cctvRepository.count());
            return;
        }
        log.info("CCTV 초기화 시작...");

        List<CctvEntity> cctvList = loadFromExcel();
        if (cctvList.isEmpty()) {
            log.warn("엑셀에서 CCTV 데이터를 읽지 못했습니다.");
            return;
        }
        log.info("엑셀 로드 완료: {}개", cctvList.size());

        if (!uticApiKey.isBlank()) {
            fetchStreamInfo(cctvList);
        } else {
            log.warn("utic.api.key 미설정 - stream ID/CH 조회 스킵");
        }

        cctvRepository.saveAll(cctvList);
        log.info("CCTV DB 저장 완료: {}개 (stream 매핑: {}개)",
                cctvList.size(),
                cctvList.stream().filter(c -> c.getStreamId() != null).count());
    }

    private void disableSslVerification() {
        try {
            TrustManager[] trustAll = new TrustManager[]{new X509TrustManager() {
                public X509Certificate[] getAcceptedIssuers() { return null; }
                public void checkClientTrusted(X509Certificate[] c, String a) {}
                public void checkServerTrusted(X509Certificate[] c, String a) {}
            }};
            SSLContext sc = SSLContext.getInstance("TLS");
            sc.init(null, trustAll, new java.security.SecureRandom());
            HttpsURLConnection.setDefaultSSLSocketFactory(sc.getSocketFactory());
            HttpsURLConnection.setDefaultHostnameVerifier((h, s) -> true);
        } catch (Exception e) {
            log.warn("SSL 비활성화 실패: {}", e.getMessage());
        }
    }

    private void fetchStreamInfo(List<CctvEntity> cctvList) {
        disableSslVerification();

        // 1. 세션 쿠키 획득 (목록 페이지 먼저 접근)
        Map<String, String> cookies;
        try {
            Connection.Response listResp = Jsoup.connect(UTIC_LIST_URL + "?key=" + uticApiKey)
                    .userAgent("Mozilla/5.0")
                    .timeout(10000)
                    .execute();
            cookies = listResp.cookies();
            log.info("UTIC 세션 획득 완료, CCTV {}개 정보 조회 시작...", cctvList.size());
        } catch (Exception e) {
            log.error("UTIC 세션 획득 실패: {}", e.getMessage());
            return;
        }

        int success = 0, fail = 0;
        for (CctvEntity cctv : cctvList) {
            try {
                String body = Jsoup.connect(UTIC_INFO_URL + "?cctvId=" + cctv.getCctvId())
                        .userAgent("Mozilla/5.0")
                        .header("Referer", UTIC_LIST_URL + "?key=" + uticApiKey)
                        .header("X-Requested-With", "XMLHttpRequest")
                        .cookies(cookies)
                        .ignoreContentType(true)
                        .timeout(5000)
                        .get()
                        .body()
                        .text();

                JsonNode node = objectMapper.readTree(body);
                if (node.has("ID") && node.has("CH")) {
                    cctv.setStreamId(node.get("ID").asText());
                    cctv.setCctvCh(node.get("CH").asInt());
                    success++;
                } else {
                    fail++;
                    log.debug("{}  응답: {}", cctv.getCctvId(), body);
                }

                // 과도한 요청 방지
                Thread.sleep(50);
            } catch (Exception e) {
                fail++;
                log.debug("{} 조회 실패: {}", cctv.getCctvId(), e.getMessage());
            }
        }
        log.info("stream 정보 조회 완료 - 성공: {}개 / 실패: {}개", success, fail);
    }

    private List<CctvEntity> loadFromExcel() {
        List<CctvEntity> list = new ArrayList<>();
        try (InputStream is = new ClassPathResource(EXCEL_PATH).getInputStream();
             Workbook wb = new XSSFWorkbook(is)) {

            Sheet sheet = wb.getSheetAt(0);
            // 헤더 없음 - 고정 컬럼: 0=index, 1=CCTVID, 2=CCTVNAME, 3=기관, 4=경도(X), 5=위도(Y)
            final int IDX_ID = 1, IDX_NM = 2, IDX_X = 4, IDX_Y = 5;

            for (int i = 0; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;
                try {
                    String id = getCellString(row, IDX_ID);
                    String nm = getCellString(row, IDX_NM);
                    double x = getCellDouble(row, IDX_X);
                    double y = getCellDouble(row, IDX_Y);
                    if (id.isBlank() || x == 0 || y == 0) continue;

                    CctvEntity e = new CctvEntity();
                    e.setCctvId(id);
                    e.setCctvNm(nm);
                    e.setLat(y);
                    e.setLon(x);
                    list.add(e);
                } catch (Exception ex) {
                    log.debug("행 {} 파싱 오류: {}", i, ex.getMessage());
                }
            }
        } catch (Exception e) {
            log.error("엑셀 파싱 실패: {}", e.getMessage(), e);
        }
        return list;
    }

    private String getCellString(Row row, int idx) {
        if (idx < 0) return "";
        Cell cell = row.getCell(idx);
        if (cell == null) return "";
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue().trim();
            case NUMERIC -> String.valueOf((long) cell.getNumericCellValue());
            default -> "";
        };
    }

    private double getCellDouble(Row row, int idx) {
        if (idx < 0) return 0;
        Cell cell = row.getCell(idx);
        if (cell == null) return 0;
        return switch (cell.getCellType()) {
            case NUMERIC -> cell.getNumericCellValue();
            case STRING -> {
                try { yield Double.parseDouble(cell.getStringCellValue().trim()); }
                catch (NumberFormatException e) { yield 0; }
            }
            default -> 0;
        };
    }
}
