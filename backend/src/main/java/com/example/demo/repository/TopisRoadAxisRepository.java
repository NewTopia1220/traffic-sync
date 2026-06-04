package com.example.demo.repository;

import com.example.demo.entity.TopisRoadAxisEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface TopisRoadAxisRepository extends JpaRepository<TopisRoadAxisEntity, String> {
    List<TopisRoadAxisEntity> findByRoadDivCdOrderByAxisCdAsc(String roadDivCd);
}
