package com.example.demo.service;

import com.example.demo.model.context.RoadSpeedSnapshot;
import com.example.demo.model.context.TopisAxisLinkInfo;
import com.example.demo.model.context.TopisLinkGeometry;
import com.example.demo.model.context.TopisLinkVertexInfo;
import com.example.demo.model.context.TopisRoadAxisInfo;
import com.example.demo.model.context.TopisRoadDivInfo;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.web.reactive.function.client.WebClient;

import java.util.Map;
import java.util.Optional;
import java.util.List;

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
    void parsesTopisLinkVerInfoRows() throws Exception {
        String response = """
                <LinkVerInfo>
                  <list_total_count>2</list_total_count>
                  <row>
                    <LINK_ID>L200</LINK_ID>
                    <VER_SEQ>2</VER_SEQ>
                    <GRS80TM_X>127.2002</GRS80TM_X>
                    <GRS80TM_Y>37.6002</GRS80TM_Y>
                  </row>
                  <row>
                    <LINK_ID>L200</LINK_ID>
                    <VER_SEQ>1</VER_SEQ>
                    <GRS80TM_X>127.2000</GRS80TM_X>
                    <GRS80TM_Y>37.6000</GRS80TM_Y>
                  </row>
                </LinkVerInfo>
                """;

        List<TopisLinkVertexInfo> vertices = service.parseLinkVertexInfoResponse(response);
        Map<String, TopisLinkGeometry> geometries = service.parseVertexResponse(response);

        assertThat(vertices).hasSize(2);
        assertThat(vertices.get(0).linkId()).isEqualTo("L200");
        assertThat(vertices.get(0).verSeq()).isEqualTo(2);
        assertThat(vertices.get(0).grs80tmX()).isEqualTo(127.2002);
        assertThat(geometries.get("L200").getVertices()).hasSize(2);
        assertThat(geometries.get("L200").getVertices().get(0).getLon()).isEqualTo(127.2000);
    }

    @Test
    void parsesTopisRoadDivResponse() throws Exception {
        String response = """
                <RoadDivInfo>
                  <list_total_count>1</list_total_count>
                  <row>
                    <ROAD_DIV_CD>001</ROAD_DIV_CD>
                    <ROAD_DIV_NM>도시고속도로</ROAD_DIV_NM>
                  </row>
                </RoadDivInfo>
                """;

        List<TopisRoadDivInfo> rows = service.parseRoadDivResponse(response);

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).roadDivCd()).isEqualTo("001");
        assertThat(rows.get(0).roadDivNm()).isEqualTo("도시고속도로");
    }

    @Test
    void parsesTopisRoadAxisResponse() throws Exception {
        String response = """
                {
                  "RoadInfo": {
                    "list_total_count": 1,
                    "row": [
                      {"ROAD_DIV_CD":"001","AXIS_CD":"204","AXIS_NAME":"양재대로"}
                    ]
                  }
                }
                """;

        List<TopisRoadAxisInfo> rows = service.parseRoadAxisResponse(response);

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).roadDivCd()).isEqualTo("001");
        assertThat(rows.get(0).axisCd()).isEqualTo("204");
        assertThat(rows.get(0).axisName()).isEqualTo("양재대로");
    }

    @Test
    void parsesTopisAxisLinkResponse() throws Exception {
        String response = """
                <LinkWithLoad>
                  <list_total_count>1</list_total_count>
                  <row>
                    <AXIS_CD>204</AXIS_CD>
                    <AXIS_DIR>상행</AXIS_DIR>
                    <LINK_SEQ>12</LINK_SEQ>
                    <LINK_ID>1240005900</LINK_ID>
                  </row>
                </LinkWithLoad>
                """;

        List<TopisAxisLinkInfo> rows = service.parseAxisLinkResponse(response);

        assertThat(rows).hasSize(1);
        assertThat(rows.get(0).axisCd()).isEqualTo("204");
        assertThat(rows.get(0).axisDir()).isEqualTo("상행");
        assertThat(rows.get(0).linkSeq()).isEqualTo(12);
        assertThat(rows.get(0).linkId()).isEqualTo("1240005900");
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
