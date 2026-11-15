from shapely.geometry import mapping, shape
from shapely.validation import explain_validity


DISPLAY_DECIMALS = 5


def round_coordinates(value):
    if isinstance(value, float):
        return round(value, DISPLAY_DECIMALS)
    if isinstance(value, (list, tuple)):
        return [round_coordinates(component) for component in value]
    return value


def serialize_geometry(geometry):
    mapped = mapping(geometry)
    output = {
        "type": mapped["type"],
        "coordinates": round_coordinates(mapped["coordinates"]),
    }
    rounded = shape(output)
    if rounded.is_empty or not rounded.is_valid:
        raise ValueError(
            f"Invalid display geometry after {DISPLAY_DECIMALS}-decimal rounding: "
            f"{explain_validity(rounded)}"
        )
    return output
