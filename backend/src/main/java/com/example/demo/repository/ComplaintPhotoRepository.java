package com.example.demo.repository;

import com.example.demo.entity.ComplaintPhotoEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;

public interface ComplaintPhotoRepository extends JpaRepository<ComplaintPhotoEntity, Long> {
    List<ComplaintPhotoEntity> findByComplaintId(Long complaintId);
}
