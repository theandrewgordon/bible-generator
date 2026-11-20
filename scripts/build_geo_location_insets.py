"""Generate Find It on the Map close-ups from Natural Earth Admin 0 (1:10m).

Usage: python scripts/build_geo_location_insets.py /path/to/ne_10m_admin_0_countries.shp
Dependencies: pyshp, shapely. See docs/geo-location-insets.md for provenance.
"""
import argparse
import json
import math
from itertools import combinations
from pathlib import Path

import shapefile
from shapely import make_valid
from shapely.geometry import Polygon, box
from shapely.ops import transform, unary_union

WIDTH, HEIGHT = 800, 620

# The groups also define a fair neighborhood of distractors. Countries with
# widely separated principal islands use independent local close-ups.
GROUPS = {
    "Lesser Antilles": {"028": "Antigua and Barbuda", "052": "Barbados", "212": "Dominica", "308": "Grenada", "659": "Saint Kitts and Nevis", "662": "Saint Lucia", "670": "Saint Vincent and the Grenadines", "780": "Trinidad and Tobago"},
    "Greater Antilles and the Bahamas": {"044": "Bahamas", "192": "Cuba", "214": "Dominican Republic", "332": "Haiti", "388": "Jamaica"},
    "Central America": {"084": "Belize", "188": "Costa Rica", "222": "El Salvador"},
    "Pacific islands": {"242": "Fiji", "296": "Kiribati", "584": "Marshall Islands", "583": "Micronesia", "520": "Nauru", "585": "Palau", "882": "Samoa", "090": "Solomon Islands", "776": "Tonga", "798": "Tuvalu", "548": "Vanuatu"},
    "Indian Ocean islands": {"174": "Comoros", "480": "Mauritius", "690": "Seychelles", "462": "Maldives"},
    "South and Southeast Asia": {"064": "Bhutan", "096": "Brunei", "702": "Singapore", "144": "Sri Lanka", "626": "Timor-Leste"},
    "West Asia": {"051": "Armenia", "048": "Bahrain", "376": "Israel", "414": "Kuwait", "422": "Lebanon", "275": "Palestine", "634": "Qatar"},
    "West and Central Africa": {"132": "Cape Verde", "226": "Equatorial Guinea", "270": "Gambia", "624": "Guinea-Bissau", "678": "São Tomé and Príncipe"},
    "Eastern and Southern Africa": {"108": "Burundi", "262": "Djibouti", "748": "Eswatini", "426": "Lesotho", "646": "Rwanda"},
    "Mediterranean": {"196": "Cyprus", "470": "Malta", "499": "Montenegro"},
    "Europe detail maps": {"020": "Andorra", "438": "Liechtenstein", "442": "Luxembourg", "492": "Monaco", "674": "San Marino", "336": "Vatican City"},
}
SHARED = {"Lesser Antilles", "Greater Antilles and the Bahamas"}
ROOT = Path(__file__).resolve().parents[1]


def polygons(geometry):
    if isinstance(geometry, Polygon):
        if not geometry.is_empty:
            yield geometry
    else:
        for part in getattr(geometry, "geoms", ()):
            yield from polygons(part)


def source_polygons(shape):
    # Natural Earth's exterior SHP rings are clockwise. Ring validation
    # retains genuine enclaves and handles small multipart coastlines.
    from shapely.geometry import shape as read_geometry
    return list(polygons(make_valid(read_geometry(shape.__geo_interface__))))


def projection(lon, lat):
    cos_lat = math.cos(math.radians(lat))

    def project(x, y, z=None):
        return ((x - lon + 180) % 360 - 180) * cos_lat, y - lat

    return project


def widest(bounds):
    x0, y0, x1, y1 = bounds
    return max(x1 - x0, (y1 - y0) * WIDTH / HEIGHT)


def neighborhood(sources, lon, lat, project, rect):
    window = box(*rect)
    output = {}
    for code, country, west, south, east, north in sources:
        if lat + rect[3] < south or lat + rect[1] > north:
            continue
        longitudes = [(west - lon + 180) % 360 - 180, (east - lon + 180) % 360 - 180]
        if longitudes[0] <= longitudes[1] and east - west < 180:
            factor = math.cos(math.radians(lat))
            if longitudes[1] * factor < rect[0] or longitudes[0] * factor > rect[2]:
                continue
        clipped = []
        for ring in country:
            # Unwrap each polygon about the map center. Parts straddling the
            # opposite meridian cannot appear in this local view.
            if abs((ring.centroid.x - lon + 180) % 360 - 180) > 90:
                continue
            projected = transform(project, ring)
            if projected.intersects(window):
                clipped.extend(polygons(make_valid(projected).intersection(window)))
        if clipped:
            output.setdefault(code, []).extend(clipped)
    return output


