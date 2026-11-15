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


# Compact .cjson encoding: delta-encoded integers at 10**decimals.
COMPACT_DECIMALS = (5, 6, 7, 9)
def enc_line(coords, decimals=5):
    out = []; px = py = 0; scale = 10 ** decimals
    for x, y in coords:
        ix, iy = int(round(x * scale)), int(round(y * scale))
        out += [ix - px, iy - py]; px, py = ix, iy
    return out
def enc_geom(g, decimals=5):
    t = g["type"]; c = g["coordinates"]
    if t == "Polygon": return [[enc_line(r, decimals) for r in c]]
    if t == "MultiPolygon": return [[enc_line(r, decimals) for r in p] for p in c]
    if t == "LineString": return [enc_line(c, decimals)]
    if t == "MultiLineString": return [enc_line(l, decimals) for l in c]
    raise ValueError(t)
def compact_scale(feats):
    # serialize_geometry may keep more than 5 decimals for a shape that rounding would break;
    # the collection then uses the smallest integer scale at which every decoded shape stays valid.
    for decimals in COMPACT_DECIMALS:
        if all(compact_valid(f["geometry"], decimals) for f in feats): return decimals
    raise ValueError("No compact scale keeps every geometry valid")
def compact_valid(g, decimals):
    scale = 10 ** decimals
    def dec(values):
        x = y = 0; out = []
        for i in range(0, len(values), 2): x += values[i]; y += values[i + 1]; out.append([x / scale, y / scale])
        return out
    e = enc_geom(g, decimals); t = g["type"]
    if t in ("Polygon", "MultiPolygon"): coords = [[dec(r) for r in p] for p in e]; kind = "MultiPolygon"
    else: coords = [dec(l) for l in e]; kind = "MultiLineString"
    decoded = shape({"type": kind, "coordinates": coords})
    return not decoded.is_empty and decoded.is_valid
