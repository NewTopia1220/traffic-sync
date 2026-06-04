package com.example.demo.repository;

import com.example.demo.entity.TopisLinkVertexEntity;
import com.example.demo.entity.TopisLinkVertexId;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Collection;
import java.util.List;

public interface TopisLinkVertexRepository extends JpaRepository<TopisLinkVertexEntity, TopisLinkVertexId> {
    List<TopisLinkVertexEntity> findByIdLinkIdOrderByIdVerSeqAsc(String linkId);
    List<TopisLinkVertexEntity> findByIdLinkIdInOrderByIdLinkIdAscIdVerSeqAsc(Collection<String> linkIds);
    List<TopisLinkVertexEntity> findAllByOrderByIdLinkIdAscIdVerSeqAsc();
}
