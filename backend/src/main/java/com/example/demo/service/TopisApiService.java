package com.example.demo.service;

import com.example.demo.model.context.GeoPoint;
import com.example.demo.model.context.RoadSpeedSnapshot;
import com.example.demo.model.context.TopisLinkGeometry;
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

    @Value("${topis.api.vertex-service-name:LinkVertex}")
    private String vertexServiceName;

    @Value("${topis.api.response-format:xml}")
    private String responseFormat;

    @Value("${topis.api.page-size:1000}")
    private int pageSize;

    @Value("${topis.api.vertex-max-pages:50}")
    private int vertexMaxPages;

    @Value("${topis.link-vertex.file:classpath:data/topis-link-vertex-2025.xlsx}")
    private String linkVertexFile;

    @Value("${topis.link-vertex.prefer-file:true}")
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
        return localLinkVertexResource().isPresent() || isConfigured();
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
        return parseSpeedResponse(response);
    }

    public Map<String, TopisLinkGeometry> fetchAllLinkGeometries() throws Exception {
        Optional<Map<String, TopisLinkGeometry>> fileGeometries = fetchLocalLinkGeometries();
        if (preferLinkVertexFile && fileGeometries.isPresent()) {
            return fileGeometries.get();
        }

        if (!isConfigured()) {
            if (fileGeometries.isPresent()) {
                return fileGeometries.get();
            }
            throw new IllegalStateException("TOPIS service key is not configured");
        }

        Map<String, TopisLinkGeometry> apiGeometries = fetchApiLinkGeometries();
        if (!apiGeometries.isEmpty()) {
            return apiGeometries;
        }
        return fileGeometries.orElse(apiGeometries);
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

    Map<String, TopisLinkGeometry> parseVertexResponse(String response) throws Exception {
        if (response == null || response.isBlank()) {
            return Map.of();
        }
        if (ApiXmlUtils.isXml(response)) {
            return parseVertexXmlResponse(response);
        }

        JsonNode root = objectMapper.readTree(response);
        Map<String, TreeMap<Integer, GeoPoint>> grouped = new LinkedHashMap<>();

        for (JsonNode row : ApiJsonUtils.rows(root)) {
            String linkId = ApiJsonUtils.text(row, "linkId", "link_id", "LINK_ID", "linkid");
            Integer sequence = ApiJsonUtils.integer(row,
                    "vertexSeq", "vertex_seq", "VERTEX_SEQ", "seq", "SEQ", "vtx_seq", "VTX_SEQ", "sn", "SN");
            Double tmx = ApiJsonUtils.decimal(row, "tmx", "TMX", "x", "X", "x_crdnt", "X_CRDNT", "vertex_x", "VERTEX_X");
            Double tmy = ApiJsonUtils.decimal(row, "tmy", "TMY", "y", "Y", "y_crdnt", "Y_CRDNT", "vertex_y", "VERTEX_Y");

            if (linkId.isBlank() || sequence == null || tmx == null || tmy == null) {
                continue;
            }

            grouped.computeIfAbsent(linkId, ignored -> new TreeMap<>())
                    .put(sequence, coordinateTransformService.toWgs84(tmx, tmy));
        }

        Map<String, TopisLinkGeometry> result = new LinkedHashMap<>();
        grouped.forEach((linkId, verticesBySeq) -> {
            List<GeoPoint> vertices = new ArrayList<>(verticesBySeq.values());
            result.put(linkId, TopisLinkGeometry.builder()
                    .linkId(linkId)
                    .vertices(vertices)
                    .build());
        });
        return result;
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

    private Map<String, TopisLinkGeometry> parseVertexXmlResponse(String response) throws Exception {
        Map<String, TreeMap<Integer, GeoPoint>> grouped = new LinkedHashMap<>();

        for (Map<String, String> row : ApiXmlUtils.rows(response)) {
            String linkId = ApiXmlUtils.text(row, "linkId", "link_id", "LINK_ID", "linkid");
            Integer sequence = ApiXmlUtils.integer(row,
                    "vertexSeq", "vertex_seq", "VERTEX_SEQ", "seq", "SEQ", "vtx_seq", "VTX_SEQ", "sn", "SN");
            Double tmx = ApiXmlUtils.decimal(row, "tmx", "TMX", "x", "X", "x_crdnt", "X_CRDNT", "vertex_x", "VERTEX_X");
            Double tmy = ApiXmlUtils.decimal(row, "tmy", "TMY", "y", "Y", "y_crdnt", "Y_CRDNT", "vertex_y", "VERTEX_Y");

            if (linkId.isBlank() || sequence == null || tmx == null || tmy == null) {
                continue;
            }

            grouped.computeIfAbsent(linkId, ignored -> new TreeMap<>())
                    .put(sequence, coordinateTransformService.toWgs84(tmx, tmy));
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
}
