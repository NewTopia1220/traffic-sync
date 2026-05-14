package com.example.demo.service;

import com.example.demo.entity.*;
import com.example.demo.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.*;

@Service
@RequiredArgsConstructor
public class SignalService {

    private final SignalCrossroadRepository crossroadRepo;
    private final SignalPhaseRepository phaseRepo;
    private final SignalPlanRepository planRepo;

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
