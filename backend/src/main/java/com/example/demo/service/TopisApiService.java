package com.example.demo.service;

import com.example.demo.model.context.GeoPoint;
import com.example.demo.model.context.RoadSpeedSnapshot;
import com.example.demo.model.context.TopisAxisLinkInfo;
import com.example.demo.model.context.TopisLinkGeometry;
import com.example.demo.model.context.TopisLinkVertexInfo;
import com.example.demo.model.context.TopisRoadAxisInfo;
import com.example.demo.model.context.TopisRoadDivInfo;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.DefaultResourceLoader;
import org.springframework.core.io.Resource;
import org.springframework.core.io.ResourceLoader;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.util.UriComponentsBuilder;

import java.net.URI;
import java.time.Duration;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;

@Slf4j
@Service
public class TopisApiService {

    private final WebClient webClient;
    private final CoordinateTransformService coordinateTransformService;
    private final ResourceLoader resourceLoader;
    private final ObjectMapper objectMapper = new ObjectMapper();
    private volatile Map<String, TopisLinkGeometry> cachedFileGeometries;

    @Value("${topis.api.base-url:http://openapi.seoul.go.kr:8088}")
    private String baseUrl;

    @Value("${topis.api.service-key:}")
    private String serviceKey;

    @Value("${topis.api.speed-service-name:TrafficInfo}")
    private String speedServiceName;

    @Value("${topis.api.vertex-service-name:LinkVerInfo}")
    private String vertexServiceName;

    @Value("${topis.api.road-div-service-name:RoadDivInfo}")
    private String roadDivServiceName;

    @Value("${topis.api.road-info-service-name:RoadInfo}")
    private String roadInfoServiceName;

    @Value("${topis.api.axis-link-service-name:LinkWithLoad}")
    private String axisLinkServiceName;

    @Value("${topis.api.response-format:xml}")
    private String responseFormat;

    @Value("${topis.api.page-size:1000}")
    private int pageSize;

    @Value("${topis.api.vertex-max-pages:50}")
    private int vertexMaxPages;

    @Value("${topis.api.master-max-pages:200}")
    private int masterMaxPages;

    @Value("${topis.link-vertex.file:classpath:data/topis-link-vertex-2025.xlsx}")
    private String linkVertexFile;

    @Value("${topis.link-vertex.prefer-file:false}")
    private boolean preferLinkVertexFile;

    @Value("${topis.api.request-timeout-seconds:3}")
    private long requestTimeoutSeconds;

    TopisApiService(WebClient webClient, CoordinateTransformService coordinateTransformService) {
        this(webClient, coordinateTransformService, new DefaultResourceLoader());
    }

    @Autowired
    public TopisApiService(
            WebClient webClient,
            CoordinateTransformService coordinateTransformService,
            ResourceLoader resourceLoader
    ) {
        this.webClient = webClient;
        this.coordinateTransformService = coordinateTransformService;
        this.resourceLoader = resourceLoader;
    }

    public boolean isConfigured() {
        return serviceKey != null && !serviceKey.isBlank();
    }

    public boolean hasLinkGeometrySource() {
        return isConfigured() || (preferLinkVertexFile && localLinkVertexResource().isPresent());
    }

    public Optional<RoadSpeedSnapshot> fetchSpeed(String linkId) throws Exception {
        if (!isConfigured()) {
            throw new IllegalStateException("TOPIS service key is not configured");
        }

        URI uri = seoulOpenApiUri(speedServiceName, 1, 5, linkId);
        String response = webClient.get()
                .uri(uri)
                .retrieve()
                .bodyToMono(String.class)
                .timeout(Duration.ofSeconds(requestTimeoutSeconds))
                .block();
        Optional<RoadSpeedSnapshot> parsed = parseSpeedResponse(response);
        parsed.ifPresent(speed -> {
            if (speed.getLinkId() == null || speed.getLinkId().isBlank()) {
                speed.setLinkId(linkId);
            }
        });
        return parsed;
    }

