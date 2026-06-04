package com.example.demo.repository;

import com.example.demo.entity.TopisAxisLinkEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface TopisAxisLinkRepository extends JpaRepository<TopisAxisLinkEntity, String> {
    List<TopisAxisLinkEntity> findByAxisCdOrderByAxisDirAscLinkSeqAsc(String axisCd);
    List<TopisAxisLinkEntity> findByLinkIdIn(Collection<String> linkIds);
}
