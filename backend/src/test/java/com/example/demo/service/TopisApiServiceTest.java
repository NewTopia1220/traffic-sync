package com.example.demo.service;

import com.example.demo.model.context.RoadSpeedSnapshot;
import com.example.demo.model.context.TopisLinkGeometry;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Map;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

class TopisApiServiceTest {

    private final TopisApiService service = new TopisApiService(
            WebClient.builder().build(),
            new CoordinateTransformService("+proj=longlat +datum=WGS84 +no_defs")
    );

    @Test
    void parsesRoadSpeedResponse() throws Exception {
        String response = """
                {
                  "TrafficInfo": {
                    "list_total_count": 1,
                    "row": [
                      {"LINK_ID":"L100","SPEED":"32.5","TRVL_TM":"45"}
                    ]
                  }
                }
                """;

        Optional<RoadSpeedSnapshot> speed = service.parseSpeedResponse(response);

        assertThat(speed).isPresent();
        assertThat(speed.get().getLinkId()).isEqualTo("L100");
        assertThat(speed.get().getSpeedKph()).isEqualTo(32.5);
        assertThat(speed.get().getTravelTimeSec()).isEqualTo(45);
        assertThat(speed.get().isStale()).isFalse();
    }

    @Test
    void parsesRoadSpeedXmlResponse() throws Exception {
        String response = """
                <TrafficInfo>
                  <list_total_count>1</list_total_count>
                  <RESULT>
                    <CODE>INFO-000</CODE>
                    <MESSAGE>OK</MESSAGE>
                  </RESULT>
                  <row>
                    <link_id>1030003700</link_id>
                    <prcs_spd>24.4</prcs_spd>
                    <prcs_trv_time>42</prcs_trv_time>
                  </row>
                </TrafficInfo>
                """;

        Optional<RoadSpeedSnapshot> speed = service.parseSpeedResponse(response);

        assertThat(speed).isPresent();
        assertThat(speed.get().getLinkId()).isEqualTo("1030003700");
        assertThat(speed.get().getSpeedKph()).isEqualTo(24.4);
        assertThat(speed.get().getTravelTimeSec()).isEqualTo(42);
        assertThat(speed.get().isStale()).isFalse();
    }

    @Test
    void parsesLinkVertexRowsInSequenceOrder() throws Exception {
        String response = """
                {
                  "LinkVertex": {
                    "list_total_count": 2,
                    "row": [
                      {"LINK_ID":"L100","VERTEX_SEQ":"2","TMX":"127.1002","TMY":"37.5133"},
                      {"LINK_ID":"L100","VERTEX_SEQ":"1","TMX":"127.1000","TMY":"37.5130"}
                    ]
                  }
                }
                """;

        Map<String, TopisLinkGeometry> geometries = service.parseVertexResponse(response);

        assertThat(geometries).containsKey("L100");
        assertThat(geometries.get("L100").getVertices()).hasSize(2);
        assertThat(geometries.get("L100").getVertices().get(0).getLon()).isEqualTo(127.1000);
        assertThat(geometries.get("L100").getVertices().get(1).getLon()).isEqualTo(127.1002);
    }

    @Test
    void parsesLinkVertexXmlRowsInSequenceOrder() throws Exception {
        String response = """
                <LinkVertex>
                  <list_total_count>2</list_total_count>
                  <RESULT>
                    <CODE>INFO-000</CODE>
                    <MESSAGE>OK</MESSAGE>
                  </RESULT>
                  <row>
                    <link_id>L100</link_id>
                    <vertex_seq>2</vertex_seq>
                    <tmx>127.1002</tmx>
                    <tmy>37.5133</tmy>
                  </row>
                  <row>
                    <link_id>L100</link_id>
                    <vertex_seq>1</vertex_seq>
                    <tmx>127.1000</tmx>
                    <tmy>37.5130</tmy>
                  </row>
                </LinkVertex>
                """;

        Map<String, TopisLinkGeometry> geometries = service.parseVertexResponse(response);

        assertThat(geometries).containsKey("L100");
        assertThat(geometries.get("L100").getVertices()).hasSize(2);
        assertThat(geometries.get("L100").getVertices().get(0).getLon()).isEqualTo(127.1000);
        assertThat(geometries.get("L100").getVertices().get(1).getLon()).isEqualTo(127.1002);
    }

    @Test
    void loadsBundledLinkVertexWorkbookBeforeApi() throws Exception {
        TopisApiService service = new TopisApiService(
                WebClient.builder().build(),
                new CoordinateTransformService("+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +units=m +no_defs")
        );
        ReflectionTestUtils.setField(service, "linkVertexFile", "classpath:data/topis-link-vertex-2025.xlsx");
        ReflectionTestUtils.setField(service, "preferLinkVertexFile", true);

        Map<String, TopisLinkGeometry> geometries = service.fetchAllLinkGeometries();

        assertThat(geometries).containsKey("1000000100");
        assertThat(geometries.get("1000000100").getVertices()).hasSizeGreaterThan(1);
        assertThat(geometries.get("1000000100").getVertices().get(0).getLat()).isBetween(37.0, 38.0);
        assertThat(geometries.get("1000000100").getVertices().get(0).getLon()).isBetween(126.0, 128.0);
    }
}
