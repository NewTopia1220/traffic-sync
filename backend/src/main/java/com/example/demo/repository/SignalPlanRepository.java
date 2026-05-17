package com.example.demo.repository;

import com.example.demo.entity.SignalPlanEntity;
import com.example.demo.entity.SignalPlanId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SignalPlanRepository extends JpaRepository<SignalPlanEntity, SignalPlanId> {
    List<SignalPlanEntity> findByIdIntNo(String intNo);
}
