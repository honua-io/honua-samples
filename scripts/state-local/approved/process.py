import json, sys, os, re
from shapely.geometry import shape, mapping, box, Point
from shapely.ops import unary_union
from shapely import make_valid
RAW, OUT = sys.argv[1], sys.argv[2]
W = box(-156.535, 20.855, -156.42, 20.915)
P = box(-156.49, 20.875, -156.462, 20.895)
def L(n): return json.load(open(os.path.join(RAW, n + '.geojson')))['features']
def rnd(o, nd=5):
    if isinstance(o, float): return round(o, nd)
    if isinstance(o, (list, tuple)): return [rnd(x, nd) for x in o]
    return o
def geom_out(g):
    m = mapping(g); return {"type": m["type"], "coordinates": rnd(m["coordinates"])}
def poly_only(g):
    if g.is_empty: return None
    if g.geom_type in ("Polygon", "MultiPolygon"): return g
    if g.geom_type == "GeometryCollection":
        ps = [x for x in g.geoms if x.geom_type in ("Polygon", "MultiPolygon")]
        return unary_union(ps) if ps else None
    return None
def save(name, feats):
    fc = {"type": "FeatureCollection", "features": feats}
    s = json.dumps(fc, separators=(",", ":"), ensure_ascii=False)
    open(os.path.join(OUT, name + ".geojson"), "w").write(s)
    print(f"{name:18s} {len(feats):5d} {len(s)/1024:7.1f} KB")
def polys(name, clip, tol, props):
    out = []
    for f in L(name):
        if not f.get("geometry"): continue
        g = make_valid(shape(f["geometry"])).intersection(clip)
        g = poly_only(g)
        if g is None: continue
        g = g.simplify(tol, preserve_topology=True)
        if g.is_empty or g.area < tol * tol * 4: continue
        out.append({"type": "Feature", "properties": props(f["properties"]), "geometry": geom_out(g)})
    return out
def title(s): return " ".join(w.capitalize() for w in (s or "").split())

# land/ocean
land = unary_union([make_valid(shape(f["geometry"])) for f in L("coastline")]).intersection(W.buffer(0.01))
land = poly_only(land).simplify(0.00004, preserve_topology=True)
save("land", [{"type": "Feature", "properties": {}, "geometry": geom_out(land)}])

ZONES = {}
zoning = polys("zoning", W, 0.00003, lambda p: {"code": p["zone_code"], "name": p["zone_dist"]})
save("zoning", zoning)
dfirm = polys("dfirm", W, 0.00003, lambda p: {"zone": p["fld_zone"], "sfha": p["sfha_tf"], "bfe": p["static_bfe"] if p["static_bfe"] and p["static_bfe"] > -9000 else None})
save("dfirm", dfirm)
ts = polys("tsunami", W, 0.00003, lambda p: {"type": p["zone_type"], "desc": p["zone_desc"], "code": p["zone_code"], "map": p["mapname"]})
save("tsunami", ts)
slr = polys("slr32", W, 0.00004, lambda p: {"scenario": "3.2 ft"})
save("slr32", slr)
council = polys("council", W, 0.0001, lambda p: {"num": p["districtnumber"], "name": p["district"]})
save("council", council)

MAJOR = re.compile(r"HIGHWAY|KAAHUMANU AVENUE|PUUNENE AVENUE|WAIEHU BEACH|MAIN STREET|MARKET STREET|WAIALE ROAD|MAUI LANI PARKWAY|AIRPORT ACCESS|KAHULUI BEACH ROAD|DAIRY ROAD|HOBRON|KEHALANI MAUKA|KUIKAHI|MILL STREET|ONEHEE|PAPA AVENUE|LONO AVENUE|KAMEHAMEHA AVENUE|HINA AVENUE|KAOHU|HIGH STREET|WELLS STREET|VINEYARD|EAST KAAHUMANU")
roads = []
for f in L("roads"):
    g = shape(f["geometry"]).intersection(W)
    if g.is_empty: continue
    g = g.simplify(0.00001)
    n = f["properties"]["fullname"] or ""
    cls = "hwy" if "HIGHWAY" in n else ("major" if MAJOR.search(n) else "local")
    roads.append({"type": "Feature", "properties": {"name": title(n), "cls": cls}, "geometry": geom_out(g)})
save("roads", roads)
streams = []
for f in L("streams"):
    g = shape(f["geometry"]).intersection(W)
    if g.is_empty: continue
    streams.append({"type": "Feature", "properties": {"name": title(f["properties"]["stream_nam"])}, "geometry": geom_out(g.simplify(0.00003))})
save("streams", streams)

