#!/usr/bin/env python3
"""
Regenerate public/reports/park_data.js from NPS IRMA monthly recreation visits.

Rolling average: 2021–2025 (2020 excluded). Also stores calendar-year 2025 totals
(same source as reports/national-parks-2025.html).

Run: python3 next-frontend/scripts/build-when-to-go-data.py
Skip IRMA fetch (permits/slugs only): python3 ... --no-fetch
"""
from __future__ import annotations

import argparse
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PARK_DATA = ROOT / "public/reports/park_data.js"
SLUGS = ROOT / "src/data/park-slugs.json"
IRMA_URL = "https://irmaservices.nps.gov/v3/rest/stats/visitation"
ROLLING_YEARS = [2021, 2022, 2023, 2024, 2025]
BATCH_SIZE = 12

LINE_RE = re.compile(
    r'\s*"(?P<code>[A-Z]+)":\{name:"(?P<name>[^"]*)",state:"(?P<state>[^"]*)",'
    r"scores:\[(?P<scores>[^\]]*)\],raw:\[(?P<raw>[^\]]*)\],"
    r'permitSystem:"(?P<permit>[^"]*)",permitMonths:\[(?P<months>[^\]]*)\]'
    r"(?:,visits2025:(?P<v2025>\d+))?"
    r'(?:,slug:"(?P<slug>[^"]*)")?\},?'
)


def name_to_slug(full_name: str) -> str:
    s = full_name.lower().replace("&", "and")
    s = re.sub(r"[^a-z0-9\s-]", "", s)
    s = re.sub(r"\s+", "-", s).strip("-")
    return re.sub(r"-+", "-", s)


def load_parks() -> dict:
    parks = {}
    for line in PARK_DATA.read_text().splitlines():
        m = LINE_RE.match(line)
        if not m:
            continue
        d = m.groupdict()
        parks[d["code"]] = {
            "name": d["name"],
            "state": d["state"],
            "scores": [float(x.strip()) for x in d["scores"].split(",") if x.strip()],
            "raw": [int(x.strip()) for x in d["raw"].split(",") if x.strip()],
            "permitSystem": d["permit"],
            "permitMonths": [int(x.strip()) for x in d["months"].split(",") if x.strip()],
            "visits2025": int(d["v2025"]) if d.get("v2025") else 0,
            "slug": d.get("slug") or "",
        }
    return parks


def score_from_raw(raw: list[int]) -> list[float]:
    mx = max(raw) if raw else 0
    if mx == 0:
        return [0.0] * 12
    return [round((v / mx) * 10, 1) if v > 0 else 0.0 for v in raw]


def average_monthly(years: dict[int, list[int]]) -> list[int]:
    keys = sorted(years.keys())
    out = []
    for m in range(12):
        out.append(round(sum(years[y][m] for y in keys) / len(keys)))
    return out