    public List<TopisRoadDivInfo> fetchRoadDivInfos() throws Exception {
        return fetchPaged(roadDivServiceName, null, this::parseRoadDivResponse);
    }

    public List<TopisRoadAxisInfo> fetchRoadAxes(String roadDivCd) throws Exception {
        return fetchPaged(roadInfoServiceName, roadDivCd, this::parseRoadAxisResponse);
    }

    public List<TopisAxisLinkInfo> fetchAxisLinks(String axisCd) throws Exception {
        return fetchPaged(axisLinkServiceName, axisCd, this::parseAxisLinkResponse);
    }

    public List<TopisLinkVertexInfo> fetchLinkVertexInfos(String linkId) throws Exception {
        if (linkId == null || linkId.isBlank()) {
            return List.of();
        }
        return fetchPaged(vertexServiceName, linkId, this::parseLinkVertexInfoResponse);
    }

    public Map<String, TopisLinkGeometry> fetchLinkGeometries(Collection<String> linkIds) throws Exception {
        if (linkIds == null || linkIds.isEmpty()) {
            return Map.of();
        }

        List<TopisLinkVertexInfo> vertexInfos = new ArrayList<>();
        for (String linkId : linkIds) {
            if (linkId == null || linkId.isBlank()) {
                continue;
            }
            vertexInfos.addAll(fetchLinkVertexInfos(linkId));
        }
        return geometriesFromVertexInfos(vertexInfos);
    }

    public Map<String, TopisLinkGeometry> fetchAllLinkGeometries() throws Exception {
        Optional<Map<String, TopisLinkGeometry>> fileGeometries = preferLinkVertexFile
                ? fetchLocalLinkGeometries()
                : Optional.empty();
        if (preferLinkVertexFile && fileGeometries.isPresent()) {
            return fileGeometries.get();
        }

        if (!isConfigured()) {
            throw new IllegalStateException("TOPIS service key is not configured");
        }

        if (isLinkVertexByLinkIdService()) {
            throw new IllegalStateException("TOPIS LinkVerInfo requires LINK_ID. Use fetchLinkGeometries(linkIds).");
        }

        Map<String, TopisLinkGeometry> apiGeometries = fetchApiLinkGeometries();
        if (!apiGeometries.isEmpty()) {
            return apiGeometries;
        }
        if (preferLinkVertexFile && fileGeometries.isPresent()) {
            return fileGeometries.get();
        }
        return apiGeometries;
    }

    private <T> List<T> fetchPaged(String serviceName, String extraPath, ResponseParser<T> parser) throws Exception {
        if (!isConfigured()) {
            throw new IllegalStateException("TOPIS service key is not configured");
        }
        List<T> result = new ArrayList<>();
        int totalCount = 0;

        for (int page = 0; page < masterMaxPages; page++) {
            int start = page * pageSize + 1;
            int end = (page + 1) * pageSize;
            URI uri = seoulOpenApiUri(serviceName, start, end, extraPath);

            String response = webClient.get()
                    .uri(uri)
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(Duration.ofSeconds(requestTimeoutSeconds))
                    .block();

            if (isErrorResponse(response)) {
                log.warn("TOPIS {} response returned an error: {}", serviceName, errorCode(response).orElse("unknown"));
                break;
            }

            totalCount = Math.max(totalCount, totalCount(response));
            List<T> pageRows = parser.parse(response);
            result.addAll(pageRows);

            if (pageRows.isEmpty() && totalCount == 0) {
                break;
            }
            if (totalCount > 0 && end >= totalCount) {
                break;
            }
            if (pageRows.size() < pageSize && totalCount == 0) {
                break;
            }
        }

        return result;
    }

