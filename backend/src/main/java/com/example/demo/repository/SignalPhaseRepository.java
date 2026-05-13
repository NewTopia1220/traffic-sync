package com.example.demo.repository;

import com.example.demo.entity.SignalPhaseEntity;
import com.example.demo.entity.SignalPhaseId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface SignalPhaseRepository extends JpaRepository<SignalPhaseEntity, SignalPhaseId> {
    List<SignalPhaseEntity> findByIdIntNo(String intNo);
}
