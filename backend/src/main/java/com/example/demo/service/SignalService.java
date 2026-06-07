package com.example.demo.service;

import com.example.demo.entity.*;
import com.example.demo.model.TrafficStatus;
import com.example.demo.model.context.GeoPoint;
import com.example.demo.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;

@Service
@RequiredArgsConstructor
public class SignalService {

    private final SignalCrossroadRepository crossroadRepo;
    private final SignalPhaseRepository phaseRepo;
    private final SignalPlanRepository planRepo;
    private final TrafficCacheService trafficCacheService;
    private final SupplementalDataCacheService supplementalDataCacheService;

    public Map<String, Object> getSignalData(String intNo) {
        Map<String, Object> result = new LinkedHashMap<>();

        SignalCrossroadEntity crossroad = crossroadRepo.findById(intNo).orElse(null);
        if (crossroad == null) return Map.of("error", "교차로 없음: " + intNo);

        result.put("intNo", crossroad.getIntNo());
        result.put("intNm", crossroad.getIntNm());
        result.put("xCoord", crossroad.getXCoord());
        result.put("yCoord", crossroad.getYCoord());

        List<SignalPhaseEntity> phases = phaseRepo.findByIdIntNo(intNo);
        List<Map<String, Object>> phaseList = new ArrayList<>();
        for (SignalPhaseEntity p : phases) {
            Map<String, Object> pm = new LinkedHashMap<>();
            pm.put("mapNo", p.getId().getMapNo());
            pm.put("aRing1", p.getARing1()); pm.put("aRing2", p.getARing2());
            pm.put("aRing3", p.getARing3()); pm.put("aRing4", p.getARing4());
            pm.put("aRing5", p.getARing5()); pm.put("aRing6", p.getARing6());
            pm.put("aRing7", p.getARing7()); pm.put("aRing8", p.getARing8());
            pm.put("bRing1", p.getBRing1()); pm.put("bRing2", p.getBRing2());
            pm.put("bRing3", p.getBRing3()); pm.put("bRing4", p.getBRing4());
            pm.put("bRing5", p.getBRing5()); pm.put("bRing6", p.getBRing6());
            pm.put("bRing7", p.getBRing7()); pm.put("bRing8", p.getBRing8());
            phaseList.add(pm);
        }
        result.put("phases", phaseList);

        List<SignalPlanEntity> plans = planRepo.findByIdIntNo(intNo);
        List<Map<String, Object>> planList = new ArrayList<>();
        for (SignalPlanEntity p : plans) {
            Map<String, Object> pm = new LinkedHashMap<>();
            pm.put("planNo", p.getId().getPlanNo());
            pm.put("planIdxNo", p.getId().getPlanIdxNo());
            pm.put("operHh", p.getOperPlanHh());
            pm.put("operMi", p.getOperPlanMi());
            pm.put("cycleVal", p.getCycleVal());
            pm.put("offsetVal", p.getOffsetVal());
            pm.put("aRing1", p.getARing1()); pm.put("aRing2", p.getARing2());
            pm.put("aRing3", p.getARing3()); pm.put("aRing4", p.getARing4());
            pm.put("aRing5", p.getARing5()); pm.put("aRing6", p.getARing6());
            pm.put("aRing7", p.getARing7()); pm.put("aRing8", p.getARing8());
            pm.put("bRing1", p.getBRing1()); pm.put("bRing2", p.getBRing2());
            pm.put("bRing3", p.getBRing3()); pm.put("bRing4", p.getBRing4());
            pm.put("bRing5", p.getBRing5()); pm.put("bRing6", p.getBRing6());
            pm.put("bRing7", p.getBRing7()); pm.put("bRing8", p.getBRing8());
            planList.add(pm);
        }
        result.put("plans", planList);

        return result;
    }