    private Map<String, TopisLinkGeometry> fetchApiLinkGeometries() throws Exception {
        Map<String, TopisLinkGeometry> geometries = new LinkedHashMap<>();
        int totalCount = 0;

        for (int page = 0; page < vertexMaxPages; page++) {
            int start = page * pageSize + 1;
            int end = (page + 1) * pageSize;
            URI uri = seoulOpenApiUri(vertexServiceName, start, end, null);

            String response = webClient.get()
                    .uri(uri)
                    .retrieve()
                    .bodyToMono(String.class)
                    .timeout(Duration.ofSeconds(requestTimeoutSeconds))
                    .block();

            if (isErrorResponse(response)) {
                log.warn("TOPIS {} response returned an error: {}", vertexServiceName, errorCode(response).orElse("unknown"));
                break;
            }

            totalCount = Math.max(totalCount, totalCount(response));
            Map<String, TopisLinkGeometry> pageGeometries = parseVertexResponse(response);
            geometries.putAll(pageGeometries);

            if (pageGeometries.isEmpty() && totalCount == 0) {
                break;
            }

            if (totalCount > 0 && end >= totalCount) {
                break;
            }
        }

        log.info("TOPIS 링크 Vertex {}개 수집", geometries.size());
        return geometries;
    }

    private Optional<Map<String, TopisLinkGeometry>> fetchLocalLinkGeometries() {
        Optional<Resource> resource = localLinkVertexResource();
        if (resource.isEmpty()) {
            return Optional.empty();
        }

        Map<String, TopisLinkGeometry> cached = cachedFileGeometries;
        if (cached != null && !cached.isEmpty()) {
            return Optional.of(cached);
        }

        try {
            Map<String, TopisLinkGeometry> geometries;
            synchronized (this) {
                cached = cachedFileGeometries;
                if (cached != null && !cached.isEmpty()) {
                    return Optional.of(cached);
                }

                try (var inputStream = resource.get().getInputStream()) {
                    geometries = TopisLinkVertexWorkbookReader.read(inputStream, coordinateTransformService);
                }
                cachedFileGeometries = geometries;
            }

            if (geometries.isEmpty()) {
                log.warn("Configured TOPIS link vertex workbook had no usable geometries: {}", linkVertexFile);
                return Optional.empty();
            }

            log.info("Loaded TOPIS link geometries from workbook: {} links ({})", geometries.size(), linkVertexFile);
            return Optional.of(geometries);
        } catch (Exception e) {
            log.warn("Failed to load TOPIS link vertex workbook ({}): {}", linkVertexFile, e.getMessage());
            return Optional.empty();
        }
    }

    private Optional<Resource> localLinkVertexResource() {
        if (linkVertexFile == null || linkVertexFile.isBlank()) {
            return Optional.empty();
        }

        Resource resource = resourceLoader.getResource(linkVertexFile.trim());
        if (!resource.exists()) {
            return Optional.empty();
        }
        return Optional.of(resource);
    }

    Optional<RoadSpeedSnapshot> parseSpeedResponse(String response) throws Exception {
        if (response == null || response.isBlank()) {
            return Optional.empty();
        }
        if (ApiXmlUtils.isXml(response)) {
            return parseSpeedXmlResponse(response);
        }

        JsonNode root = objectMapper.readTree(response);
        List<JsonNode> rows = ApiJsonUtils.rows(root);
        if (rows.isEmpty()) {
            return Optional.empty();
        }

        JsonNode row = rows.get(0);
        String linkId = ApiJsonUtils.text(row, "linkId", "link_id", "LINK_ID", "linkid");
        Double speed = ApiJsonUtils.decimal(row, "speed", "SPEED", "spd", "SPD", "prcs_spd", "PRCS_SPD");
        Integer travelTime = ApiJsonUtils.integer(row,
                "travelTime", "travel_time", "TRAVEL_TIME",
                "trvl_tm", "TRVL_TM", "trvl_time", "TRVL_TIME",
                "prcs_trv_time", "PRCS_TRV_TIME");

        if (linkId.isBlank() && speed == null && travelTime == null) {
            return Optional.empty();
        }

        return Optional.of(RoadSpeedSnapshot.builder()
                .linkId(linkId)
                .speedKph(speed)
                .travelTimeSec(travelTime)
                .stale(false)
                .lastFetchedAtMs(System.currentTimeMillis())
                .build());
    }

