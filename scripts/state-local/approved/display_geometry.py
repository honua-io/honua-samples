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
