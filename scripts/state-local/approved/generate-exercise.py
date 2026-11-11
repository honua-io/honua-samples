import json, random, math, os, sys, hashlib, datetime as dt
from shapely.geometry import shape, Point, LineString
from shapely.ops import nearest_points
PROC, DATA = sys.argv[1], sys.argv[2]
rng = random.Random(808)
def L(path): return json.load(open(path))['features']
roads = L(f"{PROC}/roads.geojson"); parcels = L(f"{PROC}/parcels.geojson"); dfirm = L(f"{PROC}/dfirm.geojson")
ts = L(f"{DATA}/tsunami.geojson"); council = L(f"{DATA}/council.geojson"); shelters = L(f"{DATA}/shelters.geojson")
evac = [shape(f["geometry"]) for f in ts if f["properties"]["code"] == 1]
extreme = [shape(f["geometry"]) for f in ts if f["properties"]["code"] == 2]
flood = [shape(f["geometry"]) for f in dfirm if f["properties"]["zone"] in ("AE", "A", "AO", "AH", "VE")]
cg = [(shape(f["geometry"]), f["properties"]) for f in council]
shp = [(Point(f["geometry"]["coordinates"]), f["properties"]["name"]) for f in shelters]
NOW = dt.datetime(2026, 11, 9, 9, 40)
def r5(x): return round(x, 5)
def m(d): return d * 111_000
# road sampling weighted by length, favouring Kahului/Wailuku urban core
segs = []
for f in roads:
    g = shape(f["geometry"]); n = f["properties"]["name"]
    if not n or g.length == 0: continue
    lines = list(g.geoms) if g.geom_type == "MultiLineString" else [g]
    for ln in lines:
        c = ln.centroid
        urban = 1.0 if (-156.515 < c.x < -156.455 and 20.865 < c.y < 20.900) else 0.25
        segs.append((ln, n, ln.length * urban, f["properties"]["cls"]))
tot = sum(s[2] for s in segs)
def sample_on_roads(filter_fn=None):
    for _ in range(4000):
        x = rng.random() * tot; acc = 0
        for ln, n, w, cls in segs:
            acc += w
            if acc >= x: break
        p = ln.interpolate(rng.random(), normalized=True)
        off = (rng.random() - .5) * 0.00012
        p = Point(p.x + off, p.y + off * .6)
        if filter_fn is None or filter_fn(p): return p, n, cls
    raise RuntimeError("no sample")
def district(p):
    for g, pr in cg:
        if g.contains(p): return pr["num"]
    return 4
def addr(n, p):
    num = 10 + (int(hashlib.sha256(f"{p.x:.4f},{p.y:.4f},{n}".encode()).hexdigest()[:12], 16) % 190) * 5
    return f"{num} {n}"
TYPES = [
  # type, dept, share, sla_days
  ("Pothole", "Public Works · Highways", 22, 5),
  ("Drainage / flooding", "Public Works · Engineering", 14, 3),
  ("Streetlight out", "Public Works · Traffic", 12, 7),
  ("Illegal dumping", "Environmental Management", 11, 4),
  ("Abandoned vehicle", "Police · Wailuku District", 9, 10),
  ("Sidewalk damage", "Public Works · Highways", 8, 14),
  ("Tree / vegetation", "Parks & Recreation", 8, 7),
  ("Graffiti", "Parks & Recreation", 6, 5),
  ("Missed trash pickup", "Environmental Management", 6, 2),
  ("Traffic signal", "Public Works · Traffic", 4, 1),
]
CHANNEL = [("Maui 311 app", 46), ("Phone", 28), ("Web form", 18), ("Field staff", 8)]
def wchoice(items, idx=2):
    x = rng.random() * sum(i[idx] if isinstance(i, tuple) and len(i) > idx else i[1] for i in items); acc = 0
    for i in items:
        acc += i[idx] if len(i) > idx else i[1]
        if acc >= x: return i
    return items[-1]