    List<TopisRoadDivInfo> parseRoadDivResponse(String response) throws Exception {
        if (response == null || response.isBlank()) {
            return List.of();
        }
        List<TopisRoadDivInfo> result = new ArrayList<>();

        if (ApiXmlUtils.isXml(response)) {
            for (Map<String, String> row : ApiXmlUtils.rows(response)) {
                String roadDivCd = ApiXmlUtils.text(row, "ROAD_DIV_CD", "road_div_cd", "roadDivCd");
                String roadDivNm = ApiXmlUtils.text(row, "ROAD_DIV_NM", "ROAD_DIV_NAME", "road_div_nm", "roadDivNm");
                if (!roadDivCd.isBlank()) {
                    result.add(new TopisRoadDivInfo(roadDivCd, roadDivNm));
                }
            }
            return result;
        }

        JsonNode root = objectMapper.readTree(response);
        for (JsonNode row : ApiJsonUtils.rows(root)) {
            String roadDivCd = ApiJsonUtils.text(row, "ROAD_DIV_CD", "road_div_cd", "roadDivCd");
            String roadDivNm = ApiJsonUtils.text(row, "ROAD_DIV_NM", "ROAD_DIV_NAME", "road_div_nm", "roadDivNm");
            if (!roadDivCd.isBlank()) {
                result.add(new TopisRoadDivInfo(roadDivCd, roadDivNm));
            }
        }
        return result;
    }

    List<TopisRoadAxisInfo> parseRoadAxisResponse(String response) throws Exception {
        if (response == null || response.isBlank()) {
            return List.of();
        }
        List<TopisRoadAxisInfo> result = new ArrayList<>();

        if (ApiXmlUtils.isXml(response)) {
            for (Map<String, String> row : ApiXmlUtils.rows(response)) {
                String roadDivCd = ApiXmlUtils.text(row, "ROAD_DIV_CD", "road_div_cd", "roadDivCd");
                String axisCd = ApiXmlUtils.text(row, "AXIS_CD", "axis_cd", "axisCd");
                String axisName = ApiXmlUtils.text(row, "AXIS_NAME", "AXIS_NM", "axis_name", "axisName");
                if (!axisCd.isBlank()) {
                    result.add(new TopisRoadAxisInfo(roadDivCd, axisCd, axisName));
                }
            }
            return result;
        }

        JsonNode root = objectMapper.readTree(response);
        for (JsonNode row : ApiJsonUtils.rows(root)) {
            String roadDivCd = ApiJsonUtils.text(row, "ROAD_DIV_CD", "road_div_cd", "roadDivCd");
            String axisCd = ApiJsonUtils.text(row, "AXIS_CD", "axis_cd", "axisCd");
            String axisName = ApiJsonUtils.text(row, "AXIS_NAME", "AXIS_NM", "axis_name", "axisName");
            if (!axisCd.isBlank()) {
                result.add(new TopisRoadAxisInfo(roadDivCd, axisCd, axisName));
            }
        }
        return result;
    }

    List<TopisAxisLinkInfo> parseAxisLinkResponse(String response) throws Exception {
        if (response == null || response.isBlank()) {
            return List.of();
        }
        List<TopisAxisLinkInfo> result = new ArrayList<>();

        if (ApiXmlUtils.isXml(response)) {
            for (Map<String, String> row : ApiXmlUtils.rows(response)) {
                String axisCd = ApiXmlUtils.text(row, "AXIS_CD", "axis_cd", "axisCd");
                String axisDir = ApiXmlUtils.text(row, "AXIS_DIR", "axis_dir", "axisDir");
                Integer linkSeq = ApiXmlUtils.integer(row, "LINK_SEQ", "link_seq", "linkSeq", "SEQ", "seq");
                String linkId = ApiXmlUtils.text(row, "LINK_ID", "link_id", "linkId");
                if (!axisCd.isBlank() && !linkId.isBlank()) {
                    result.add(new TopisAxisLinkInfo(axisCd, axisDir, linkSeq, linkId));
                }
            }
            return result;
        }

        JsonNode root = objectMapper.readTree(response);
        for (JsonNode row : ApiJsonUtils.rows(root)) {
            String axisCd = ApiJsonUtils.text(row, "AXIS_CD", "axis_cd", "axisCd");
            String axisDir = ApiJsonUtils.text(row, "AXIS_DIR", "axis_dir", "axisDir");
            Integer linkSeq = ApiJsonUtils.integer(row, "LINK_SEQ", "link_seq", "linkSeq", "SEQ", "seq");
            String linkId = ApiJsonUtils.text(row, "LINK_ID", "link_id", "linkId");
            if (!axisCd.isBlank() && !linkId.isBlank()) {
                result.add(new TopisAxisLinkInfo(axisCd, axisDir, linkSeq, linkId));
            }
        }
        return result;
    }

