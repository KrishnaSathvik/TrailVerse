#!/usr/bin/env python3
"""Deep verify all structuredContent fields across all 5 tools."""
import asyncio
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from server.main import (
    compare_parks,
    find_events,
    get_park_details,
    plan_trip,
    search_parks,
)

G = "\033[32m"
R = "\033[31m"
Y = "\033[33m"
B = "\033[1m"
X = "\033[0m"


def safe_get(d, path):
    parts = path.split(".")
    cur = d
    for p in parts:
        if isinstance(cur, dict):
            cur = cur.get(p)
        else:
            return None
    return cur


def report(checks):
    all_ok = True
    for name, val in checks:
        missing_vals = (None, False, "0 items", "0 days", "0 maps", "0 images", "0 events", "0 parks", "N/A")
        ok = val not in missing_vals and val is not None
        tag = f"{G}OK{X}" if ok else f"{R}MISS{X}"
        if not ok:
            all_ok = False
        print(f"  {tag}  {name} = {val}")
    return all_ok


async def main():
    all_pass = True

    # ====== 1. PARK DETAILS ======
    print(f"\n{B}{'=' * 60}")
    print(f"1. PARK DETAILS (zion)")
    print(f"{'=' * 60}{X}")
    r = await get_park_details(park_code="zion")
    sc = r.structuredContent
    checks = [
        ("name", sc.get("name")),
        ("parkCode", sc.get("parkCode")),
        ("designation", sc.get("designation")),
        ("heroImage", bool(sc.get("heroImage"))),
        ("description", bool(sc.get("description"))),
        ("activities", f"{len(sc.get('activities', []))} items"),
        ("entranceFees", f"{len(sc.get('entranceFees', []))} items"),
        ("alerts", f"{len(sc.get('alerts', []))} items"),
        ("images (NEW)", f"{len(sc.get('images', []))} items"),
        ("operatingHours (NEW)", f"{len(sc.get('operatingHours', []))} items"),
        ("campgrounds (NEW)", f"{len(sc.get('campgrounds', []))} items"),
        ("permits", f"{len(sc.get('permits', []))} items"),
        ("weather.current.tempF", safe_get(sc, "weather.current.tempF")),
        ("weather.current.feelsLike (NEW)", safe_get(sc, "weather.current.feelsLike")),
        ("weather.current.uvIndex (NEW)", safe_get(sc, "weather.current.uvIndex")),
        ("weather.current.humidity", safe_get(sc, "weather.current.humidity")),
        ("weather.current.wind", safe_get(sc, "weather.current.wind")),
        ("weather.forecast", f"{len(safe_get(sc, 'weather.forecast') or [])} days"),
        ("weather.seasonal (NEW)", bool(safe_get(sc, "weather.seasonal"))),
        ("links.trailverse", bool(safe_get(sc, "links.trailverse"))),
        ("links.planTrip", bool(safe_get(sc, "links.planTrip"))),
    ]
    # alert URL check
    alerts = sc.get("alerts", [])
    has_alert_url = any(a.get("url") for a in alerts)
    checks.append(("alert[].url (NEW)", has_alert_url if alerts else "no alerts"))
    # campground detail
    cg = sc.get("campgrounds", [])
    if cg:
        checks.append(("campground[0] keys", list(cg[0].keys())))
    # editorial
    ed = safe_get(sc, "editorial")
    if ed:
        aag = ed.get("atAGlance")
        checks.append(("editorial.atAGlance type (FIX)", type(aag).__name__))

    if not report(checks):
        all_pass = False

    # ====== 2. ITINERARY ======
    print(f"\n{B}{'=' * 60}")
    print(f"2. ITINERARY (plan_trip)")
    print(f"{'=' * 60}{X}")
    r = await plan_trip(
        message="Plan a 2-day trip to Zion for beginners in May",
        park_code="zion",
        days=2,
    )
    sc = r.structuredContent
    checks = [
        ("parkName", sc.get("parkName")),
        ("sessionId", bool(sc.get("sessionId"))),
        ("itinerary", bool(sc.get("itinerary"))),
        ("itinerary.days", f"{len(safe_get(sc, 'itinerary.days') or [])} days"),
        ("dayMaps (NEW)", f"{len(sc.get('dayMaps', []))} maps"),
        ("parkImages (NEW)", f"{len(sc.get('parkImages', []))} images"),
        ("narrative", bool(sc.get("narrative"))),
        ("links.continueOnWebsite", bool(safe_get(sc, "links.continueOnWebsite"))),
    ]
    dm = sc.get("dayMaps", [])
    if dm:
        checks.append(("dayMap[0] keys", list(dm[0].keys())))
        checks.append(("dayMap[0].url", bool(dm[0].get("url"))))
    pi = sc.get("parkImages", [])
    if pi:
        checks.append(("parkImage[0].url", bool(pi[0].get("url"))))

    if not report(checks):
        all_pass = False

    # ====== 3. COMPARE ======
    print(f"\n{B}{'=' * 60}")
    print(f"3. COMPARE (zion vs brca)")
    print(f"{'=' * 60}{X}")
    r = await compare_parks(park_codes=["zion", "brca"])
    sc = r.structuredContent
    checks = [
        ("parks", f"{len(sc.get('parks', []))} parks"),
        ("highlights", bool(sc.get("highlights"))),
        ("links.continueOnWebsite", bool(safe_get(sc, "links.continueOnWebsite"))),
        ("links.directionsUrl (NEW)", bool(safe_get(sc, "links.directionsUrl"))),
    ]
    parks = sc.get("parks", [])
    if parks:
        p = parks[0]
        checks += [
            ("park[0].name", p.get("name")),
            ("park[0].parkCode", p.get("parkCode")),
            ("park[0].heroImage", bool(p.get("heroImage"))),
            ("park[0].reviewCount", p.get("reviewCount", "N/A")),
        ]

    if not report(checks):
        all_pass = False

    # ====== 4. SEARCH ======
    print(f"\n{B}{'=' * 60}")
    print(f"4. SEARCH (UT, limit=3)")
    print(f"{'=' * 60}{X}")
    r = await search_parks(state="UT", limit=3)
    sc = r.structuredContent
    checks = [
        ("parks", f"{len(sc.get('parks', []))} parks"),
        ("count", sc.get("count")),
        ("links.exploreAll", bool(safe_get(sc, "links.exploreAll"))),
    ]
    parks = sc.get("parks", [])
    if parks:
        p = parks[0]
        checks += [
            ("park[0].name", p.get("name")),
            ("park[0].parkCode", p.get("parkCode")),
            ("park[0].heroImage", bool(p.get("heroImage"))),
            ("park[0].mapsUrl (NEW)", bool(p.get("mapsUrl"))),
        ]

    if not report(checks):
        all_pass = False

    # ====== 5. EVENTS ======
    print(f"\n{B}{'=' * 60}")
    print(f"5. EVENTS (zion, limit=5)")
    print(f"{'=' * 60}{X}")
    r = await find_events(park_code="zion", limit=5)
    sc = r.structuredContent
    evts = sc.get("events", [])
    has_recurring = any(e.get("recurring") for e in evts)
    has_free = any(e.get("isFree") for e in evts)
    has_date_end = any(e.get("dateEnd") for e in evts)
    checks = [
        ("events", f"{len(evts)} events"),
        ("recurring (NEW)", has_recurring),
        ("isFree (NEW)", has_free),
        ("dateEnd (NEW)", has_date_end),
    ]
    if evts:
        checks.append(("event[0] keys", list(evts[0].keys())))

    if not report(checks):
        all_pass = False

    # ====== SUMMARY ======
    print(f"\n{'=' * 60}")
    if all_pass:
        print(f"{G}{B}ALL WIDGET DATA VERIFIED — every field present{X}")
    else:
        print(f"{Y}{B}SOME FIELDS MISSING — see MISS above{X}")
        print("(permits may be empty if park has none — that's OK)")
    sys.exit(0 if all_pass else 1)


if __name__ == "__main__":
    asyncio.run(main())
