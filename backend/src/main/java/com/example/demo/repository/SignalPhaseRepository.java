package com.example.demo.repository;

import com.example.demo.entity.SignalPhaseEntity;
import com.example.demo.entity.SignalPhaseId;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

import java.util.List;
import java.util.Set;

public interface SignalPhaseRepository extends JpaRepository<SignalPhaseEntity, SignalPhaseId> {
    List<SignalPhaseEntity> findByIdIntNo(String intNo);

    @Query("SELECT DISTINCT p.id.intNo FROM SignalPhaseEntity p")
    Set<String> findAllIntNos();
}
