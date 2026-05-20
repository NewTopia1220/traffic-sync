package com.example.demo.repository;

import com.example.demo.entity.TrafficNewsEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.List;

public interface TrafficNewsRepository extends JpaRepository<TrafficNewsEntity, String> {

    @Query(value = "SELECT * FROM TRAFFIC_NEWS ORDER BY PUB_DATE DESC FETCH FIRST :limit ROWS ONLY", nativeQuery = true)
    List<TrafficNewsEntity> findLatest(@Param("limit") int limit);

    @Query(value = "SELECT * FROM TRAFFIC_NEWS WHERE CATEGORY = :category ORDER BY PUB_DATE DESC FETCH FIRST :limit ROWS ONLY", nativeQuery = true)
    List<TrafficNewsEntity> findLatestByCategory(@Param("category") String category, @Param("limit") int limit);
}