def fetch_visitation_batch(codes: list[str], year: int) -> dict[str, list[int]]:
    """Return {UNIT_CODE: [12 monthly recreation visits]}."""
    monthly: dict[str, list[int]] = {c: [0] * 12 for c in codes}
    if not codes:
        return monthly

    params = (
        f"unitCodes={','.join(codes)}"
        f"&startMonth=1&startYear={year}&endMonth=12&endYear={year}"
    )
    req = urllib.request.Request(
        f"{IRMA_URL}?{params}",
        headers={"Accept": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=45) as resp:
        rows = json.load(resp)

    for row in rows:
        code = row.get("UnitCode") or ""
        month = int(row.get("Month") or 0)
        if code not in monthly or month < 1 or month > 12:
            continue
        monthly[code][month - 1] = int(row.get("RecreationVisitors") or 0)

    return monthly


def refresh_from_irma(codes: list[str]) -> tuple[dict[str, list[int]], dict[str, int]]:
    """Build rolling monthly averages and 2025 annual totals from IRMA."""
    years_data: dict[str, dict[int, list[int]]] = {c: {} for c in codes}
    visits2025: dict[str, int] = {c: 0 for c in codes}

    for year in ROLLING_YEARS:
        for i in range(0, len(codes), BATCH_SIZE):
            batch = codes[i : i + BATCH_SIZE]
            try:
                chunk = fetch_visitation_batch(batch, year)
            except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as err:
                raise RuntimeError(f"IRMA fetch failed for {year} batch {batch[:3]}…: {err}") from err
            for code in batch:
                years_data[code][year] = chunk.get(code, [0] * 12)
                if year == 2025:
                    visits2025[code] = sum(chunk.get(code, [0] * 12))
            time.sleep(0.15)

    raw_by_code: dict[str, list[int]] = {}
    for code in codes:
        raw_by_code[code] = average_monthly(years_data[code])

    return raw_by_code, visits2025


PERMIT_OVERRIDES_2026 = {
    "ARCH": (
        "No park-wide timed entry in 2026 (Devils Garden campground & Fiery Furnace permits still apply)",
        [0] * 12,
    ),
    "YOSE": ("No park-wide timed entry in 2026 — arrive early for parking", [0] * 12),
    "GLAC": (
        "No vehicle reservation in 2026; Logan Pass shuttle ticket Jul–Labor Day for some alpine hikes",
        [0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0],
    ),
    "MORA": ("No timed entry in 2026 — parking management only", [0] * 12),
    "ZION": (
        "Canyon shuttle Mar–Nov (no ticket); Angels Landing permit required year-round",
        [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    ),
    "GRTE": (
        "No timed entry in 2026 — popular lots fill by mid-morning in summer",
        [0] * 12,
    ),
    "SHEN": (
        "Old Rag day-use ticket Mar–Nov (Old Rag trails only; not whole park)",
        [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0],
    ),
    "ACAD": (
        "Cadillac Summit vehicle reservation May 20–Oct 25",
        [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
    ),
    "ROMO": (
        "Timed entry May 22–mid-Oct (certain hours; Bear Lake corridor rules differ)",
        [0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0],
    ),
}


def write_parks(parks: dict) -> None:
    lines = [
        "// Generated by scripts/build-when-to-go-data.py — do not edit by hand",
        "// Monthly recreation visit averages: 2021–2025 (2020 excluded). Scores 0–10 per park.",
        "// visits2025 = NPS IRMA calendar-year recreation visits (released March 2026).",
        "// Permit fields reviewed for 2026 NPS policies.",
        "const PARKS = {",
    ]
    for code in sorted(parks.keys()):
        p = parks[code]
        ps = p["permitSystem"].replace("\\", "\\\\").replace('"', '\\"')
        v25 = p.get("visits2025") or 0
        v25_part = f",visits2025:{v25}" if v25 > 0 else ""
        lines.append(
            f'  "{code}":{{name:"{p["name"]}",state:"{p["state"]}",'
            f'scores:[{", ".join(str(s) for s in p["scores"])}],'
            f'raw:[{", ".join(str(r) for r in p["raw"])}],'
            f'permitSystem:"{ps}",'
            f'permitMonths:[{", ".join(str(x) for x in p["permitMonths"])}]'
            f"{v25_part},"
            f'slug:"{p["slug"]}"}},'
        )
    lines.append("};")
    lines.append("")
    PARK_DATA.write_text("\n".join(lines))


def apply_slugs(parks: dict) -> None:
    slugs_data = json.loads(SLUGS.read_text())
    slug_by = {}
    for p in slugs_data:
        code = (p.get("parkCode") or "").upper()
        des = p.get("designation") or ""
        if not code or "national park" not in des.lower():
            continue
        slug_by[code] = name_to_slug(p["fullName"])

    slug_by["DENA"] = slug_by.get("DENA", "denali-national-park-and-preserve")
    slug_by["JEFF"] = slug_by.get("JEFF", "gateway-arch-national-park")

    for code, p in parks.items():
        p["slug"] = slug_by.get(code) or name_to_slug(f'{p["name"]} National Park')


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--no-fetch",
        action="store_true",
        help="Keep existing raw/scores; only refresh permits and slugs",
    )
    args = parser.parse_args()

    parks = load_parks()
    codes = sorted(parks.keys())

    if not args.no_fetch:
        print(f"Fetching IRMA monthly data for {len(codes)} parks ({ROLLING_YEARS[0]}–{ROLLING_YEARS[-1]})…")
        raw_by_code, visits2025 = refresh_from_irma(codes)
        missing = [c for c in codes if sum(raw_by_code.get(c, [])) == 0]
        if missing:
            print(f"Warning: no IRMA data for {len(missing)} parks: {', '.join(missing[:8])}…")

        for code in codes:
            raw = raw_by_code.get(code) or parks[code]["raw"]
            if sum(raw) == 0:
                continue
            parks[code]["raw"] = raw
            parks[code]["scores"] = score_from_raw(raw)
            if visits2025.get(code, 0) > 0:
                parks[code]["visits2025"] = visits2025[code]

        # Sanity check vs national-parks-2025.html top-10 (millions)
        checks = {
            "GRSM": 11.53,
            "ZION": 4.98,
            "YELL": 4.76,
            "GRCA": 4.43,
            "YOSE": 4.28,
        }
        for code, expected_m in checks.items():
            if code not in parks or not parks[code].get("visits2025"):
                continue
            actual_m = parks[code]["visits2025"] / 1_000_000
            if abs(actual_m - expected_m) > 0.08:
                print(f"Warning: {code} 2025 total {actual_m:.2f}M vs report {expected_m}M")

    for code, (ps, pm) in PERMIT_OVERRIDES_2026.items():
        if code in parks:
            parks[code]["permitSystem"] = ps
            parks[code]["permitMonths"] = pm

    apply_slugs(parks)
    write_parks(parks)
    with_2025 = sum(1 for p in parks.values() if p.get("visits2025", 0) > 0)
    print(f"Wrote {len(parks)} parks to {PARK_DATA} ({with_2025} with 2025 annual totals)")


if __name__ == "__main__":
    main()
