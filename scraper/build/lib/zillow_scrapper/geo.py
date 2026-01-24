from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class BBox:
    west: float
    south: float
    east: float
    north: float


def bbox_around_point(*, lat: float, lon: float, radius_miles: float) -> BBox:
    """
    Approximate a bounding box around a point for a radius in miles.
    Good enough for map-bounds search filtering.
    """
    miles_per_degree_lat = 69.0
    delta_lat = radius_miles / miles_per_degree_lat

    # Longitude degrees vary by latitude
    miles_per_degree_lon = miles_per_degree_lat * math.cos(math.radians(lat))
    if miles_per_degree_lon == 0:
        miles_per_degree_lon = 0.00001
    delta_lon = radius_miles / miles_per_degree_lon

    return BBox(
        west=lon - delta_lon,
        south=lat - delta_lat,
        east=lon + delta_lon,
        north=lat + delta_lat,
    )


def haversine_miles(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 3958.7613  # Earth radius in miles
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)

    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c

