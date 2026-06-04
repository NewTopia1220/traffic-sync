package com.example.demo.model.context;

public record TopisLinkVertexInfo(
        String linkId,
        Integer verSeq,
        Double grs80tmX,
        Double grs80tmY,
        Double lat,
        Double lon
) {
}
