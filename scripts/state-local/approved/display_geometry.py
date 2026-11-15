from shapely.geometry import mapping, shape
from shapely.validation import explain_validity


DISPLAY_DECIMALS = 5
# Rounding can pinch a valid source ring into a self-intersection or collapse a sliver. Such a
# feature keeps more precision instead of being snapped or repaired, so its boundary never moves.
FALLBACK_DECIMALS = (6, 7)


def round_coordinates(value, decimals=DISPLAY_DECIMALS):
    if isinstance(value, float):
        return round(value, decimals) if decimals is not None else value
    if isinstance(value, (list, tuple)):
        return [round_coordinates(component, decimals) for component in value]
    return value


def _valid(output):
    rounded = shape(output)
    return not rounded.is_empty and rounded.is_valid


def serialize_geometry(geometry):
    if geometry.is_empty or not geometry.is_valid:
        raise ValueError(f"Invalid display geometry before rounding: {explain_validity(geometry)}")
    mapped = mapping(geometry)
    for decimals in (DISPLAY_DECIMALS, *FALLBACK_DECIMALS, None):
        output = {"type": mapped["type"], "coordinates": round_coordinates(mapped["coordinates"], decimals)}
        if _valid(output):
            return output
    raise ValueError(f"Invalid display geometry at full precision: {explain_validity(shape(output))}")


# Compact .cjson encoding: delta-encoded integers at 10**decimals. A collection uses the smallest
# scale at which every decoded shape is valid; readers default to DISPLAY_DECIMALS when "s" is absent.
COMPACT_DECIMALS = (DISPLAY_DECIMALS, *FALLBACK_DECIMALS, 9)


def encode_line(coordinates, decimals=DISPLAY_DECIMALS):
    scale = 10 ** decimals
    values = []
    previous_x = previous_y = 0
    for x, y in coordinates:
        scaled_x, scaled_y = int(round(x * scale)), int(round(y * scale))
        values += [scaled_x - previous_x, scaled_y - previous_y]
        previous_x, previous_y = scaled_x, scaled_y
    return values


def encode_geometry(geometry, decimals=DISPLAY_DECIMALS):
    kind, coordinates = geometry["type"], geometry["coordinates"]
    if kind == "Polygon":
        return [[encode_line(ring, decimals) for ring in coordinates]]
    if kind == "MultiPolygon":
        return [[encode_line(ring, decimals) for ring in polygon] for polygon in coordinates]
    if kind == "LineString":
        return [encode_line(coordinates, decimals)]
    if kind == "MultiLineString":
        return [encode_line(line, decimals) for line in coordinates]
    raise ValueError(kind)


def decode_line(values, decimals=DISPLAY_DECIMALS):
    scale = 10 ** decimals
    x = y = 0
    result = []
    for index in range(0, len(values), 2):
        x += values[index]
        y += values[index + 1]
        result.append([x / scale, y / scale])
    return result


def decode_geometry(encoded, polygonal, decimals=DISPLAY_DECIMALS):
    if polygonal:
        coordinates = [[decode_line(ring, decimals) for ring in polygon] for polygon in encoded]
        kind = "Polygon" if len(encoded) == 1 else "MultiPolygon"
    else:
        coordinates = [decode_line(line, decimals) for line in encoded]
        kind = "LineString" if len(encoded) == 1 else "MultiLineString"
    return {"type": kind, "coordinates": coordinates[0] if len(encoded) == 1 else coordinates}


def compact_scale(features):
    for decimals in COMPACT_DECIMALS:
        if all(_compact_valid(feature["geometry"], decimals) for feature in features):
            return decimals
    raise ValueError("No compact scale keeps every geometry valid")


def _compact_valid(geometry, decimals):
    polygonal = geometry["type"] in ("Polygon", "MultiPolygon")
    decoded = shape(decode_geometry(encode_geometry(geometry, decimals), polygonal, decimals))
    return not decoded.is_empty and decoded.is_valid