NOTES = {
  "Pothole": ["Deep pothole in the right lane, cars swerving.", "Two potholes near the crosswalk.", "Pothole reopened after the last patch."],
  "Drainage / flooding": ["Storm drain grate blocked with debris, water pooling across the lane.", "Ponding at the curb after light rain, inlet looks clogged.", "Drain inlet full of sand and leaves.", "Water over the sidewalk after rain, standing for hours."],
  "Streetlight out": ["Light out for a week, dark stretch by the bus stop.", "Streetlight flickering on and off."],
  "Illegal dumping": ["Mattress and furniture dumped by the fence.", "Bags of green waste left on the shoulder."],
  "Abandoned vehicle": ["Silver sedan, no plates, hasn't moved in three weeks.", "Van with flat tyres parked on the shoulder."],
  "Sidewalk damage": ["Raised slab from tree roots, trip hazard.", "Cracked sidewalk near the school entrance."],
  "Tree / vegetation": ["Branches blocking the stop sign.", "Overgrown hedge into the sidewalk."],
  "Graffiti": ["Tagging on the bus shelter.", "Graffiti on the park restroom wall."],
  "Missed trash pickup": ["Gray cart not picked up on our route day.", "Recycling skipped this week."],
  "Traffic signal": ["Signal stuck on red for the side street.", "Pedestrian button not working."],
}
reqs = []
for i in range(468):
    t = wchoice(TYPES)
    if t[0] == "Drainage / flooding" and rng.random() < .55:
        p, n, cls = sample_on_roads(lambda q: any(g.contains(q) for g in evac + flood))
    else:
        p, n, cls = sample_on_roads()
    age_h = rng.random() ** 1.6 * 90 * 24
    created = NOW - dt.timedelta(hours=age_h)
    sla = t[3]
    r = rng.random()
    if age_h < 20: status = rng.choice(["New", "New", "Assigned"])
    elif r < (0.18 if age_h < 24 * 14 else 0.05): status = "In progress"
    elif r < (0.30 if age_h < 24 * 14 else 0.08): status = "Assigned"
    else: status = "Closed"
    closed = None
    if status == "Closed":
        dur = max(2, rng.gauss(sla * 24 * .7, sla * 24 * .45))
        closed = created + dt.timedelta(hours=dur)
        if closed > NOW: closed = NOW - dt.timedelta(hours=rng.random() * 5);
    due = created + dt.timedelta(days=sla)
    end = closed or NOW
    breach = end > due
    ch = wchoice(CHANNEL, 1)[0]
    reqs.append({
        "id": f"SR-26-{18240 + i:05d}", "type": t[0], "dept": t[1], "status": status, "channel": ch,
        "created": created.isoformat(timespec="minutes"), "closed": closed.isoformat(timespec="minutes") if closed else None,
        "due": due.isoformat(timespec="minutes"), "breach": breach, "sla": sla,
        "addr": addr(n, p), "street": n, "district": district(p),
        "evac": any(g.contains(p) for g in evac), "flood": any(g.contains(p) for g in flood),
        "note": rng.choice(NOTES[t[0]]), "c": [r5(p.x), r5(p.y)],
    })
# Keep the fictional intake history identical in maps, cross-department joins and exports.
KEEP = {"SR-26-18666", "SR-26-18369", "SR-26-18430", "SR-26-18257", "SR-26-18380"}
for request in reqs:
    created = dt.datetime.fromisoformat(request["created"])
    age = (NOW - created).total_seconds() / 86400
    spread_age = age if request["id"] in KEEP else 90 * (age / 90) ** 0.625
    shift = dt.timedelta(days=spread_age - age)
    created -= shift
    due = dt.datetime.fromisoformat(request["due"]) - shift
    closed = dt.datetime.fromisoformat(request["closed"]) - shift if request["closed"] else None
    if request["status"] != "Closed" and request["id"] not in KEEP:
        late_days = (NOW - due).total_seconds() / 86400
        if spread_age > 24 or (late_days > 2 and int(request["id"][-3:]) % 3 != 0):
            request["status"] = "Closed"
            closed = min(NOW - dt.timedelta(hours=1), created + dt.timedelta(days=request["sla"] * 0.85))
        elif request["status"] == "New" and spread_age > 1:
            request["status"] = "Assigned"
    request.update(created=created.isoformat(timespec="milliseconds"), due=due.isoformat(timespec="milliseconds"),
                   closed=closed.isoformat(timespec="milliseconds") if closed else None, breach=(closed or NOW) > due)
