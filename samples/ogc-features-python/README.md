# Read OGC API Features with Python

Use only Python's standard library to discover a public collection and read two
GeoJSON features.

## Run

```bash
python src/run.py
```

The script checks the landing page, chooses the first advertised collection,
requests two items, and verifies that each item has geometry. There are no
third-party Python packages and no authentication setup.

Set `HONUA_BASE_URL` to use another Honua OGC API Features deployment.
