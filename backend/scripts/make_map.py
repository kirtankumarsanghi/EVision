"""Build a self-contained interactive India map of the Charging Demand Score.

No CDN, no external tiles: state outlines are projected and simplified into
inline SVG, and city hotspots are drawn as bubbles sized by CDS. Keeping it
self-contained means the file opens anywhere and can be published as an artifact.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))

from evision.config import BACKEND_ROOT, PROCESSED_DIR, load_yaml  # noqa: E402

GEOJSON = BACKEND_ROOT / "data" / "source" / "geo" / "india_state.geojson"
OUT = BACKEND_ROOT / "reports" / "cds_map.html"

WIDTH, HEIGHT = 820, 900
LON_MIN, LON_MAX = 66.0, 98.5
LAT_MIN, LAT_MAX = 6.5, 37.5
MEAN_LAT = 22.0
SIMPLIFY_EVERY = 7


def project(lon: float, lat: float) -> tuple[float, float]:
    import math

    x = (lon - LON_MIN) * math.cos(math.radians(MEAN_LAT))
    x_max = (LON_MAX - LON_MIN) * math.cos(math.radians(MEAN_LAT))
    y = LAT_MAX - lat
    y_max = LAT_MAX - LAT_MIN
    return (x / x_max * WIDTH, y / y_max * HEIGHT)


def rings_from(geometry: dict) -> list[list[list[float]]]:
    if geometry["type"] == "Polygon":
        return [geometry["coordinates"][0]]
    if geometry["type"] == "MultiPolygon":
        return [poly[0] for poly in geometry["coordinates"]]
    return []


def state_paths() -> list[tuple[str, str]]:
    data = json.loads(GEOJSON.read_text(encoding="utf-8"))
    out = []
    for feature in data["features"]:
        name = feature["properties"].get("NAME_1", "")
        parts = []
        for ring in rings_from(feature["geometry"]):
            pts = ring[::SIMPLIFY_EVERY] or ring
            if len(pts) < 3:
                continue
            coords = " ".join(
                f"{project(p[0], p[1])[0]:.0f},{project(p[0], p[1])[1]:.0f}" for p in pts
            )
            parts.append(f"M {coords} Z")
        if parts:
            out.append((name, " ".join(parts)))
    return out


def load_cities() -> list[dict]:
    coords = load_yaml("city_coordinates.yaml").get("cities", {})
    ranking = __import__("pandas").read_csv(PROCESSED_DIR / "cds_ranking.csv")
    rows = []
    for row in ranking.itertuples(index=False):
        latlon = coords.get(row.city)
        if not latlon:
            continue
        rows.append(
            {
                "city": row.city,
                "rank": int(row.rank),
                "cds": float(row.cds),
                "p_high": float(row.p_high),
                "growth": float(row.forecast_growth),
                "m1": float(row.m1_expected_monthly),
                "recommendation": row.recommendation,
                "split": row.split_method,
                "lat": latlon[0],
                "lon": latlon[1],
            }
        )
    return rows


def colour(cds: float) -> str:
    if cds >= 1.5:
        return "#b91c1c"
    if cds >= 0.75:
        return "#ea580c"
    if cds >= 0.0:
        return "#0284c7"
    return "#64748b"


def build_html(states: list[tuple[str, str]], cities: list[dict]) -> str:
    import math

    state_svg = "\n".join(
        f'<path d="{path}" fill="#e2e8f0" stroke="#94a3b8" stroke-width="0.6"><title>{name}</title></path>'
        for name, path in states
    )

    max_cds = max(c["cds"] for c in cities)
    bubbles = []
    for c in cities:
        x, y = project(c["lon"], c["lat"])
        r = 4 + 9 * (max(c["cds"], 0) / max_cds) ** 0.5
        bubbles.append(
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{r:.1f}" fill="{colour(c["cds"])}" '
            f'fill-opacity="0.72" stroke="#0f172a" stroke-width="0.5">'
            f"<title>{c['city']} — rank {c['rank']}, CDS {c['cds']:.2f}, "
            f"P(high) {c['p_high']:.2f}, 12m growth {c['growth']:.0%}</title></circle>"
            f'<text x="{x:.1f}" y="{y - r - 2:.1f}" font-size="8" fill="#0f172a" '
            f'text-anchor="middle">{c["city"] if c["rank"] <= 15 else ""}</text>'
        )

    rows = "\n".join(
        f"<tr><td>{c['rank']}</td><td><b>{c['city']}</b></td>"
        f"<td class='n'>{c['m1']:,.0f}</td><td class='n'>{c['p_high']:.2f}</td>"
        f"<td class='n'>{c['growth']:+.0%}</td><td class='n'>{c['cds']:.2f}</td>"
        f"<td>{c['recommendation']}</td><td class='tag {c['split']}'>{c['split']}</td></tr>"
        for c in cities[:20]
    )

    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>EVision — Charging Demand Score hotspots</title>
<style>
  :root {{ --ink:#0f172a; --muted:#64748b; --line:#e2e8f0; }}
  * {{ box-sizing:border-box; }}
  body {{ margin:0; font:14px/1.5 -apple-system,Segoe UI,Roboto,sans-serif; color:var(--ink);
         background:#f8fafc; }}
  header {{ padding:20px 26px 8px; }}
  h1 {{ margin:0 0 4px; font-size:21px; }}
  .sub {{ color:var(--muted); font-size:13px; }}
  .wrap {{ display:flex; gap:22px; padding:12px 26px 26px; align-items:flex-start;
           flex-wrap:wrap; }}
  .map {{ background:#fff; border:1px solid var(--line); border-radius:10px; padding:8px; }}
  table {{ border-collapse:collapse; background:#fff; border:1px solid var(--line);
           border-radius:10px; overflow:hidden; font-size:12.5px; }}
  th,td {{ padding:6px 9px; text-align:left; border-bottom:1px solid var(--line); }}
  th {{ background:#f1f5f9; font-weight:600; font-size:11.5px; text-transform:uppercase;
        letter-spacing:.03em; color:var(--muted); }}
  tr:last-child td {{ border-bottom:none; }}
  td.n {{ text-align:right; font-variant-numeric:tabular-nums; }}
  .tag {{ font-size:10.5px; padding:1px 6px; border-radius:9px; }}
  .tag.measured {{ background:#dcfce7; color:#166534; }}
  .tag.state {{ background:#fef3c7; color:#92400e; }}
  .tag.national {{ background:#fee2e2; color:#991b1b; }}
  .legend {{ display:flex; gap:16px; flex-wrap:wrap; margin-top:10px; font-size:12px;
             color:var(--muted); }}
  .dot {{ display:inline-block; width:10px; height:10px; border-radius:50%;
          margin-right:5px; vertical-align:middle; }}
  .note {{ max-width:820px; color:var(--muted); font-size:12px; margin-top:10px; }}
</style></head>
<body>
<header>
  <h1>Charging Demand Score — priority hotspots</h1>
  <div class="sub">51 cities · Jan 2022 – Sep 2026 · bubble size and colour scale with CDS</div>
</header>
<div class="wrap">
  <div class="map">
    <svg viewBox="0 0 {WIDTH} {HEIGHT}" width="{WIDTH}" height="{HEIGHT}" role="img"
         aria-label="India map of charging demand score by city">
      {state_svg}
      {"".join(bubbles)}
    </svg>
    <div class="legend">
      <span><span class="dot" style="background:#b91c1c"></span>Critical (CDS ≥ 1.5)</span>
      <span><span class="dot" style="background:#ea580c"></span>High (0.75–1.5)</span>
      <span><span class="dot" style="background:#0284c7"></span>Moderate (0–0.75)</span>
      <span><span class="dot" style="background:#64748b"></span>Low (&lt; 0)</span>
    </div>
  </div>
  <div>
    <table>
      <thead><tr><th>#</th><th>City</th><th>M1 /month</th><th>P(high)</th>
      <th>12m growth</th><th>CDS</th><th>Recommendation</th><th>split</th></tr></thead>
      <tbody>{rows}</tbody>
    </table>
    <div class="note">
      CDS = 0.4·z(M1 expected monthly registrations) + 0.3·P(high demand) +
      0.3·z(M3 12-month growth). The <b>split</b> badge records whether the 2W/3W/4W
      mix was measured, inferred from the same state, or from the national mix —
      only <span class="tag measured">measured</span> rows carry an observed split.
    </div>
  </div>
</div>
</body></html>"""


def main() -> int:
    states = state_paths()
    cities = load_cities()
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(build_html(states, cities), encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size/1024:.0f} KB)")
    print(f"  {len(states)} state polygons, {len(cities)} cities plotted")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