    List<TopisLinkVertexInfo> parseLinkVertexInfoResponse(String response) throws Exception {
        if (response == null || response.isBlank()) {
            return List.of();
        }

        List<TopisLinkVertexInfo> result = new ArrayList<>();
        if (ApiXmlUtils.isXml(response)) {
            for (Map<String, String> row : ApiXmlUtils.rows(response)) {
                TopisLinkVertexInfo vertex = linkVertexInfo(
                        ApiXmlUtils.text(row, "LINK_ID", "link_id", "linkId", "linkid"),
                        ApiXmlUtils.integer(row,
                                "VER_SEQ", "ver_seq",
                                "VERTEX_SEQ", "vertex_seq", "vertexSeq",
                                "SEQ", "seq", "VTX_SEQ", "vtx_seq", "SN", "sn"),
                        ApiXmlUtils.decimal(row,
                                "GRS80TM_X", "grs80tm_x",
                                "TMX", "tmx", "X", "x",
                                "X_CRDNT", "x_crdnt", "VERTEX_X", "vertex_x"),
                        ApiXmlUtils.decimal(row,
                                "GRS80TM_Y", "grs80tm_y",
                                "TMY", "tmy", "Y", "y",
                                "Y_CRDNT", "y_crdnt", "VERTEX_Y", "vertex_y")
                );
                if (vertex != null) {
                    result.add(vertex);
                }
            }
            return result;
        }

        JsonNode root = objectMapper.readTree(response);
        for (JsonNode row : ApiJsonUtils.rows(root)) {
            TopisLinkVertexInfo vertex = linkVertexInfo(
                    ApiJsonUtils.text(row, "LINK_ID", "link_id", "linkId", "linkid"),
                    ApiJsonUtils.integer(row,
                            "VER_SEQ", "ver_seq",
                            "VERTEX_SEQ", "vertex_seq", "vertexSeq",
                            "SEQ", "seq", "VTX_SEQ", "vtx_seq", "SN", "sn"),
                    ApiJsonUtils.decimal(row,
                            "GRS80TM_X", "grs80tm_x",
                            "TMX", "tmx", "X", "x",
                            "X_CRDNT", "x_crdnt", "VERTEX_X", "vertex_x"),
                    ApiJsonUtils.decimal(row,
                            "GRS80TM_Y", "grs80tm_y",
                            "TMY", "tmy", "Y", "y",
                            "Y_CRDNT", "y_crdnt", "VERTEX_Y", "vertex_y")
            );
            if (vertex != null) {
                result.add(vertex);
            }
        }
        return result;
    }

    Map<String, TopisLinkGeometry> parseVertexResponse(String response) throws Exception {
        if (response == null || response.isBlank()) {
            return Map.of();
        }
        return geometriesFromVertexInfos(parseLinkVertexInfoResponse(response));
    }

