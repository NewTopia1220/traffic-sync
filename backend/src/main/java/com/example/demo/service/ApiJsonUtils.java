package com.example.demo.service;

import com.fasterxml.jackson.databind.JsonNode;

import java.util.ArrayList;
import java.util.Collections;
import java.util.Iterator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;

final class ApiJsonUtils {

    private ApiJsonUtils() {
    }

    static List<JsonNode> rows(JsonNode root) {
        Optional<JsonNode> row = findFirst(root, "row");
        if (row.isPresent()) {
            return toList(row.get());
        }

        Optional<JsonNode> item = findFirst(root, "item");
        return item.map(ApiJsonUtils::toList).orElseGet(Collections::emptyList);
    }

    static Optional<JsonNode> findFirst(JsonNode root, String fieldName) {
        if (root == null || root.isMissingNode() || root.isNull()) {
            return Optional.empty();
        }

        if (root.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> fields = root.fields();
            while (fields.hasNext()) {
                Map.Entry<String, JsonNode> field = fields.next();
                if (field.getKey().equalsIgnoreCase(fieldName)) {
                    return Optional.of(field.getValue());
                }
            }

            fields = root.fields();
            while (fields.hasNext()) {
                Optional<JsonNode> nested = findFirst(fields.next().getValue(), fieldName);
                if (nested.isPresent()) {
                    return nested;
                }
            }
        }

        if (root.isArray()) {
            for (JsonNode child : root) {
                Optional<JsonNode> nested = findFirst(child, fieldName);
                if (nested.isPresent()) {
                    return nested;
                }
            }
        }

        return Optional.empty();
    }

    static String text(JsonNode node, String... names) {
        if (node == null) {
            return "";
        }
        for (String name : names) {
            JsonNode value = child(node, name);
            if (!value.isMissingNode() && !value.isNull()) {
                return value.asText("").trim();
            }
        }
        return "";
    }

    static Double decimal(JsonNode node, String... names) {
        String text = text(node, names);
        if (text.isBlank()) {
            return null;
        }
        if (text.contains("없음")) {
            return 0.0;
        }
        try {
            return Double.parseDouble(text.replace(",", ""));
        } catch (NumberFormatException ignored) {
            return null;
        }
    }

    static Integer integer(JsonNode node, String... names) {
        Double value = decimal(node, names);
        return value == null ? null : value.intValue();
    }

    static int totalCount(JsonNode root) {
        Optional<JsonNode> count = findFirst(root, "list_total_count");
        if (count.isEmpty()) {
            count = findFirst(root, "totalCount");
        }
        return count.map(JsonNode::asInt).orElse(0);
    }

    private static JsonNode child(JsonNode node, String name) {
        JsonNode exact = node.path(name);
        if (!exact.isMissingNode()) {
            return exact;
        }

        if (!node.isObject()) {
            return exact;
        }

        String lowerName = name.toLowerCase(Locale.ROOT);
        Iterator<Map.Entry<String, JsonNode>> fields = node.fields();
        while (fields.hasNext()) {
            Map.Entry<String, JsonNode> field = fields.next();
            if (field.getKey().toLowerCase(Locale.ROOT).equals(lowerName)) {
                return field.getValue();
            }
        }
        return exact;
    }

    private static List<JsonNode> toList(JsonNode node) {
        if (node.isArray()) {
            List<JsonNode> values = new ArrayList<>();
            node.forEach(values::add);
            return values;
        }
        if (node.isObject()) {
            return List.of(node);
        }
        return Collections.emptyList();
    }
}
