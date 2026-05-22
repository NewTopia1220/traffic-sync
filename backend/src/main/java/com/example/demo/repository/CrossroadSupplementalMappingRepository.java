package com.example.demo.repository;

import com.example.demo.entity.CrossroadSupplementalMappingEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Collection;
import java.util.List;

@Repository
public interface CrossroadSupplementalMappingRepository extends JpaRepository<CrossroadSupplementalMappingEntity, String> {
    List<CrossroadSupplementalMappingEntity> findByCrsrdIdIn(Collection<String> crsrdIds);

    List<CrossroadSupplementalMappingEntity> findByGuName(String guName);
}
