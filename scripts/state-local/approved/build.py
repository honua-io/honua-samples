#!/usr/bin/env python3
"""Assemble self-contained demo screens: pages/*.html -> ../*.html.

Placeholders: {{HEAD}} (fonts, MapLibre, inlined CSS), {{ICONS}}, {{DATA name,name.sub,...}}, {{MAPJS}}.
Data files live in data/ (.cjson compact, .geojson, .json). demo.json subkeys are selected with demo.<key>.
"""
import json, os, re, sys

ROOT = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(sys.argv[2])
os.makedirs(OUT, exist_ok=True)
SRC, PAGES, DATA = (os.path.join(ROOT, d) for d in ("src", "pages", "data"))
SHARED = os.path.join(ROOT, "../../../shared/state-local")
DATA = os.path.abspath(sys.argv[1])
MAPLIBRE = "4.7.1"


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def load(name):
    island = os.environ.get("HONUA_ISLAND_DATA")
    if island and name in os.environ["HONUA_ISLAND_POINT_LAYERS"].split(","):
        return json.loads(read(os.path.join(island, name + ".geojson")))
    for ext in (".cjson", ".geojson", ".json"):
        p = os.path.join(DATA, name + ext)
        if os.path.exists(p):
            return json.loads(read(p))
    raise FileNotFoundError(name)


def data_block(spec):
    hd = {}
    for item in [s.strip() for s in spec.split(",") if s.strip()]:
        if "." in item:
            base, key = item.split(".", 1)
            hd.setdefault(base, {})[key] = load(base)[key]
        else:
            hd[item] = load(item)
    blob = json.dumps(hd, separators=(",", ":"), ensure_ascii=False).replace("</", "<\\/")
    return f"<script>window.HD={blob};</script>"


def head(uses_map):
    css = read(os.path.join(SRC, "tokens.css")) + "\n" + read(os.path.join(SRC, "app.css"))
    parts = [
        '<script>try{var t=localStorage.getItem("honua-theme");document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light")}catch(e){document.documentElement.setAttribute("data-theme","light")}</script>',
        '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>',
        '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500&display=swap">',
    ]
    if uses_map:
        parts.append(f'<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@{MAPLIBRE}/dist/maplibre-gl.css">')
        parts.append(f'<script src="https://unpkg.com/maplibre-gl@{MAPLIBRE}/dist/maplibre-gl.js"></script>')
        parts.append('<script src="https://cdn.jsdelivr.net/npm/pmtiles@4.5.0/dist/pmtiles.js" integrity="sha384-pbKNZbDshUsLnZMIVsn/t+j3xEY9PGfuX5Z22l5rcy/obXz3EwaMx1F5d9sRsJMn" crossorigin="anonymous"></script>')
    parts.append(f"<style>{css}\n[hidden]{{display:none!important}}</style>")
    return "\n".join(parts)


ROUTES = {"02-property.html": "/state-local/property/", "10-property-mobile.html": "/state-local/property/mobile/", "03-311.html": "/state-local/311/", "05-public-works.html": "/state-local/public-works/", "01-overview.html": "/state-local/", "12-workbench.html": "/state-local/workbench/"}

def build(name):
    src = read(os.path.join(PAGES, name))
    shell = read(os.path.join(ROOT, "../../../shared/state-local/app-shell.css"))
    src = src.replace("</head>", f"<style>{shell}</style></head>", 1)
    uses_map = "{{MAPJS}}" in src
    src = src.replace("{{HEAD}}", head(uses_map))
    src = src.replace("{{ICONS}}", read(os.path.join(SRC, "icons.svg")))
    src = src.replace("{{PARCEL_ANSWERS}}", "<script>" + read(os.path.join(SHARED, "parcel-answers.js")) + "</script>")
    src = src.replace("{{PARCEL_SEARCH}}", "<script>" + read(os.path.join(SHARED, "parcel-search.js")) + "</script>")
    island = read(os.path.join(SHARED, "island-map.js"))
    for placeholder, value in json.loads(os.environ["HONUA_PAGE_PLACEHOLDERS"]).items():
        island = island.replace(placeholder, value)
    if "{{STATE_LOCAL_" in island:
        raise ValueError("An unknown {{STATE_LOCAL_*}} placeholder remains in island-map.js")
    kit = "<script>" + island + "\n" + read(os.path.join(SHARED, "honua-map.js")) + "</script>"
    if "{{MAPJS}}" in src:
        src = src.replace("{{MAPJS}}", kit)
    else:
        src = src.replace("</body>", kit + "\n</body>", 1)
    src = re.sub(r"\{\{DATA ([^}]*)\}\}", lambda m: data_block(m.group(1)), src)
    for source, target in ROUTES.items():
        src = src.replace('href="' + source + '"', 'href="' + target + '"')
    for source in ("04-emergency.html", "06-emergency.html"):
        src = src.replace('href="' + source + '"', 'href="/state-local/emergency/"')
    for source in ("07-catalog.html", "08-catalog.html"):
        src = src.replace('href="' + source + '"', 'href="/state-local/data/manifest.json"')
    src = src.replace('href="index.html"', 'href="/state-local/"')
    src = src.replace('href="../data/manifest.json"', 'href="/state-local/data/manifest.json"')
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as f:
        f.write(src)
    print(f"{name:28s} {len(src.encode()) / 1024:8.1f} KB")


if __name__ == "__main__":
    names = sys.argv[3:] or sorted(n for n in os.listdir(PAGES) if n.endswith(".html"))
    for n in names:
        build(n)
