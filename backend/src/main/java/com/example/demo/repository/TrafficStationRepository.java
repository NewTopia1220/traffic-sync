package com.example.demo.repository;

import com.example.demo.entity.TrafficStationEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

@Repository
public interface TrafficStationRepository extends JpaRepository<TrafficStationEntity, Long> {
}