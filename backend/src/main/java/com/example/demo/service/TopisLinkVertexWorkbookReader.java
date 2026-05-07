package com.example.demo.service;

import com.example.demo.model.context.GeoPoint;
import com.example.demo.model.context.TopisLinkGeometry;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.io.StringReader;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

final class TopisLinkVertexWorkbookReader {

    private static final String SHEET_ENTRY = "xl/worksheets/sheet1.xml";
    private static final String SHARED_STRINGS_ENTRY = "xl/sharedStrings.xml";

    private TopisLinkVertexWorkbookReader() {
    }

    static Map<String, TopisLinkGeometry> read(
            InputStream workbookStream,
            CoordinateTransformService coordinateTransformService
    ) throws Exception {
        byte[] workbookBytes = workbookStream.readAllBytes();
        List<String> sharedStrings = readSharedStrings(workbookBytes);
        byte[] sheetXml = zipEntry(workbookBytes, SHEET_ENTRY)
                .orElseThrow(() -> new IllegalArgumentException("Workbook does not contain " + SHEET_ENTRY));

        Document sheet = document(sheetXml);
        NodeList rowNodes = sheet.getElementsByTagNameNS("*", "row");
        Map<String, TreeMap<Integer, GeoPoint>> grouped = new LinkedHashMap<>();
        Map<String, String> headerColumns = null;

        for (int i = 0; i < rowNodes.getLength(); i++) {
            Element row = (Element) rowNodes.item(i);
            Map<String, String> cellsByColumn = cellsByColumn(row, sharedStrings);

            if (headerColumns == null) {
                headerColumns = headerColumns(cellsByColumn);
                if (!hasRequiredHeaders(headerColumns)) {
                    headerColumns = null;
                }
                continue;
            }

            String linkId = value(cellsByColumn, headerColumns, "LINK_ID", "LINKID");
            Integer sequence = integer(value(cellsByColumn, headerColumns, "VER_SEQ", "VERTEX_SEQ", "SEQ"));
            Double x = decimal(value(cellsByColumn, headerColumns, "GRS80TM_X", "TMX", "X"));
            Double y = decimal(value(cellsByColumn, headerColumns, "GRS80TM_Y", "TMY", "Y"));

            if (linkId.isBlank() || sequence == null || x == null || y == null) {
                continue;
            }

            grouped.computeIfAbsent(linkId, ignored -> new TreeMap<>())
                    .put(sequence, coordinateTransformService.toWgs84(x, y));
        }

        Map<String, TopisLinkGeometry> result = new LinkedHashMap<>();
        grouped.forEach((linkId, verticesBySequence) -> {
            List<GeoPoint> vertices = new ArrayList<>(verticesBySequence.values());
            if (vertices.size() >= 2) {
                result.put(linkId, TopisLinkGeometry.builder()
                        .linkId(linkId)
                        .vertices(vertices)
                        .build());
            }
        });
        return result;
    }

    private static List<String> readSharedStrings(byte[] workbookBytes) throws Exception {
        Optional<byte[]> sharedStringsXml = zipEntry(workbookBytes, SHARED_STRINGS_ENTRY);
        if (sharedStringsXml.isEmpty()) {
            return List.of();
        }

        Document document = document(sharedStringsXml.get());
        NodeList stringNodes = document.getElementsByTagNameNS("*", "si");
        List<String> sharedStrings = new ArrayList<>();

        for (int i = 0; i < stringNodes.getLength(); i++) {
            Element stringNode = (Element) stringNodes.item(i);
            NodeList textNodes = stringNode.getElementsByTagNameNS("*", "t");
            StringBuilder value = new StringBuilder();
            for (int j = 0; j < textNodes.getLength(); j++) {
                value.append(textNodes.item(j).getTextContent());
            }
            sharedStrings.add(value.toString());
        }

        return sharedStrings;
    }

    private static Optional<byte[]> zipEntry(byte[] workbookBytes, String entryName) throws Exception {
        try (ZipInputStream zipInputStream = new ZipInputStream(new ByteArrayInputStream(workbookBytes))) {
            ZipEntry entry;
            while ((entry = zipInputStream.getNextEntry()) != null) {
                if (entryName.equals(entry.getName())) {
                    return Optional.of(zipInputStream.readAllBytes());
                }
            }
        }
        return Optional.empty();
    }