# parcels with derived zoning / flood / tsunami
zg = [(shape(z["geometry"]), z["properties"]) for z in zoning]
fg = [(shape(z["geometry"]), z["properties"]) for z in dfirm]
tg = [(shape(z["geometry"]), z["properties"]) for z in ts]
parcels = []
for f in L("parcels"):
    g0 = make_valid(shape(f["geometry"]))
    c = g0.representative_point()
    if not P.contains(c): continue
    g = poly_only(g0)
    if g is None: continue
    g = g.simplify(0.000008, preserve_topology=True)
    p = f["properties"]; t = str(p["tmk_txt"] or "")
    z = next((pp for gg, pp in zg if gg.contains(c)), None)
    fl = next((pp for gg, pp in fg if gg.contains(c)), None)
    tzs = [pp["type"] for gg, pp in tg if gg.contains(c) and "Safe" not in (pp["type"] or "")]
    tz = "Tsunami Evacuation Zone" if "Tsunami Evacuation Zone" in tzs else (tzs[0] if tzs else None)
    tmk = f"({t[0]}) {t[1]}-{t[2]}-{t[3:6]}:{t[6:9]}" if len(t) == 9 else t
    parcels.append({"type": "Feature", "id": p["objectid"], "properties": {
        "id": p["objectid"], "tmk": tmk, "land": p["landvalue"], "bldg": p["bldgvalue"], "acres": round(p["gisacres"] or 0, 3),
        "ho": p["homeowner"], "nh": p["nhoodcode"], "pitt": p["pittcode"],
        "zone": z["code"] if z else None, "zname": z["name"] if z else None,
        "fld": fl["zone"] if fl else None, "tsu": tz,
        "c": rnd([c.x, c.y])}, "geometry": geom_out(g)})
save("parcels", parcels)

def pts(name, props):
    out = []
    for f in L(name):
        g = f.get("geometry")
        if not g: continue
        out.append({"type": "Feature", "properties": props(f["properties"]), "geometry": {"type": "Point", "coordinates": rnd(g["coordinates"])}})
    return out
save("fire", pts("fire", lambda p: {"name": p["alt_name"] or p["name"]}))
save("police", pts("police", lambda p: {"name": p["station_name"], "addr": p["full_address"]}))
save("schools", pts("schools", lambda p: {"name": p["sch_name"], "addr": title(p["address"])}))
save("hospitals", pts("hospitals", lambda p: {"name": p["name"], "addr": p["address_addressline1"]}))
save("shelters", pts("schools", lambda p: {"name": title(p["sch_name"]), "addr": title(p["address"]), "place": p.get("city"), "cap": None, "pets": False, "sn": False, "data_origin": "exercise_anchor", "activation": "Exercise only; not official shelters"}))
save("places", pts("places", lambda p: {"name": p["feature_name"], "cls": p["feature_class"]}))
save("bridges", pts("bridges", lambda p: {"id": p["structure_number_008"].strip(), "carries": title(p["facility_carried_007"]), "over": title(p["features_desc_006a"]), "loc": title(p["location_009"]), "built": p["year_built_027"], "adt": p["adt_029"], "deck": p["deck_cond_058"], "sup": p["superstructure_cond_059"], "sub": p["substructure_cond_060"], "culv": p["culvert_cond_062"], "cond": p["bridge_condition"], "low": p["lowest_rating"], "insp": p["date_of_inspect_090"], "len": p["structure_len_mt_049"]}))

# ---- compact encodings (delta-encoded 1e5 integers) ----
def enc_line(coords):
    out = []; px = py = 0
    for x, y in coords:
        ix, iy = int(round(x * 1e5)), int(round(y * 1e5))
        out += [ix - px, iy - py]; px, py = ix, iy
    return out
def enc_geom(g):
    t = g["type"]; c = g["coordinates"]
    if t == "Polygon": return [[enc_line(r) for r in c]]
    if t == "MultiPolygon": return [[enc_line(r) for r in p] for p in c]
    if t == "LineString": return [enc_line(c)]
    if t == "MultiLineString": return [enc_line(l) for l in c]
    raise ValueError(t)
def compact(name, feats, keys, kind):
    d = {"k": keys, "t": kind, "p": [[f["properties"].get(k) for k in keys] for f in feats], "g": [enc_geom(f["geometry"]) for f in feats]}
    s = json.dumps(d, separators=(",", ":"), ensure_ascii=False)
    open(os.path.join(OUT, name + ".cjson"), "w").write(s)
    print(f"{name:18s} compact {len(feats):5d} {len(s)/1024:7.1f} KB")

# zoning dissolved by code, simplified harder
from collections import defaultdict
byc = defaultdict(list); names = {}
for gg, pp in zg: byc[pp["code"]].append(gg); names[pp["code"]] = pp["name"]
zd = []
for code, gs in byc.items():
    u = unary_union([g.buffer(0) for g in gs]).simplify(0.00004, preserve_topology=True)
    u = poly_only(u)
    if u is None: continue
    zd.append({"type": "Feature", "properties": {"code": code, "name": names[code]}, "geometry": geom_out(u)})