def format_map(sources, lon, lat, main, bounds, codes):
    project = projection(lon, lat)
    x0, y0, x1, y1 = bounds
    width = widest(bounds)
    height = width * HEIGHT / WIDTH
    left, north = (x0 + x1 - width) / 2, (y0 + y1 + height) / 2
    rect = left, north - height, left + width, north
    units = WIDTH / width
    entries = neighborhood(sources, lon, lat, project, rect)

    def xy(x, y):
        return round((x - left) * units, 2), round((north - y) * units, 2)

    def path(polys):
        return "".join(
            "M" + "L".join(f"{x:g},{y:g}" for x, y in map(lambda p: xy(*p), ring.coords[:-1])) + "Z"
            for poly in polys for ring in (poly.exterior, *poly.interiors)
        )

    # Generalize at a fraction of one SVG unit; keep even small distinct
    # components. This is coastline simplification, with no island inflation.
    paths = {}
    for code, parts in entries.items():
        kept = [item.simplify(.32 / units, preserve_topology=True) for item in parts if item.area * units**2 > .07]
        if kept:
            paths[code] = path(kept)
    points = {}
    for code in codes:
        anchor = main[code].representative_point()
        points[code] = [code, *xy(anchor.x, anchor.y)]
        if not paths.get(code):
            raise ValueError(f"Missing rendered geography for {code}")
    return {"widthKm": round(width * 111.195, 2), "paths": paths, "points": points}


def main(source):
    reader = shapefile.Reader(source)
    wanted = {code for group in GROUPS.values() for code in group}
    shapes, sources = {}, []
    for entry in reader.iterShapeRecords():
        record = entry.record
        # The ISO fallback assigns the same code to France and Clipperton;
        # keep non-country/disputed units as separate context geometry.
        code = record["ISO_N3_EH"]
        if code == "-99" or record["ADM0_A3"] == "CLP":
            code = record["ADM0_A3"]
        parts = source_polygons(entry.shape)
        sources.append((code, parts, *entry.shape.bbox))
        if code in wanted:
            shapes[code] = sorted(parts, key=lambda part: part.area, reverse=True)
    assert wanted == shapes.keys(), sorted(wanted - shapes.keys())
    output = {}
    for region, names in GROUPS.items():
        for code, name in names.items():
            center = shapes[code][0].centroid
            lon, lat = center.x, center.y
            project = projection(lon, lat)
            main_parts = {key: transform(project, shapes[key][0]) for key in names}
            nearby = sorted((key for key in names if key != code), key=lambda key: main_parts[key].centroid.distance(main_parts[code].centroid))
            data = {"label": region, "nearby": [names[key] for key in nearby], "code": code, "center": [round(lon, 4), round(lat, 4)]}
            largest = main_parts[code]
            # Include the whole country when its principal islands all fit at
            # useful scale. Cartographically dispersed countries get a local
            # window around the largest landform; nearby components stay intact.
            complete = unary_union([transform(project, part) for part in shapes[code]])
            spread = widest(complete.bounds) > 5 * widest(largest.bounds)
            subject = largest if spread else complete
            x0, y0, x1, y1 = subject.bounds
            margin = widest(subject.bounds) * (.65 if spread else .38)
            data["detail"] = format_map(sources, lon, lat, main_parts, (x0-margin, y0-margin, x1+margin, y1+margin), [code])
            if spread:
                # A second disclosed view shows all country components across
                # the extent of the archipelago, with dateline unwrapping.
                x0, y0, x1, y1 = complete.bounds
                margin = widest(complete.bounds) * .12
                data["overview"] = format_map(sources, lon, lat, main_parts, (x0-margin, y0-margin, x1+margin, y1+margin), [code])
            if region in SHARED:
                best = None
                for pair in combinations(nearby, 2):
                    chosen = [code, *pair]
                    subjects = [main_parts[key] if key == "044" else unary_union([transform(project, part) for part in shapes[key]]) for key in chosen]
                    bounds = unary_union(subjects).bounds
                    x0, y0, x1, y1 = bounds
                    margin = widest(bounds) * .09
                    chart_bounds = x0-margin, y0-margin, x1+margin, y1+margin
                    chart_width = widest(chart_bounds)
                    smallest = min(widest(main_parts[key].bounds) / chart_width * WIDTH for key in chosen)
                    if smallest >= 32 and (best is None or chart_width < best[0]):
                        best = chart_width, chosen, chart_bounds
                if best:
                    _, chosen, chart_bounds = best
                    data["shared"] = format_map(sources, lon, lat, main_parts, chart_bounds, chosen)
                    data["nearby"] = [names[key] for key in chosen[1:]]
            output[name] = data
    (ROOT / "frontend/learning-labs/geo/location-insets.json").write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n")


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("source")
    main(cli.parse_args().source)