    private Optional<RoadSpeedSnapshot> parseSpeedXmlResponse(String response) throws Exception {
        List<Map<String, String>> rows = ApiXmlUtils.rows(response);
        if (rows.isEmpty()) {
            return Optional.empty();
        }

        Map<String, String> row = rows.get(0);
        String linkId = ApiXmlUtils.text(row, "linkId", "link_id", "LINK_ID", "linkid");
        Double speed = ApiXmlUtils.decimal(row, "speed", "SPEED", "spd", "SPD", "prcs_spd", "PRCS_SPD");
        Integer travelTime = ApiXmlUtils.integer(row,
                "travelTime", "travel_time", "TRAVEL_TIME",
                "trvl_tm", "TRVL_TM", "trvl_time", "TRVL_TIME",
                "prcs_trv_time", "PRCS_TRV_TIME");

        if (linkId.isBlank() && speed == null && travelTime == null) {
            return Optional.empty();
        }

        return Optional.of(RoadSpeedSnapshot.builder()
                .linkId(linkId)
                .speedKph(speed)
                .travelTimeSec(travelTime)
                .stale(false)
                .lastFetchedAtMs(System.currentTimeMillis())
                .build());
    }

    private TopisLinkVertexInfo linkVertexInfo(String linkId, Integer verSeq, Double grs80tmX, Double grs80tmY) {
        if (linkId == null || linkId.isBlank() || verSeq == null || grs80tmX == null || grs80tmY == null) {
            return null;
        }

        GeoPoint point = coordinateTransformService.toWgs84(grs80tmX, grs80tmY);
        return new TopisLinkVertexInfo(
                linkId,
                verSeq,
                grs80tmX,
                grs80tmY,
                point.getLat(),
                point.getLon()
        );
    }

    private Map<String, TopisLinkGeometry> geometriesFromVertexInfos(List<TopisLinkVertexInfo> vertexInfos) {
        if (vertexInfos == null || vertexInfos.isEmpty()) {
            return Map.of();
        }

        Map<String, TreeMap<Integer, GeoPoint>> grouped = new LinkedHashMap<>();
        for (TopisLinkVertexInfo vertex : vertexInfos) {
            if (vertex == null || vertex.linkId() == null || vertex.linkId().isBlank()
                    || vertex.verSeq() == null || vertex.lat() == null || vertex.lon() == null) {
                continue;
            }
            grouped.computeIfAbsent(vertex.linkId(), ignored -> new TreeMap<>())
                    .put(vertex.verSeq(), new GeoPoint(vertex.lat(), vertex.lon()));
        }

        Map<String, TopisLinkGeometry> result = new LinkedHashMap<>();
        grouped.forEach((linkId, verticesBySeq) -> result.put(linkId, TopisLinkGeometry.builder()
                .linkId(linkId)
                .vertices(new ArrayList<>(verticesBySeq.values()))
                .build()));
        return result;
    }

    private int totalCount(String response) throws Exception {
        if (ApiXmlUtils.isXml(response)) {
            return ApiXmlUtils.totalCount(response);
        }
        return ApiJsonUtils.totalCount(objectMapper.readTree(response));
    }

    private boolean isErrorResponse(String response) throws Exception {
        return errorCode(response)
                .map(code -> code.toUpperCase().startsWith("ERROR"))
                .orElse(false);
    }

    private Optional<String> errorCode(String response) throws Exception {
        if (response == null || response.isBlank()) {
            return Optional.empty();
        }
        if (ApiXmlUtils.isXml(response)) {
            return ApiXmlUtils.resultCode(response);
        }
        return ApiJsonUtils.findFirst(objectMapper.readTree(response), "CODE")
                .map(JsonNode::asText);
    }

    private URI seoulOpenApiUri(String serviceName, int start, int end, String extraPath) {
        UriComponentsBuilder builder = UriComponentsBuilder.fromHttpUrl(baseUrl)
                .pathSegment(serviceKey, normalizedResponseFormat(), serviceName, String.valueOf(start), String.valueOf(end));
        if (extraPath != null && !extraPath.isBlank()) {
            builder.pathSegment(extraPath);
        }
        return builder.build(false).toUri();
    }

    private String normalizedResponseFormat() {
        if (responseFormat == null || responseFormat.isBlank()) {
            return "xml";
        }
        return responseFormat.trim().toLowerCase();
    }

    private boolean isLinkVertexByLinkIdService() {
        return vertexServiceName != null && "LinkVerInfo".equalsIgnoreCase(vertexServiceName.trim());
    }

    @FunctionalInterface
    private interface ResponseParser<T> {
        List<T> parse(String response) throws Exception;
    }
}
