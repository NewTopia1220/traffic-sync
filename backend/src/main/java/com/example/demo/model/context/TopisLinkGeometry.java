package com.example.demo.model.context;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class TopisLinkGeometry {
    private String linkId;
    @Builder.Default
    private List<GeoPoint> vertices = new ArrayList<>();
}
