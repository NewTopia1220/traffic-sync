package com.example.demo.service;

import com.example.demo.model.context.GeoPoint;
import org.locationtech.proj4j.CRSFactory;
import org.locationtech.proj4j.CoordinateReferenceSystem;
import org.locationtech.proj4j.CoordinateTransform;
import org.locationtech.proj4j.CoordinateTransformFactory;
import org.locationtech.proj4j.ProjCoordinate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

@Service
public class CoordinateTransformService {

    private final CoordinateTransform transform;

    public CoordinateTransformService(
            @Value("${topis.vertex.source-proj4:+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +units=m +no_defs}") String sourceProj4
    ) {
        CRSFactory crsFactory = new CRSFactory();
        CoordinateReferenceSystem source = crsFactory.createFromParameters("topis-tm", sourceProj4);
        CoordinateReferenceSystem wgs84 = crsFactory.createFromParameters("wgs84", "+proj=longlat +datum=WGS84 +no_defs");
        this.transform = new CoordinateTransformFactory().createTransform(source, wgs84);
    }

    public GeoPoint toWgs84(double x, double y) {
        if (x >= 120 && x <= 140 && y >= 30 && y <= 45) {
            return new GeoPoint(y, x);
        }

        ProjCoordinate source = new ProjCoordinate(x, y);
        ProjCoordinate target = new ProjCoordinate();
        transform.transform(source, target);
        return new GeoPoint(target.y, target.x);
    }
}
