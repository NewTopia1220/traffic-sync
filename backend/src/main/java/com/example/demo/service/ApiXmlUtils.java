package com.example.demo.service;

import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

final class ApiXmlUtils {

    private ApiXmlUtils() {
    }

    static boolean isXml(String response) {
        return response != null && response.stripLeading().startsWith("<");
    }

    static List<Map<String, String>> rows(String xml) throws Exception {
        if (xml == null || xml.isBlank()) {
            return List.of();
        }

        Document document = document(xml);
        NodeList rowNodes = document.getElementsByTagName("row");
        List<Map<String, String>> rows = new ArrayList<>();

        for (int i = 0; i < rowNodes.getLength(); i++) {
            Node rowNode = rowNodes.item(i);
            Map<String, String> row = new LinkedHashMap<>();
            NodeList children = rowNode.getChildNodes();

            for (int j = 0; j < children.getLength(); j++) {
                Node child = children.item(j);
                if (child.getNodeType() != Node.ELEMENT_NODE) {
                    continue;
                }

                Element element = (Element) child;
                row.put(normalize(element.getTagName()), element.getTextContent().trim());
            }

            if (!row.isEmpty()) {
                rows.add(row);
            }
        }

        return rows;
    }

    static int totalCount(String xml) throws Exception {
        return integer(document(xml).getDocumentElement(), "list_total_count", "totalCount")
                .orElse(0);
    }

    static Optional<String> resultCode(String xml) throws Exception {
        return text(document(xml).getDocumentElement(), "CODE", "code");
    }

    static String text(Map<String, String> row, String... names) {
        if (row == null || row.isEmpty()) {
            return "";
        }

        for (String name : names) {
            String value = row.get(normalize(name));
            if (value != null) {
                return value.trim();
            }
        }
        return "";
    }

    static Double decimal(Map<String, String> row, String... names) {
        return parseDecimal(text(row, names)).orElse(null);
    }

    static Integer integer(Map<String, String> row, String... names) {
        Double value = decimal(row, names);
        return value == null ? null : value.intValue();
    }

    private static Optional<String> text(Element root, String... names) {
        for (String name : names) {
            NodeList nodes = root.getElementsByTagName(name);
            if (nodes.getLength() > 0) {
                return Optional.ofNullable(nodes.item(0).getTextContent()).map(String::trim);
            }
        }
        return Optional.empty();
    }

    private static Optional<Integer> integer(Element root, String... names) {
        return text(root, names)
                .flatMap(ApiXmlUtils::parseDecimal)
                .map(Double::intValue);
    }

    private static Optional<Double> parseDecimal(String value) {
        if (value == null || value.isBlank()) {
            return Optional.empty();
        }
        try {
            return Optional.of(Double.parseDouble(value.replace(",", "").trim()));
        } catch (NumberFormatException ignored) {
            return Optional.empty();
        }
    }

    private static Document document(String xml) throws Exception {
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        factory.setFeature("http://xml.org/sax/features/external-general-entities", false);
        factory.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        factory.setXIncludeAware(false);
        factory.setExpandEntityReferences(false);

        return factory.newDocumentBuilder()
                .parse(new InputSource(new StringReader(xml)));
    }

    private static String normalize(String value) {
        return value == null ? "" : value.toLowerCase(Locale.ROOT);
    }
}