    public Map<String, Object> getSimulationContext(String intNo) {
        // SIGNAL_CROSSROAD 테이블에서 intNo로 교차로 기본정보 조회
        SignalCrossroadEntity crossroad = crossroadRepo.findById(intNo).orElse(null);
        // 교차로 자체가 DB에 없으면 에러 반환
        if (crossroad == null) return Map.of("error", "교차로 없음: " + intNo);

        // 현재 시각 — 어떤 운영계획이 활성인지 판단하고 사이클 내 경과 시간 계산에 사용
        LocalDateTime now = LocalDateTime.now();
        // 자정 기준 초(sec)로 변환 — 운영계획 시작 시각과 같은 단위로 비교하기 위함
        int nowSec = now.getHour() * 3600 + now.getMinute() * 60 + now.getSecond();

        // SIGNAL_PLAN 테이블에서 해당 교차로의 모든 운영계획 행 조회
        List<SignalPlanEntity> allPlans = planRepo.findByIdIntNo(intNo);
        // 운영계획이 하나도 없으면 시뮬레이션 불가
        if (allPlans.isEmpty()) return Map.of("error", "신호계획 없음: " + intNo);

        // 전체 계획 중 현재 시각에 해당하는 활성 운영계획 1개 선택
        SignalPlanEntity activePlan = selectActivePlan(allPlans, now.getHour(), now.getMinute());

        // SIGNAL_PHASE 테이블에서 현시 구성(방향코드) 조회 — 여러 mapNo가 있을 수 있으나 첫 번째만 사용
        List<SignalPhaseEntity> phases = phaseRepo.findByIdIntNo(intNo);
        SignalPhaseEntity phase = phases.isEmpty() ? null : phases.get(0);
    
        // 활성 운영계획의 aRing1~8 값(현시별 초)을 리스트로 추출
        List<Integer> planSeconds = getPlanARingSeconds(activePlan);
        // aRing 값이 전부 null 또는 0이면 유효한 신호계획이 없는 교차로
        boolean hasValidPlan = planSeconds.stream().anyMatch(s -> s != null && s > 0);
        if (!hasValidPlan) {
            return Map.of(
                "intNo", crossroad.getIntNo(),
                "intNm", crossroad.getIntNm(),
                "warning", "신호계획 데이터가 비어 있습니다 (aRing 모두 null). DB에 유효한 계획이 없는 교차로입니다.",
                "phases", Collections.emptyList()
            );
        }

        // 현시구성 A링(주 방향) 코드 리스트 — 현시 i번의 방향코드가 phaseACodes.get(i)
        List<String> phaseACodes = phase != null ? getPhaseACodes(phase) : Collections.emptyList();
        // 현시구성 B링(대향 방향) 코드 리스트
        List<String> phaseBCodes = phase != null ? getPhaseBCodes(phase) : Collections.emptyList();

        // 운영계획 시작 시각을 초 단위로 변환 (예: 07시 00분 → 25200초)
        int planStartSec = parseOperTimeSec(activePlan.getOperPlanHh(), activePlan.getOperPlanMi());
        // 사이클 길이(초) — DB 값이 없거나 0이면 기본값 120초 사용
        int cycleVal = (activePlan.getCycleVal() != null && activePlan.getCycleVal() > 0)
                       ? activePlan.getCycleVal() : 120;
        // 현재 사이클 내 경과 시간 — 음수 방지를 위해 이중 모듈러 연산 적용
        int elapsed = ((nowSec - planStartSec) % cycleVal + cycleVal) % cycleVal;
        // 경과 시간 기준으로 지금 켜져 있는 현시 번호 계산
        int currentPhaseNo = calcPhaseNo(planSeconds, elapsed);

        // 응답 맵 구성 — LinkedHashMap으로 삽입 순서 유지
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("intNo", crossroad.getIntNo());
        result.put("intNm", crossroad.getIntNm());
        // 사이클 길이 — 프론트에서 진행 바 계산에 사용
        result.put("cycleVal", cycleVal);
        // 운영계획 시작 시각(초) — 프론트에서 elapsed 재계산 시 기준값
        result.put("planStartSec", planStartSec);
        // 현재 활성 현시 번호 — 최초 렌더링 시 하이라이트 기준
        result.put("currentPhaseNo", currentPhaseNo);
        result.put("traffic", buildRealtimeTrafficContext(crossroad));

        List<Map<String, Object>> phaseList = new ArrayList<>();
        for (int i = 0; i < planSeconds.size(); i++) {
            Integer sec = planSeconds.get(i);
            // sec가 null 또는 0이면 해당 현시부터는 정의되지 않은 것이므로 순회 종료
            if (sec == null || sec == 0) break;

            // i번째 현시의 A링·B링 방향코드 (인덱스 범위 초과 시 null)
            String aCode = i < phaseACodes.size() ? phaseACodes.get(i) : null;
            String bCode = i < phaseBCodes.size() ? phaseBCodes.get(i) : null;
            // 방향코드 쌍을 "남↔북 직진" 같은 사람이 읽을 수 있는 문자열 리스트로 변환
            List<String> dirs = buildDirStrings(aCode, bCode);
            // 방향코드 없는데 시간이 긴 경우 → clearance(전적색)가 아닌 미확인 현시
            if (dirs.equals(List.of("전적색")) && sec > 6) {
                dirs = List.of("미확인");
            }

            // 현시 1개를 { no, sec, dirs } 형태로 담아 리스트에 추가
            Map<String, Object> p = new LinkedHashMap<>();
            p.put("no", i + 1);   // 현시 번호 (1-based)
            p.put("sec", sec);    // 해당 현시의 녹색 시간(초)
            p.put("dirs", dirs);  // 통행 방향 문자열 리스트
            phaseList.add(p);
        }
        result.put("phases", phaseList);
        return result;
    }

