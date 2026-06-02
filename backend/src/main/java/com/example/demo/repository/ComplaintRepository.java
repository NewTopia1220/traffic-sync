package com.example.demo.repository;

import com.example.demo.entity.ComplaintEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

public interface ComplaintRepository extends JpaRepository<ComplaintEntity, Long> {

    List<ComplaintEntity> findAllByOrderByCreatedAtDesc();

    List<ComplaintEntity> findByGuNameOrderByCreatedAtDesc(String guName);

    List<ComplaintEntity> findByUserId(String userId);

    // guName이 없는 기존 레코드 삭제 (구 필터 도입 전 데이터 정리)
    @Modifying
    @Transactional
    @Query("DELETE FROM ComplaintEntity c WHERE c.guName IS NULL")
    int deleteByGuNameIsNull();
}
