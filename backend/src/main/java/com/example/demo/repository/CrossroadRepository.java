package com.example.demo.repository;

import com.example.demo.entity.CrossroadEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CrossroadRepository extends JpaRepository<CrossroadEntity, String> {

    @Query("""
        SELECT c FROM CrossroadEntity c
        WHERE (6371 * acos(cos(radians(:lat)) * cos(radians(c.lat)) *
               cos(radians(c.lon) - radians(:lon)) +
               sin(radians(:lat)) * sin(radians(c.lat)))) <= :radiusKm
    """)
    List<CrossroadEntity> findWithinRadius(@Param("lat") double lat,
                                           @Param("lon") double lon,
                                           @Param("radiusKm") double radiusKm);
}