    private Map<String, Object> buildRealtimeTrafficContext(SignalCrossroadEntity signalCrossroad) {
        Double lon = parseCoord(signalCrossroad.getXCoord());
        Double lat = parseCoord(signalCrossroad.getYCoord());
        if (lon == null || lat == null) {
            return Map.of(
                    "source", "none",
                    "realTime", false,
                    "reason", "신호 교차로 좌표 없음"
            );
        }

        TrafficStatus nearest = null;
        double nearestDistanceMeters = Double.MAX_VALUE;
        GeoPoint signalPoint = new GeoPoint(lat, lon);
        for (TrafficStatus status : trafficCacheService.getAllSignals().values()) {
            if (status == null) continue;
            double statusLat = status.getLat();
            double statusLon = status.getLon();
            if (statusLat == 0.0 || statusLon == 0.0) continue;

            double distance = GeoDistanceUtils.haversineMeters(
                    signalPoint,
                    new GeoPoint(statusLat, statusLon)
            );
            if (distance < nearestDistanceMeters) {
                nearestDistanceMeters = distance;
                nearest = status;
            }
        }

        if (nearest == null || nearestDistanceMeters > 350.0) {
            return Map.of(
                    "source", "none",
                    "realTime", false,
                    "reason", "근처 실시간 속도 캐시 없음",
                    "matchDistanceMeters", Math.round(nearestDistanceMeters == Double.MAX_VALUE ? -1 : nearestDistanceMeters)
            );
        }

        supplementalDataCacheService.enrichTrafficStatus(nearest);
        Map<String, Object> traffic = new LinkedHashMap<>();
        traffic.put("source", "nearest-live-crossroad");
        traffic.put("realTime", nearest.getSpeedKph() != null && !nearest.isSpeedStale());
        traffic.put("matchedCrsrdId", nearest.getCrsrdId());
        traffic.put("matchedCrsrdNm", nearest.getCrsrdNm());
        traffic.put("matchDistanceMeters", Math.round(nearestDistanceMeters));
        traffic.put("speedKph", nearest.getSpeedKph());
        traffic.put("travelTimeSec", nearest.getTravelTimeSec());
        traffic.put("congestion", nearest.getCongestion());
        traffic.put("speedStale", nearest.isSpeedStale());
        traffic.put("serverTimeMs", nearest.getServerTimeMs());
        traffic.put("avgWaitSec", nearest.getAvgWaitSec());
        return traffic;
    }

