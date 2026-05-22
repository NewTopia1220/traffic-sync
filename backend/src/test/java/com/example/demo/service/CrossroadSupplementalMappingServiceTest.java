package com.example.demo.service;

import com.example.demo.entity.CrossroadSupplementalMappingEntity;
import com.example.demo.model.CrossroadInfo;
import com.example.demo.model.context.CrossroadRoadLinkMapping;
import com.example.demo.model.context.GeoPoint;
import com.example.demo.model.context.TopisLinkGeometry;
import com.example.demo.repository.CrossroadSupplementalMappingRepository;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class CrossroadSupplementalMappingServiceTest {

    @Test
    void fillsSpeedLinkIdWhenStoredRiskMappingHasNoSpeedMapping() throws Exception {
        CrossroadSupplementalMappingRepository mappingRepository = mock(CrossroadSupplementalMappingRepository.class);
        TopisApiService topisApiService = mock(TopisApiService.class);
        RoadLinkMappingService roadLinkMappingService = roadLinkMappingService();
        CrossroadSupplementalMappingService service =
                new CrossroadSupplementalMappingService(mappingRepository, topisApiService, roadLinkMappingService);

        CrossroadSupplementalMappingEntity existing = new CrossroadSupplementalMappingEntity();
        existing.setCrsrdId("C1");
        existing.setRiskSourceLinkId("RISK1");
        existing.setRiskLineString("LineString(127.0000 37.0000,127.0002 37.0000)");
        existing.setRiskDistanceMeters(7.0);

        when(mappingRepository.findByCrsrdIdIn(any())).thenReturn(List.of(existing));
        when(topisApiService.hasLinkGeometrySource()).thenReturn(true);
        when(topisApiService.fetchAllLinkGeometries()).thenReturn(Map.of("SPEED1", geometry("SPEED1")));

        Map<String, CrossroadRoadLinkMapping> mappings = service.loadOrCreateMappings(List.of(crossroad("C1")));

        assertThat(mappings).containsKey("C1");
        assertThat(mappings.get("C1").getSpeedLinkId()).isEqualTo("SPEED1");
        assertThat(existing.getSpeedLinkId()).isEqualTo("SPEED1");
        assertThat(existing.getSpeedDistanceMeters()).isNotNull();
        assertThat(existing.getRiskSourceLinkId()).isEqualTo("RISK1");
        assertThat(existing.getRiskLineString()).isEqualTo("LineString(127.0000 37.0000,127.0002 37.0000)");
        assertThat(existing.getGuName()).isEqualTo("Songpa");
        verify(mappingRepository).saveAll(any());
    }

    @Test
    void createsRiskAndSpeedMappingFromNearestTopisLink() throws Exception {
        CrossroadSupplementalMappingRepository mappingRepository = mock(CrossroadSupplementalMappingRepository.class);
        TopisApiService topisApiService = mock(TopisApiService.class);
        RoadLinkMappingService roadLinkMappingService = roadLinkMappingService();
        CrossroadSupplementalMappingService service =
                new CrossroadSupplementalMappingService(mappingRepository, topisApiService, roadLinkMappingService);

        when(mappingRepository.findByCrsrdIdIn(any())).thenReturn(List.of());
        when(topisApiService.hasLinkGeometrySource()).thenReturn(true);
        when(topisApiService.fetchAllLinkGeometries()).thenReturn(Map.of("TOPIS1", geometry("TOPIS1")));

        Map<String, CrossroadRoadLinkMapping> mappings = service.loadOrCreateMappings(List.of(crossroad("C1")));

        assertThat(mappings).containsKey("C1");
        assertThat(mappings.get("C1").getLinkId()).isEqualTo("TOPIS1");
        assertThat(mappings.get("C1").getSpeedLinkId()).isEqualTo("TOPIS1");
        assertThat(mappings.get("C1").getLineString()).startsWith("LineString(");
        verify(mappingRepository).saveAll(any());
    }

    @Test
    void storesGuNameOnCompleteStoredMappingWithoutRecalculatingTopisLink() throws Exception {
        CrossroadSupplementalMappingRepository mappingRepository = mock(CrossroadSupplementalMappingRepository.class);
        TopisApiService topisApiService = mock(TopisApiService.class);
        RoadLinkMappingService roadLinkMappingService = roadLinkMappingService();
        CrossroadSupplementalMappingService service =
                new CrossroadSupplementalMappingService(mappingRepository, topisApiService, roadLinkMappingService);

        CrossroadSupplementalMappingEntity existing = new CrossroadSupplementalMappingEntity();
        existing.setCrsrdId("C1");
        existing.setRiskSourceLinkId("RISK1");
        existing.setRiskLineString("LineString(127.0000 37.0000,127.0002 37.0000)");
        existing.setSpeedLinkId("SPEED1");

        when(mappingRepository.findByCrsrdIdIn(any())).thenReturn(List.of(existing));

        Map<String, CrossroadRoadLinkMapping> mappings = service.loadOrCreateMappings(List.of(crossroad("C1")));

        assertThat(mappings).containsKey("C1");
        assertThat(existing.getGuName()).isEqualTo("Songpa");
        verify(mappingRepository).saveAll(any());
        verify(topisApiService, never()).fetchAllLinkGeometries();
    }

    private RoadLinkMappingService roadLinkMappingService() {
        RoadLinkMappingService service = new RoadLinkMappingService();
        ReflectionTestUtils.setField(service, "maxMatchDistanceMeters", 100.0);
        ReflectionTestUtils.setField(service, "roadRiskLocalLineLengthMeters", 60.0);
        return service;
    }

    private CrossroadInfo crossroad(String crsrdId) {
        CrossroadInfo crossroad = new CrossroadInfo();
        crossroad.setCrsrdId(crsrdId);
        crossroad.setCrsrdNm("Jamsil");
        crossroad.setLat(37.0000);
        crossroad.setLon(127.0000);
        crossroad.setGuName("Songpa");
        return crossroad;
    }

    private TopisLinkGeometry geometry(String linkId) {
        return TopisLinkGeometry.builder()
                .linkId(linkId)
                .vertices(List.of(
                        new GeoPoint(37.0001, 126.9999),
                        new GeoPoint(37.0001, 127.0001)
                ))
                .build();
    }
}