compact("zoning", zd, ["code", "name"], "poly")
compact("roads", roads, ["name", "cls"], "line")
# ---- Hawaii multi-layer land use: state LUD, SMA, Maui Island Plan, community plan ----
slud = polys("slud", W, 0.00003, lambda p: {"lud": p["ludcode"]})
save("slud", slud)
sma = polys("sma", W, 0.00003, lambda p: {"sma": 1})
save("sma", sma)
mipg = polys("mip_growth", W, 0.00003, lambda p: {"type": p["type"], "status": p["status"]})
save("mip_growth", mipg)
mipp = []
save("mip_protected", mipp)
cpl = []
compact("cplan", cpl, ["cp"], "poly")
COMPAT = {"res": {"Single Family", "Multi-Family", "Rural"}, "mf": {"Multi-Family", "Business Multi-family"},
          "bus": {"Commercial", "Business Multi-family", "Service Business/Residential", "Business/Industrial"}, "hotel": {"Hotel"},
          "ind": {"Light Industrial", "Heavy Industrial", "Business/Industrial"}, "air": {"Airport"}, "ag": {"Agriculture", "Rural"},
          "pub": {"Public/Quasi-public"}, "park": {"Park", "Open Space"}, "pd": {"Project District"}}
ZG = {"010": "res", "020": "res", "030": "res", "040": "res", "101": "res", "605": "res", "100": "mf", "120": "mf",
      "310": "bus", "320": "bus", "330": "bus", "370": "bus", "380": "bus", "390": "bus", "200": "hotel", "215": "hotel", "220": "hotel",
      "410": "ind", "420": "ind", "430": "air", "500": "ag", "900": "pub", "902": "pub", "905": "pub", "909": "pub", "929": "park", "720": "pd", "773": "bus"}
lg = [(shape(f["geometry"]), f["properties"]["lud"]) for f in slud]
sg = [shape(f["geometry"]) for f in sma]
mg = [(shape(f["geometry"]), f["properties"]["type"]) for f in mipg]
cg2 = [(shape(f["geometry"]), f["properties"]["cp"]) for f in cpl]
CPS = sorted({c for _, c in cg2}); json.dump(CPS, open(os.path.join(OUT, "cp_names.json"), "w"))
import collections; mmc = collections.Counter()
for f in parcels:
    q = f["properties"]; c = Point(q["c"])
    q["lud"] = next((v for g, v in lg if g.contains(c)), None)
    q["sma"] = 1 if any(g.contains(c) for g in sg) else 0
    q["gb"] = next((v for g, v in mg if g.contains(c)), None)
    cp = next((v for g, v in cg2 if g.contains(c)), None)
    q["cp"] = CPS.index(cp) if cp else -1
    grp = ZG.get(q["zone"])
    q["mm"] = 1 if (cp and grp and cp not in ("Roads", "Other") and cp not in COMPAT[grp]) else 0
    mmc[(q["zone"], cp, q["mm"])] += 1
print("mismatch", sum(1 for f in parcels if f["properties"]["mm"]), [k for k in mmc.most_common(60) if k[0][2]][:15])
print("featured", [f["properties"] for f in parcels if f["properties"]["id"] == 27904])
for f in parcels:
    q = f["properties"]; q["t9"] = int(re.sub(r"\D", "", q["tmk"]) or 0); q["ts"] = {None: 0}.get(q["tsu"], 1 if q["tsu"] and "Extreme" not in q["tsu"] else 2); q["h"] = 1 if q["ho"] == "Y" else 0
compact("parcels", parcels, ["id", "t9", "land", "bldg", "acres", "h", "zone", "fld", "ts", "lud", "sma", "gb", "cp", "mm"], "poly")
json.dump({z["properties"]["code"]: z["properties"]["name"] for z in zd}, open(os.path.join(OUT, "zone_names.json"), "w"), ensure_ascii=False)
import collections; print(collections.Counter(f["properties"]["tsu"] for f in parcels))
compact("dfirm", dfirm, ["zone", "sfha", "bfe"], "poly")
compact("slr32", slr, ["scenario"], "poly")
compact("streams", streams, ["name"], "line")
cont = []
for f in L("contours"):
    g = shape(f["geometry"]).intersection(W)
    if g.is_empty or g.geom_type not in ("LineString", "MultiLineString"): continue
    cont.append({"type": "Feature", "properties": {"ft": f["properties"]["contour"]}, "geometry": geom_out(g.simplify(0.00005))})
compact("contours", cont, ["ft"], "line")
wb = polys("waterbodies", W, 0.00002, lambda p: {"name": p["gnis_name"]})
wb = [f for f in wb if shape(f["geometry"]).area > 2e-8]
save("waterbodies", wb)