    private Double parseCoord(String value) {
        try {
            if (value == null || value.isBlank()) return null;
            return Double.parseDouble(value) / 10_000_000.0;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private SignalPlanEntity selectActivePlan(List<SignalPlanEntity> plans, int hour, int minute) {
        int nowMin = hour * 60 + minute;
        // cycleVal > 0 이고 aRing 값이 하나라도 있는 행만 후보로
        List<SignalPlanEntity> valid = plans.stream()
            .filter(p -> p.getOperPlanHh() != null && p.getOperPlanMi() != null)
            .filter(p -> p.getCycleVal() != null && p.getCycleVal() > 0)
            .filter(p -> getPlanARingSeconds(p).stream().anyMatch(s -> s != null && s > 0))
            .toList();

        if (valid.isEmpty()) return plans.get(0); // 유효한 행 없으면 첫 행 반환 (hasValidPlan 체크로 걸러짐)

        SignalPlanEntity best = null;
        int bestMin = -1;
        for (SignalPlanEntity p : valid) {
            try {
                int planMin = Integer.parseInt(p.getOperPlanHh()) * 60
                            + Integer.parseInt(p.getOperPlanMi());
                if (planMin <= nowMin && planMin > bestMin) {
                    bestMin = planMin;
                    best = p;
                }
            } catch (NumberFormatException ignored) {}
        }
        if (best == null) {
            // 현재 시각보다 이른 플랜 없으면 가장 마지막 플랜 사용 (자정 이후 첫 운행)
            best = valid.stream()
                .max(Comparator.comparingInt(p -> {
                    try { return Integer.parseInt(p.getOperPlanHh()) * 60 + Integer.parseInt(p.getOperPlanMi()); }
                    catch (NumberFormatException e) { return -1; }
                }))
                .orElse(valid.get(0));
        }
        return best;
    }

    private List<Integer> getPlanARingSeconds(SignalPlanEntity p) {
        return Arrays.asList(p.getARing1(), p.getARing2(), p.getARing3(), p.getARing4(),
                             p.getARing5(), p.getARing6(), p.getARing7(), p.getARing8());
    }

    private List<String> getPhaseACodes(SignalPhaseEntity p) {
        return Arrays.asList(p.getARing1(), p.getARing2(), p.getARing3(), p.getARing4(),
                             p.getARing5(), p.getARing6(), p.getARing7(), p.getARing8());
    }

    private List<String> getPhaseBCodes(SignalPhaseEntity p) {
        return Arrays.asList(p.getBRing1(), p.getBRing2(), p.getBRing3(), p.getBRing4(),
                             p.getBRing5(), p.getBRing6(), p.getBRing7(), p.getBRing8());
    }

    private int parseOperTimeSec(String hh, String mi) {
        try { return Integer.parseInt(hh) * 3600 + Integer.parseInt(mi) * 60; }
        catch (NumberFormatException e) { return 0; }
    }

    private int calcPhaseNo(List<Integer> seconds, int elapsed) {
        int acc = 0;
        for (int i = 0; i < seconds.size(); i++) {
            Integer sec = seconds.get(i);
            if (sec == null || sec == 0) break;
            acc += sec;
            if (elapsed < acc) return i + 1;
        }
        return 1;
    }

    // A링 + B링 코드를 압축 문자열 리스트로 변환
    // 양방향 대칭이면 "남동↔북서 직진" 한 줄, 아니면 각각 두 줄
    private List<String> buildDirStrings(String aCode, String bCode) {
        if (aCode == null && bCode == null) return List.of("전적색");

        boolean aIsPed = aCode != null && !aCode.isBlank() && aCode.charAt(0) == 'P';
        boolean bIsPed = bCode != null && !bCode.isBlank() && bCode.charAt(0) == 'P';
        if (aIsPed || bIsPed) return List.of("보행");

        String[] a = parseDirParts(aCode);  // ["직진","남동","북서"]
        String[] b = parseDirParts(bCode);  // ["직진","북서","남동"]

        // 둘 다 같은 타입이고 from/to가 서로 반대면 ↔ 로 합침
        if (a != null && b != null
                && a[0].equals(b[0])       // 같은 신호 타입 (직진/좌회전)
                && a[1].equals(b[2])       // A의 from == B의 to
                && a[2].equals(b[1])) {    // A의 to   == B의 from
            return List.of(a[1] + "↔" + a[2] + " " + a[0]);
        }

        List<String> result = new ArrayList<>();
        if (a != null) result.add(a[1] + "→" + a[2] + " " + a[0]);
        if (b != null) {
            String bStr = b[1] + "→" + b[2] + " " + b[0];
            if (!result.contains(bStr)) result.add(bStr);
        }
        if (result.isEmpty()) return List.of("전적색");
        return result;
    }

    // 코드 파싱 → [type, from, to] 배열 반환 (null이면 null)
    private String[] parseDirParts(String code) {
        if (code == null || code.isBlank()) return null;
        if (code.charAt(0) == 'P') return new String[]{"보행", "", ""};  // 보행자 코드
        if (code.length() < 7) return null;
        return new String[]{
            parseSignalType(code.charAt(0)),
            angleToCompass(code.substring(1, 4)),
            angleToCompass(code.substring(4, 7))
        };
    }

    private Map<String, Object> parseDirectionCode(String ring, String code) {
        Map<String, Object> d = new LinkedHashMap<>();
        d.put("ring", ring);
        d.put("code", code);
        if (code == null || code.length() < 7) return d;
        d.put("type", parseSignalType(code.charAt(0)));
        d.put("from", angleToCompass(code.substring(1, 4)));
        d.put("to",   angleToCompass(code.substring(4, 7)));
        return d;
    }

    private String parseSignalType(char c) {
        return switch (c) {
            case 'S' -> "직진";
            case 'L' -> "좌회전";
            case 'P' -> "보행";
            case 'U' -> "유턴";
            case 'B' -> "버스";
            default  -> String.valueOf(c);
        };
    }

    private String angleToCompass(String angleStr) {
        try {
            int a = Integer.parseInt(angleStr);
            if (a < 23 || a >= 338) return "북";
            if (a < 68)  return "북동";
            if (a < 113) return "동";
            if (a < 158) return "남동";
            if (a < 203) return "남";
            if (a < 248) return "남서";
            if (a < 293) return "서";
            return "북서";
        } catch (NumberFormatException e) { return angleStr; }
    }

    public List<Map<String, Object>> getAllCrossroads() {
        Set<String> hasPhase = phaseRepo.findAllIntNos();
        List<Map<String, Object>> list = new ArrayList<>();
        for (SignalCrossroadEntity e : crossroadRepo.findAll()) {
            if (!hasPhase.contains(e.getIntNo())) continue;
            Map<String, Object> m = new LinkedHashMap<>();
            m.put("intNo", e.getIntNo());
            m.put("intNm", e.getIntNm());
            m.put("xCoord", e.getXCoord());
            m.put("yCoord", e.getYCoord());
            list.add(m);
        }
        return list;
    }
}