twin = next(request for request in reqs if request["id"] == "SR-26-18666")
number, street = twin["addr"].split(" ", 1)
reqs.append({**twin, "id": "SR-26-18708", "status": "New", "channel": "Maui 311 app",
             "created": "2026-11-09T09:38", "closed": None, "due": "2026-11-12T09:38", "breach": False,
             "note": "Water across the lane by the school, drain is full of sand. Kids walking in the road.",
             "c": [twin["c"][0] + 0.00026, twin["c"][1] + 0.00008], "addr": f"{int(number) + 20} {street}"})
reqs.sort(key=lambda r: r["created"], reverse=True)
# agent answer: open drainage requests in tsunami evacuation zone within 1 km of a shelter
ans = []
for r in reqs:
    if r["type"] != "Drainage / flooding" or r["status"] == "Closed" or not r["evac"]: continue
    p = Point(r["c"]); best = min(shp, key=lambda s: s[0].distance(p)); d = m(best[0].distance(p))
    if d <= 1200: ans.append({"id": r["id"], "shelter": best[1], "dist_m": int(round(d, -1))})
print("agent answer", len(ans), ans)

# Assets: storm drain inlets & culverts on roads, signals at major intersections; bridges are real (NBI)
assets = []
def cond_score(): return max(1, min(5, int(round(rng.gauss(3.4, 1.0)))))
for i in range(150):
    p, n, cls = sample_on_roads(lambda q: True)
    kind = "Storm drain inlet" if i < 110 else ("Culvert" if i < 128 else "Traffic signal")
    if kind == "Traffic signal":
        p, n, cls = sample_on_roads(lambda q: True)
    cs = cond_score()
    last = NOW - dt.timedelta(days=int(rng.random() * 900))
    assets.append({"id": {"Storm drain inlet": "SD", "Culvert": "CV", "Traffic signal": "TS"}[kind] + f"-{3100 + i}", "kind": kind, "street": n,
                   "cond": cs, "insp": last.date().isoformat(), "installed": rng.randint(1958, 2021), "evac": any(g.contains(p) for g in evac),
                   "c": [r5(p.x), r5(p.y)]})
CREWS = ["Wailuku Baseyard · Crew 2", "Wailuku Baseyard · Crew 4", "Kahului Drainage · Vactor 1", "Traffic Ops · Signal tech", "Kahului Drainage · Crew 1"]
WOS = []
WT = [("Clean and jet inlet", "Storm drain inlet"), ("Replace grate", "Storm drain inlet"), ("Clear culvert outlet", "Culvert"), ("Repair headwall", "Culvert"),
      ("Replace signal controller", "Traffic signal"), ("Relamp signal heads", "Traffic signal")]
stages = ["Backlog"] * 7 + ["Scheduled"] * 9 + ["In progress"] * 6 + ["Awaiting parts"] * 3 + ["Done"] * 9
for i, st in enumerate(stages):
    wt = rng.choice(WT); a = rng.choice([x for x in assets if x["kind"] == wt[1]])
    created = NOW - dt.timedelta(days=rng.randint(0, 30), hours=rng.randint(0, 20))
    sched = created + dt.timedelta(days=rng.randint(1, 10))
    WOS.append({"id": f"WO-26-{7710 + i}", "title": wt[0], "asset": a["id"], "street": a["street"], "stage": st,
                "crew": rng.choice(CREWS) if st != "Backlog" else None, "pri": rng.choice(["P1", "P2", "P2", "P3", "P3"]),
                "created": created.date().isoformat(), "sched": sched.date().isoformat(), "hrs": rng.choice([2, 3, 4, 6, 8]), "c": a["c"]})
for record in reqs + assets + WOS:
    record["data_origin"] = "synthetic_demo"
    record["disclaimer"] = "DEMO DATA; not county operations"
json.dump({"now": NOW.isoformat(timespec="minutes"), "requests": reqs, "agent": ans, "assets": assets, "workorders": WOS},
          open(f"{DATA}/demo.json", "w"), separators=(",", ":"))
print(len(reqs), len(assets), len(WOS), os.path.getsize(f"{DATA}/demo.json") // 1024, "KB")