    private static Map<String, String> cellsByColumn(Element row, List<String> sharedStrings) {
        Map<String, String> cells = new LinkedHashMap<>();
        NodeList cellNodes = row.getElementsByTagNameNS("*", "c");

        for (int i = 0; i < cellNodes.getLength(); i++) {
            Element cell = (Element) cellNodes.item(i);
            String column = columnName(cell.getAttribute("r"));
            if (column.isBlank()) {
                continue;
            }
            cells.put(column, cellValue(cell, sharedStrings));
        }

        return cells;
    }

    private static String cellValue(Element cell, List<String> sharedStrings) {
        String type = cell.getAttribute("t");
        if ("inlineStr".equals(type)) {
            return textFromDescendants(cell, "t");
        }

        String rawValue = firstDescendantText(cell, "v");
        if ("s".equals(type)) {
            Integer sharedStringIndex = integer(rawValue);
            if (sharedStringIndex == null || sharedStringIndex < 0 || sharedStringIndex >= sharedStrings.size()) {
                return "";
            }
            return sharedStrings.get(sharedStringIndex).trim();
        }
        return rawValue.trim();
    }

    private static Map<String, String> headerColumns(Map<String, String> cellsByColumn) {
        Map<String, String> headers = new HashMap<>();
        cellsByColumn.forEach((column, header) -> headers.put(normalize(header), column));
        return headers;
    }

    private static boolean hasRequiredHeaders(Map<String, String> headers) {
        return column(headers, "LINK_ID", "LINKID").isPresent()
                && column(headers, "VER_SEQ", "VERTEX_SEQ", "SEQ").isPresent()
                && column(headers, "GRS80TM_X", "TMX", "X").isPresent()
                && column(headers, "GRS80TM_Y", "TMY", "Y").isPresent();
    }

    private static String value(Map<String, String> cellsByColumn, Map<String, String> headerColumns, String... headers) {
        return column(headerColumns, headers)
                .map(column -> cellsByColumn.getOrDefault(column, ""))
                .orElse("")
                .trim();
    }

    private static Optional<String> column(Map<String, String> headerColumns, String... headers) {
        for (String header : headers) {
            String column = headerColumns.get(normalize(header));
            if (column != null) {
                return Optional.of(column);
            }
        }
        return Optional.empty();
    }

    private static String columnName(String cellReference) {
        if (cellReference == null || cellReference.isBlank()) {
            return "";
        }

        StringBuilder column = new StringBuilder();
        for (int i = 0; i < cellReference.length(); i++) {
            char current = cellReference.charAt(i);
            if (!Character.isLetter(current)) {
                break;
            }
            column.append(Character.toUpperCase(current));
        }
        return column.toString();
    }

    private static String firstDescendantText(Element element, String localName) {
        NodeList nodes = element.getElementsByTagNameNS("*", localName);
        if (nodes.getLength() == 0) {
            return "";
        }
        return nodes.item(0).getTextContent();
    }

    private static String textFromDescendants(Element element, String localName) {
        NodeList nodes = element.getElementsByTagNameNS("*", localName);
        StringBuilder value = new StringBuilder();
        for (int i = 0; i < nodes.getLength(); i++) {
            Node node = nodes.item(i);
            value.append(node.getTextContent());
        }
        return value.toString().trim();
    }

    private static Integer integer(String value) {
        Double parsed = decimal(value);
        return parsed == null ? null : parsed.intValue();
    }

    private static Double decimal(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }

        try {
            return Double.parseDouble(value.replace(",", "").trim());
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    private static Document document(byte[] xml) throws Exception {
        return document(new String(xml, StandardCharsets.UTF_8));
    }

    private static Document document(String xml) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);
        return factory.newDocumentBuilder()
                .parse(new InputSource(new StringReader(xml)));
    }

    private static String normalize(String value) {
        return value == null ? "" : value.replaceAll("\\s+", "").toUpperCase(Locale.ROOT);
    }
}
