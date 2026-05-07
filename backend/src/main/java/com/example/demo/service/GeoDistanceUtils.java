package com.example.demo.service;

import com.example.demo.model.context.GeoPoint;

import java.util.List;

final class GeoDistanceUtils {

    private static final double EARTH_RADIUS_M = 6_371_000.0;
    private static final double METERS_PER_DEGREE_LAT = 111_320.0;

    private GeoDistanceUtils() {
    }

    static double haversineMeters(GeoPoint a, GeoPoint b) {
        double dLat = Math.toRadians(b.getLat() - a.getLat());
        double dLon = Math.toRadians(b.getLon() - a.getLon());
        double lat1 = Math.toRadians(a.getLat());
        double lat2 = Math.toRadians(b.getLat());
        double h = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(lat1) * Math.cos(lat2)
                * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
    }

    static double distanceToPolylineMeters(GeoPoint point, List<GeoPoint> vertices) {
        if (vertices == null || vertices.isEmpty()) {
            return Double.MAX_VALUE;
        }
        if (vertices.size() == 1) {
            return haversineMeters(point, vertices.get(0));
        }

        double best = Double.MAX_VALUE;
        for (int i = 0; i < vertices.size() - 1; i++) {
            best = Math.min(best, pointToSegmentMeters(point, vertices.get(i), vertices.get(i + 1)));
        }
        return best;
    }

    private static double pointToSegmentMeters(GeoPoint point, GeoPoint start, GeoPoint end) {
        double metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos(Math.toRadians(point.getLat()));

        double px = point.getLon() * metersPerDegreeLon;
        double py = point.getLat() * METERS_PER_DEGREE_LAT;
        double ax = start.getLon() * metersPerDegreeLon;
        double ay = start.getLat() * METERS_PER_DEGREE_LAT;
        double bx = end.getLon() * metersPerDegreeLon;
        double by = end.getLat() * METERS_PER_DEGREE_LAT;

        double dx = bx - ax;
        double dy = by - ay;
        if (dx == 0 && dy == 0) {
            return Math.hypot(px - ax, py - ay);
        }

        double t = ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy);
        t = Math.max(0, Math.min(1, t));
        double closestX = ax + t * dx;
        double closestY = ay + t * dy;
        return Math.hypot(px - closestX, py - closestY);
    }
}
