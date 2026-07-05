"""
Formatters that convert raw TrailVerse backend responses into the
structuredContent shape our widgets expect, plus rich text for LLMs.

Each formatter returns a tuple: (structured_content_dict, text_for_llm).
- structured_content: optional JSON payload (only sent when MCP_ENABLE_WIDGETS=true)
- text_for_llm: full Trailie markdown — primary output for ChatGPT, Claude, and all MCP clients
"""
from __future__ import annotations

import os
import re
from datetime import datetime
from typing import Any
from urllib.parse import quote

from .client import extract_itinerary, strip_itinerary_block

WEB_BASE = os.getenv(
    "TRAILVERSE_WEB_BASE", "https://www.nationalparksexplorerusa.com"
).rstrip("/")

def _format_forecast_date(date_str: str | None) -> str:
    """Convert an ISO date string to a readable format like 'Thu May 08'."""
    if not date_str:
        return "Upcoming"
    try:
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
        return dt.strftime("%a %b %d")
    except (ValueError, AttributeError):
        return date_str


def _smart_truncate(text: str, max_len: int = 200) -> str:
    """Truncate text on a sentence boundary when possible."""
    if not text or len(text) <= max_len:
        return text
    cutoff = text[:max_len].rsplit(". ", 1)[0]
    if cutoff and len(cutoff) > max_len // 2:
        return cutoff + "."
    return text[:max_len].rsplit(" ", 1)[0] + "..."


_HIGH_PRIORITY_KEYWORDS = (
    "closure", "closed", "fire", "water", "flood", "flash flood",
    "permit required", "danger", "warning", "hazard", "restricted",
    "evacuation", "avalanche", "rescue",
)


def _is_high_priority_alert(alert: dict) -> bool:
    """Check if an alert is safety-critical based on keywords in its text."""
    text = (
        (alert.get("title") or "")
        + " " + (alert.get("category") or "")
        + " " + (alert.get("description") or "")
    ).lower()
    return any(k in text for k in _HIGH_PRIORITY_KEYWORDS)


def _google_maps_point_url(lat: float | str | None, lng: float | str | None, name: str = "") -> str | None:
    """Build a Google Maps URL for a single point (park location)."""
    if name:
        return f"https://www.google.com/maps/search/?api=1&query={quote(name)}"
    if lat is not None and lng is not None:
        return f"https://www.google.com/maps/search/?api=1&query={lat},{lng}"
    return None


def _google_maps_directions_url(parks: list[dict[str, Any]]) -> str | None:
    """Build a Google Maps directions URL between multiple parks."""
    waypoints = []
    for p in parks:
        name = p.get("fullName") or p.get("name") or ""
        if name:
            waypoints.append(quote(name))
        else:
            lat = p.get("latitude")
            lng = p.get("longitude")
            if lat is not None and lng is not None:
                waypoints.append(f"{lat},{lng}")
    if len(waypoints) < 2:
        return None
    return f"https://www.google.com/maps/dir/{'/'.join(waypoints)}"

_TAG_RE = re.compile(r"<[^>]+>")

# Patterns the backend AI uses to end responses with offers — strip these.
_OFFER_RE = re.compile(
    r"\n+(?:Want me to|Should I|Would you like me to|Let me know if|I can also|"
    r"If you'd like|If you want me to|Happy to|Shall I)[^\n]*(?:\?[^\n]*)?\s*$",
    re.IGNORECASE,
)


def _strip_trailing_offers(text: str) -> str:
    """Remove trailing 'Want me to...' style offers from backend AI responses."""
    # Repeatedly strip — sometimes there are multiple trailing questions
    for _ in range(3):
        cleaned = _OFFER_RE.sub("", text).rstrip()
        if cleaned == text.rstrip():
            break
        text = cleaned
    return text


def _strip_html(text: str) -> str:
    """Remove HTML tags and collapse whitespace."""
    return " ".join(_TAG_RE.sub("", text).split())


def _is_link_placeholder_description(desc: str) -> bool:
    """NPS alerts often say 'Visit this link…' with the real content on the URL."""
    if not desc:
        return True
    lower = desc.lower()
    placeholders = (
        "visit this link",
        "click here",
        "see link",
        "follow this link",
        "check this link",
        "read more at",
        "more information",
    )
    return any(p in lower for p in placeholders) or len(desc) < 45


def _normalize_alert(raw: dict[str, Any]) -> dict[str, Any]:
    title = _strip_html(raw.get("title") or "") or "Alert"
    category = _strip_html(raw.get("category") or "")
    url = (raw.get("url") or "").strip() or None
    desc = _strip_html(raw.get("description") or "")
    if url and _is_link_placeholder_description(desc):
        desc = ""
    elif desc:
        desc = _smart_truncate(desc, 650)
    return {
        "title": title,
        "category": category,
        "description": desc,
        "url": url,
    }


def _format_alert_markdown(alert: dict[str, Any], *, high_priority: bool = False) -> str:
    """One alert as markdown with a working NPS link when the API only teases a URL."""
    title = alert.get("title") or "Alert"
    category = alert.get("category") or ""
    desc = alert.get("description") or ""
    url = alert.get("url")
    prefix = "⚠️" if high_priority else "📋"
    cat = f" ({category})" if category else ""

    if url and not desc:
        return f"{prefix} **{title}**{cat}: [Read full details on NPS.gov]({url})"
    if url and desc:
        return (
            f"{prefix} **{title}**{cat}: {desc} "
            f"[Full alert on NPS.gov]({url})"
        )
    if desc:
        return f"{prefix} **{title}**{cat}: {desc}"
    return f"{prefix} **{title}**{cat}"


def _format_images_markdown(park: dict[str, Any], limit: int = 5) -> str:
    """Hero + gallery as markdown for LLM clients (ChatGPT renders ![alt](url))."""
    hero = _pick_image(park)
    gallery = _pick_images(park, limit=8)
    lines: list[str] = []
    seen: set[str] = set()

    def _alt_for(img: dict[str, str | None] | None, fallback: str) -> str:
        raw = (img or {}).get("altText") or (img or {}).get("title") or fallback
        return raw.replace("[", "(").replace("]", ")")

    park_name = park.get("fullName") or park.get("name") or "National Park"

    if hero:
        first = gallery[0] if gallery else None
        lines.append(f"![{_alt_for(first, park_name)}]({hero})")
        seen.add(hero)

    for img in gallery:
        url = img.get("url")
        if not url or url in seen:
            continue
        seen.add(url)
        lines.append(f"![{_alt_for(img, park_name)}]({url})")
        if len(lines) >= limit:
            break

    if not lines:
        return ""
    return "## Photos\n\n" + "\n\n".join(lines)


def _build_day_maps_url(stops: list[dict[str, Any]]) -> str | None:
    """Build a Google Maps directions URL from a day's stops.

    Uses stop names when available, falls back to lat,lng coordinates.
    Returns None if fewer than 1 stop has location data.
    """
    waypoints = []
    for s in stops:
        lat = s.get("latitude")
        lng = s.get("longitude")
        name = s.get("name") or ""
        if lat is not None and lng is not None:
            # Prefer name for readability in Google Maps, fall back to coords
            waypoints.append(quote(name) if name else f"{lat},{lng}")
        elif name:
            waypoints.append(quote(name))
    if len(waypoints) < 1:
        return None
    return f"https://www.google.com/maps/dir/{'/'.join(waypoints)}"


# ---------- plan_trip ----------

def format_plan_trip(
    resp: dict[str, Any],
    *,
    user_message: str,
    park_code_hint: str = "",
    park_name_hint: str = "",
) -> tuple[dict[str, Any], str]:
    """Format an AI planner response into widget + text."""
    data = resp.get("data", resp)  # support both wrapped and unwrapped shapes
    content = data.get("content") or ""
    # The backend now returns the parsed itinerary directly (stripped from content).
    # Fall back to extracting from content only if the backend didn't provide it.
    itinerary = data.get("itinerary") or extract_itinerary(content)
    clean_text = strip_itinerary_block(content)

    confidence = data.get("confidence") or {}
    plan_score = data.get("planScore") or {}
    park_name = (
        data.get("parkName")
        or (itinerary.get("parkName") if itinerary else None)
        or park_name_hint
        or None
    )
    park_code = (itinerary.get("parkCode") if itinerary else None) or park_code_hint or ""

    # Park images for visual richness (backend returns up to 12)
    raw_images = data.get("parkImages") or []
    park_images = [
        {"url": img.get("url"), "altText": img.get("altText") or img.get("title")}
        for img in raw_images[:4]
        if isinstance(img, dict) and img.get("url")
    ]

    structured = {
        "kind": "itinerary",
        "parkName": park_name,
        "parkCode": park_code,
        "parkImages": park_images,
        "persona": "trailie",
        "provider": data.get("provider") or "claude",
        "model": data.get("model"),
        "hasItinerary": bool(itinerary),
        "intent": data.get("intent"),
        "confidence": {
            "level": confidence.get("level"),
            "score": confidence.get("score"),
        },
        "planScore": {
            "overall": plan_score.get("overall"),
            "label": plan_score.get("label"),
            "dimensions": plan_score.get("dimensions") or {},
        },
        "narrative": clean_text,
        "itinerary": itinerary,
        "links": {
            "continueOnWebsite": f"{WEB_BASE}/plan-ai",
            "parkDetail": f"{WEB_BASE}/parks/{park_code}" if park_code else None,
        },
    }

    # Text content the model sees — include the full narrative so LLMs that
    # don't render structuredContent widgets (e.g. Claude) can still give a
    # rich response.  ChatGPT will render the widget and may summarize.
    text = ""
    if clean_text:
        text = _strip_trailing_offers(clean_text)
    else:
        summary_parts = []
        if park_name:
            summary_parts.append(f"Trip plan for {park_name}")
        if itinerary and itinerary.get("days"):
            summary_parts.append(f"{len(itinerary['days'])}-day itinerary")
        text = ", ".join(summary_parts) if summary_parts else "Trip planning response"

    # Build Google Maps direction links per day from itinerary stops
    day_maps: list[dict[str, str | None]] = []
    if itinerary and itinerary.get("days"):
        map_lines = []
        for day in itinerary["days"]:
            stops = day.get("stops") or []
            day_label = day.get("label") or f"Day {day.get('dayNumber', '?')}"
            url = _build_day_maps_url(stops)
            day_maps.append({"day": day_label, "url": url})
            if url:
                map_lines.append(f"- [{day_label}]({url})")
        if map_lines:
            text += "\n\n**Google Maps directions:**\n" + "\n".join(map_lines)

    structured["dayMaps"] = day_maps

    text += f"\n\nContinue planning at {WEB_BASE}/plan-ai"
    if park_code:
        text += f" | Park details: {WEB_BASE}/parks/{park_code}"

    return structured, text


# ---------- get_park_details ----------

def format_park_details(
    details: dict[str, Any],
    alerts: dict[str, Any] | None = None,
    weather: dict[str, Any] | None = None,
    campgrounds: dict[str, Any] | None = None,
    permits: dict[str, Any] | None = None,
    park_of_day: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], str]:
    """Combine park details, alerts, weather, and daily-feed editorial into one payload."""
    outer = details.get("data") or details
    # The /details endpoint wraps the park object inside a "park" key
    park = outer.get("park") or outer
    park_code = park.get("parkCode") or park.get("code") or ""
    name = park.get("fullName") or park.get("name") or park_code

    # Normalize alert data
    alert_list = []
    if alerts:
        raw_alerts = alerts.get("data") or alerts.get("alerts") or alerts
        if isinstance(raw_alerts, list):
            for a in raw_alerts[:6]:
                if isinstance(a, dict):
                    alert_list.append(_normalize_alert(a))

    # Normalize campground data
    campground_list: list[dict[str, Any]] = []
    if campgrounds:
        raw_cg = campgrounds.get("data") or campgrounds.get("campgrounds") or campgrounds
        if isinstance(raw_cg, list):
            for cg in raw_cg:
                if not isinstance(cg, dict):
                    continue
                fees = cg.get("fees") or []
                first_fee = None
                if isinstance(fees, list) and fees:
                    f = fees[0]
                    if isinstance(f, dict):
                        first_fee = f"${f.get('cost', '?')}/night"
                campground_list.append({
                    "name": cg.get("name"),
                    "totalSites": cg.get("campsites", {}).get("totalSites") if isinstance(cg.get("campsites"), dict) else None,
                    "fee": first_fee,
                    "reservationInfo": _smart_truncate(
                        _strip_html(cg.get("reservationInfo") or ""), 500
                    ) if cg.get("reservationInfo") else "",
                    "reservationUrl": cg.get("reservationUrl"),
                    "operatingHours": cg.get("operatingHours"),
                })

    # Normalize permit data (from RIDB / Recreation.gov)
    permit_list: list[dict[str, Any]] = []
    if permits:
        raw_permits = permits.get("data") or permits.get("permits") or permits
        if isinstance(raw_permits, list):
            for p in raw_permits:
                if not isinstance(p, dict):
                    continue
                permit_list.append({
                    "name": p.get("name"),
                    "type": p.get("type"),
                    "reservationUrl": p.get("reservationUrl"),
                })

    # Normalize weather — backend nests current conditions inside data.current
    current = {}
    forecast = []
    seasonal = {}
    if weather:
        w = weather.get("data") or weather
        # Current conditions may be at top level or nested in a "current" key
        cur = w.get("current") or w
        current = {
            "tempF": cur.get("tempF") or cur.get("temperature") or cur.get("temp"),
            "description": cur.get("description") or cur.get("condition"),
            "humidity": cur.get("humidity"),
            "windMph": cur.get("windMph") or cur.get("windSpeed") or cur.get("wind"),
            "feelsLike": cur.get("feelsLike"),
            "uvIndex": cur.get("uvIndex"),
        }
        # Seasonal averages (summer/winter/spring/fall highs and lows)
        seasonal = w.get("seasonal") or {}
        # 5-day forecast if available (some backends provide it)
        fc = w.get("forecast") or []
        if isinstance(fc, list):
            forecast = [
                {
                    "date": f.get("date"),
                    "highF": f.get("highF") or f.get("high"),
                    "lowF": f.get("lowF") or f.get("low"),
                    "description": f.get("description") or f.get("condition"),
                }
                for f in fc[:5]
            ]

    # Daily feed editorial (only surface if the feed is actually about this park)
    editorial: dict[str, Any] | None = None
    if park_of_day:
        pod = park_of_day.get("data") or park_of_day
        pod_code = (pod.get("parkCode") or "").lower()
        # Only include if the feed is about the requested park. This prevents
        # surfacing stale "park of the day" content for an unrelated park.
        if not pod_code or pod_code == park_code.lower():
            editorial = {
                "leadInsight": pod.get("leadInsight") or pod.get("summary"),
                "weatherInsight": pod.get("weatherAnalysis") or pod.get("weatherInsight"),
                "skyInsight": pod.get("skyAnalysis") or pod.get("skyInsight"),
                "atAGlance": pod.get("atAGlance"),
            }
            # Drop the dict if every value is None
            if not any(editorial.values()):
                editorial = None

    maps_url = _google_maps_point_url(park.get("latitude"), park.get("longitude"), name)
    directions_info = park.get("directionsInfo") or ""
    directions_for_widget = (
        _smart_truncate(_strip_html(directions_info), 480) if directions_info else ""
    )

    structured = {
        "kind": "park_details",
        "parkCode": park_code,
        "name": name,
        "designation": park.get("designation"),
        "states": park.get("states"),
        "description": park.get("description") or park.get("summary"),
        "heroImage": _pick_image(park),
        "images": _pick_images(park, 6),
        "activities": _pick_activities(park),
        "entranceFees": park.get("entranceFees") or [],
        "operatingHours": park.get("operatingHours") or [],
        "addresses": park.get("addresses") or [],
        "weather": {"current": current, "forecast": forecast, "seasonal": seasonal},
        "alerts": alert_list,
        "campgrounds": campground_list,
        "permits": permit_list,
        "editorial": editorial,
        "directionsInfo": directions_for_widget or None,
        "links": {
            "trailverse": f"{WEB_BASE}/parks/{park_code}",
            "planTrip": f"{WEB_BASE}/plan-ai?parkCode={park_code}",
            "maps": maps_url,
        },
    }

    # Build a COMPLETE pre-formatted response in the Trailie voice.
    # Claude should relay this as-is rather than reformat it.
    text_lines = [f"# {name}"]
    if park.get("states"):
        text_lines[0] += f" — {park['states']}"

    photos_md = _format_images_markdown(park, limit=5)
    if photos_md:
        text_lines.append("")
        text_lines.append(photos_md)

    # Lead with alerts — they affect the trip (NPS often only links out for full text)
    if alert_list:
        text_lines.append("\n## Active Alerts")
        closures = [a for a in alert_list if _is_high_priority_alert(a)]
        info_alerts = [a for a in alert_list if a not in closures]
        for a in closures:
            text_lines.append(_format_alert_markdown(a, high_priority=True))
        if info_alerts:
            if closures:
                text_lines.append("")
            for a in info_alerts:
                text_lines.append(_format_alert_markdown(a, high_priority=False))

    # Weather section — cite actual numbers, or note unavailability
    has_weather = current and current.get("tempF") is not None
    if not has_weather and not forecast and not seasonal:
        text_lines.append(f"\n## Weather")
        text_lines.append("Live weather data is temporarily unavailable. Check [current conditions on NPS.gov](https://www.nps.gov/{}/planyourvisit/conditions.htm) before your trip.".format(park_code))
    if has_weather:
        text_lines.append(f"\n## Right Now")
        wx = f"**{current['tempF']}°F**"
        if current.get("description"):
            wx += f", {current['description']}"
        if current.get("feelsLike") is not None:
            wx += f" (feels like {current['feelsLike']}°F)"
        text_lines.append(wx)
        details = []
        if current.get("humidity"):
            details.append(f"Humidity: {current['humidity']}%")
        if current.get("windMph"):
            details.append(f"Wind: {current['windMph']} mph")
        if current.get("uvIndex") is not None:
            details.append(f"UV: {current['uvIndex']}")
        if details:
            text_lines.append(" | ".join(details))

    if forecast:
        text_lines.append("\n**5-day forecast:**")
        for f in forecast:
            fc_line = f"- {_format_forecast_date(f.get('date'))}: "
            if f.get("highF") is not None and f.get("lowF") is not None:
                fc_line += f"{f['highF']}°F / {f['lowF']}°F"
            if f.get("description"):
                fc_line += f" — {f['description']}"
            text_lines.append(fc_line)
    elif seasonal:
        text_lines.append("\n**Seasonal temps** (plan accordingly):")
        for season in ("spring", "summer", "fall", "winter"):
            s = seasonal.get(season)
            if isinstance(s, dict) and s.get("high") is not None:
                text_lines.append(f"- {season.capitalize()}: {s['high']}°F high / {s['low']}°F low")

    # Crowd level
    if editorial and editorial.get("atAGlance"):
        glance = editorial["atAGlance"]
        if isinstance(glance, dict) and glance.get("crowdLevel"):
            text_lines.append(f"\n**Crowds right now:** {glance['crowdLevel']}")

    # The park itself
    desc = park.get("description") or park.get("summary")
    if desc:
        text_lines.append(f"\n## The Park")
        text_lines.append(desc)

    # Activities
    activities = _pick_activities(park)
    if activities:
        text_lines.append(f"\n## What You Can Do")
        text_lines.append(", ".join(activities))

    # Fees & hours
    fees = park.get("entranceFees") or []
    hours = park.get("operatingHours") or []
    if fees or hours:
        text_lines.append(f"\n## Logistics")
    if fees:
        text_lines.append("**Entrance fees:**")
        for f in fees[:4]:
            if isinstance(f, dict) and f.get("title"):
                cost = f.get("cost", "?")
                text_lines.append(f"- {f['title']}: ${cost}")
    if hours:
        text_lines.append("\n**Hours:**")
        for h in hours:
            if isinstance(h, dict):
                hname = h.get("name") or "Standard"
                hdesc = _strip_html(h.get("description") or "")
                if hdesc:
                    text_lines.append(f"- {hname}: {_smart_truncate(hdesc, 500)}")
                else:
                    text_lines.append(f"- {hname}")

    # Campgrounds — real reservation data from NPS API (top 5, most sites first)
    if campground_list:
        sorted_cg = sorted(
            campground_list,
            key=lambda c: int(c.get("totalSites") or 0),
            reverse=True,
        )
        top_cg = sorted_cg[:5]
        text_lines.append(f"\n## Campgrounds ({len(campground_list)} total — top {len(top_cg)} shown)")
        for cg in top_cg:
            cg_name = cg.get("name") or "Unnamed"
            parts = [f"**{cg_name}**"]
            if cg.get("totalSites"):
                parts.append(f"{cg['totalSites']} sites")
            if cg.get("fee"):
                parts.append(cg["fee"])
            line = " — ".join(parts)
            text_lines.append(line)
            if cg.get("reservationInfo"):
                text_lines.append(f"  {cg['reservationInfo']}")
            if cg.get("reservationUrl"):
                text_lines.append(f"  [Book on Recreation.gov]({cg['reservationUrl']})")

    # Permits & timed entry — from Recreation.gov (RIDB)
    # NOTE: RIDB lists facilities that may not be active every year.
    # Timed entry policies change annually (e.g. Yosemite, Arches, Glacier
    # dropped timed entry for 2026). We use cautious wording accordingly.
    if permit_list:
        has_timed = any(
            (p.get("type") or "").lower() in ("timed entry", "timed-entry")
            for p in permit_list
        )
        text_lines.append(f"\n## Permits & Reservations")
        if has_timed:
            text_lines.append("⚠️ IMPORTANT: Timed-entry listings below are from Recreation.gov but do NOT confirm the requirement is currently active. Many parks (Yosemite, Arches, Glacier, Mt Rainier) dropped timed entry for 2026. Do NOT state timed entry is required — say \"check Recreation.gov to see if timed entry is currently needed\" and link the URL.")
            text_lines.append("If timed entry is NOT required: warn users this means NO crowd control — expect heavier traffic, packed trailheads and parking lots, arrive before 7am for popular spots, and consider weekdays over weekends.")
        for p in permit_list:
            pname = p.get("name") or "Permit"
            ptype = p.get("type") or ""
            url = p.get("reservationUrl") or ""
            is_timed = ptype.lower() in ("timed entry", "timed-entry")
            if url:
                if is_timed:
                    text_lines.append(f"- **{pname}** [Timed Entry — STATUS UNKNOWN]: [Check if needed on Recreation.gov]({url})")
                else:
                    text_lines.append(f"- **{pname}** [Permit]: [Book on Recreation.gov]({url})")
            else:
                text_lines.append(f"- **{pname}** [{ptype}]")
    else:
        text_lines.append(f"\n## Permits & Reservations")
        text_lines.append("No permit or timed-entry requirements found on Recreation.gov for this park.")

    # Getting there — Google Maps link
    if maps_url:
        text_lines.append(f"\n## Getting There")
        text_lines.append(f"[Open in Google Maps]({maps_url})")
        if directions_for_widget:
            text_lines.append(
                _smart_truncate(_strip_html(directions_info), 1200)
            )

    # Editorial insight
    if editorial and editorial.get("leadInsight"):
        text_lines.append(f"\n## Insider Tip")
        text_lines.append(editorial["leadInsight"])

    # TrailVerse link
    text_lines.append(f"\n---\nExplore more on [TrailVerse]({WEB_BASE}/parks/{park_code}) | [Plan a trip]({WEB_BASE}/plan-ai?parkCode={park_code})")

    text = "\n".join(text_lines)
    return structured, text


def _pick_image(park: dict[str, Any]) -> str | None:
    images = park.get("images") or []
    if isinstance(images, list) and images:
        first = images[0]
        if isinstance(first, dict):
            return first.get("url")
    return park.get("heroImage") or park.get("image")


def _pick_images(park: dict[str, Any], limit: int = 6) -> list[dict[str, str | None]]:
    """Return up to `limit` gallery images as lightweight dicts (deduped by URL)."""
    images = park.get("images") or []
    result: list[dict[str, str | None]] = []
    seen: set[str] = set()
    if isinstance(images, list):
        for img in images:
            if isinstance(img, dict) and img.get("url"):
                url = img["url"]
                if url in seen:
                    continue
                seen.add(url)
                result.append({
                    "url": url,
                    "altText": img.get("altText") or img.get("title"),
                    "title": img.get("title"),
                })
                if len(result) >= limit:
                    break
    return result


def _pick_activities(park: dict[str, Any]) -> list[str]:
    acts = park.get("activities") or []
    if isinstance(acts, list):
        return [a.get("name") if isinstance(a, dict) else str(a) for a in acts[:12]]
    return []


# ---------- compare_parks ----------

def format_compare(
    compare: dict[str, Any],
    summary: dict[str, Any] | None = None,
) -> tuple[dict[str, Any], str]:
    """Format the compare response into a table-ready widget payload."""
    parks_raw = compare.get("data") or compare.get("parks") or []
    if isinstance(parks_raw, dict) and "parks" in parks_raw:
        parks_raw = parks_raw["parks"]

    parks: list[dict[str, Any]] = []
    for p in parks_raw if isinstance(parks_raw, list) else []:
        code = p.get("parkCode") or p.get("code")

        # crowdLevel: nested object → string
        crowd = p.get("crowdLevel")
        if isinstance(crowd, dict):
            crowd = crowd.get("level") or crowd.get("crowdLevel") or "Unknown"

        # rating: nested in reviews object
        reviews = p.get("reviews") or {}
        rating = p.get("rating") or (reviews.get("averageRating") if isinstance(reviews, dict) else None)
        review_count = p.get("reviewCount") or (reviews.get("totalReviews") if isinstance(reviews, dict) else None)

        # temperature: nested in weather.current
        weather = p.get("weather") or {}
        current_wx = weather.get("current") or {} if isinstance(weather, dict) else {}
        temp = p.get("currentTempF") or current_wx.get("temperature")

        # entrance fee: nested in entranceFees array
        fee = p.get("entranceFee")
        if not fee:
            fees_arr = p.get("entranceFees") or []
            if isinstance(fees_arr, list) and fees_arr:
                cost = fees_arr[0].get("cost") if isinstance(fees_arr[0], dict) else None
                if cost is not None:
                    try:
                        fee = f"${float(cost):.2f}"
                    except (ValueError, TypeError):
                        fee = str(cost)

        # activities: nested in activities array or topActivities
        top_acts = p.get("topActivities") or []
        if not top_acts:
            acts_arr = p.get("activities") or []
            if isinstance(acts_arr, list):
                for a in acts_arr[:5]:
                    name = a.get("name") if isinstance(a, dict) else str(a)
                    if name:
                        top_acts.append(name)

        parks.append({
            "parkCode": code,
            "name": p.get("fullName") or p.get("name"),
            "designation": p.get("designation"),
            "states": p.get("states"),
            "latitude": p.get("latitude"),
            "longitude": p.get("longitude"),
            "rating": rating,
            "reviewCount": review_count,
            "currentTempF": temp,
            "crowdLevel": crowd,
            "entranceFee": fee,
            "topActivities": top_acts[:5],
            "heroImage": _pick_image(p),
            "link": f"{WEB_BASE}/parks/{code}" if code else None,
        })

    highlights = {}
    if summary:
        s = summary.get("data") or summary

        # bestOverall may be an object — flatten to park name
        best = s.get("bestOverall")
        if isinstance(best, dict):
            best = best.get("parkName") or best.get("name")

        # warmest: may be nested in weatherComparison
        warmest = s.get("warmest")
        if not warmest:
            wx_cmp = s.get("weatherComparison") or {}
            w_obj = wx_cmp.get("warmest")
            if isinstance(w_obj, dict):
                warmest = w_obj.get("parkName")

        # lowerCrowd: may be nested in crowdComparison
        lower_crowd = s.get("lowerCrowd")
        if not lower_crowd:
            crowd_cmp = s.get("crowdComparison") or {}
            lc_obj = crowd_cmp.get("leastCrowded")
            if isinstance(lc_obj, dict):
                lower_crowd = lc_obj.get("parkName")

        # sharedHighlights: may be in commonActivities
        shared = s.get("sharedHighlights") or s.get("commonActivities") or []

        highlights = {
            "bestOverall": best,
            "warmest": warmest,
            "lowerCrowd": lower_crowd,
            "sharedHighlights": shared if isinstance(shared, list) else [],
        }

    codes = [p["parkCode"] for p in parks if p.get("parkCode")]
    directions_url = _google_maps_directions_url(parks)
    structured = {
        "kind": "compare",
        "parks": parks,
        "highlights": highlights,
        "links": {
            "continueOnWebsite": f"{WEB_BASE}/compare?parks={','.join(codes)}" if codes else f"{WEB_BASE}/compare",
            "planRoadTrip": f"{WEB_BASE}/plan-ai?parks={','.join(codes)}" if codes else None,
            "directionsUrl": directions_url,
        },
    }

    # Build a COMPLETE pre-formatted comparison response in Trailie voice.
    names = [p["name"] for p in parks if p.get("name")]
    text_lines = []

    # Decision lead — pick a winner
    if highlights and highlights.get("bestOverall"):
        winner = highlights["bestOverall"]
        loser_names = [n for n in names if n != winner]
        text_lines.append(f"**Go with {winner}.**")
        if highlights.get("lowerCrowd") and highlights["lowerCrowd"] == winner:
            text_lines.append(f"It's less crowded right now than {', '.join(loser_names)}.")
        elif highlights.get("warmest") and highlights["warmest"] == winner:
            text_lines.append(f"Warmer weather right now than {', '.join(loser_names)}.")
    else:
        text_lines.append(f"Here's how {' and '.join(names)} stack up right now:")

    # Comparison table
    text_lines.append("\n## Side-by-Side")
    # Build markdown table
    header = "| | " + " | ".join(p.get("name", "?") for p in parks) + " |"
    sep = "|---|" + "|".join(["---"] * len(parks)) + "|"
    text_lines.append(header)
    text_lines.append(sep)

    # Temperature row
    temp_row = "| **Temp** | " + " | ".join(
        f"{p['currentTempF']}°F" if p.get("currentTempF") is not None else "—"
        for p in parks
    ) + " |"
    text_lines.append(temp_row)

    # Crowds row
    crowd_row = "| **Crowds** | " + " | ".join(
        str(p.get("crowdLevel") or "—") for p in parks
    ) + " |"
    text_lines.append(crowd_row)

    # Fees row
    fee_row = "| **Entry fee** | " + " | ".join(
        str(p.get("entranceFee") or "—") for p in parks
    ) + " |"
    text_lines.append(fee_row)

    # Activities row
    act_row = "| **Top activities** | " + " | ".join(
        ", ".join(p.get("topActivities", [])[:3]) or "—" for p in parks
    ) + " |"
    text_lines.append(act_row)

    # State row
    state_row = "| **Location** | " + " | ".join(
        p.get("states") or "—" for p in parks
    ) + " |"
    text_lines.append(state_row)

    # Driving directions between parks
    directions_url = _google_maps_directions_url(parks)
    if directions_url:
        text_lines.append(f"\n## Getting Between Them")
        text_lines.append(f"[Driving directions on Google Maps]({directions_url})")

    # When to choose each
    text_lines.append("\n## The Verdict")
    for p in parks:
        pname = p.get("name", "Unknown")
        acts = ", ".join(p.get("topActivities", [])[:3])
        text_lines.append(f"- **{pname}**: Best if you want {acts.lower() if acts else 'a classic park experience'}.")

    if highlights and highlights.get("sharedHighlights"):
        text_lines.append(f"\nBoth share: {', '.join(highlights['sharedHighlights'])}")

    # Links
    text_lines.append(f"\n---\nFull comparison on [TrailVerse]({structured['links']['continueOnWebsite']})")
    if structured["links"].get("planRoadTrip"):
        text_lines.append(f" | [Plan a road trip hitting both]({structured['links']['planRoadTrip']})")

    text = "\n".join(text_lines)
    return structured, text


# ---------- search_parks ----------

def _search_framing_sentence(query: str | None, park_count: int) -> str:
    """One-line intro: what this list is optimized for."""
    if not query or not query.strip():
        return (
            f"TrailVerse ranked **{park_count}** NPS sites from live data. "
            "Best fits first; more options below."
        )
    q = query.lower()
    goals: list[str] = []
    if re.search(r"\b(quiet|peaceful|calm|less crowded|underrated)\b", q):
        goals.append("peaceful pace over headline-park crowds")
    if re.search(r"\b(couples?|romantic|honeymoon)\b", q):
        goals.append("scenery and shared experiences for two")
    if re.search(r"\b(beginners?|first[- ]?time|first visit)\b", q):
        goals.append("easier trails and low-stress planning")
    if re.search(r"\b(photography|photo spots?|scenic shots?)\b", q):
        goals.append("views and photo-friendly landscapes")
    if re.search(r"\bnational\s+parks?\b", q) and not re.search(
        r"\b(lakeshores?|seashores?|monuments?)\b", q
    ):
        goals.append("National Park designations only")
    if re.search(
        r"\b(cool|cooler|beat the heat|escape the heat|mild)\b", q
    ) and re.search(r"\b(july|summer|june|august)\b", q):
        goals.append("cooler summer weather")
    if not goals:
        return (
            f"TrailVerse ranked **{park_count}** NPS sites from live data. "
            "Lead with your top pick, then 2–4 strong alternates from the list below."
        )
    return (
        f"TrailVerse ranked **{park_count}** parks for **{', '.join(goals)}**. "
        "Lead with one clear recommendation, then a few alternates — not a flat dump."
    )


def _search_headline(query: str | None) -> str:
    if not query or not query.strip():
        return "NPS sites for you"
    headline = query.strip().rstrip("?").strip()
    if len(headline) > 80:
        headline = headline[:77] + "…"
    return headline[0].upper() + headline[1:] if headline else "NPS sites for you"


_PARK_LOGISTICS_NOTES: dict[str, str] = {
    "wrst": "Alaska bush country — usually fly or long drive from Anchorage; multi-day trip.",
    "glba": "Southeast Alaska — most visitors arrive by cruise or floatplane.",
    "katm": "Alaska interior — bush plane or long drive; short summer window.",
    "dena": "Alaska — one road in; book lodges and transit early.",
    "isro": "Lake Superior island — ferry or seaplane; reserve boats early.",
    "chis": "California islands — boat or plane from Ventura/Oxnard only.",
    "dryv": "Florida Keys reef — boat or seaplane; check weather.",
    "glac": "Going-to-the-Sun Road opens mid-summer only; lodging books early.",
}


def _search_park_block(p: dict[str, Any], rank: int) -> list[str]:
    """One park entry for search tool text — complete enough to send as the user reply."""
    pname = p.get("name", "Unknown")
    states = p.get("states") or ""
    state_bit = f" ({states})" if states else ""
    code = (p.get("parkCode") or "").lower()
    logistics = _PARK_LOGISTICS_NOTES.get(code)
    title_suffix = " · Logistics" if logistics else ""
    lines = [f"### {rank}. {pname}{state_bit}{title_suffix}"]
    match_reason = p.get("matchReason")
    summary = p.get("summary") or ""
    if match_reason:
        if match_reason.startswith("Strong match"):
            lines.append(f"**Why it matches:** {match_reason}")
        else:
            lines.append(match_reason)
    elif summary:
        lines.append(summary)
    if logistics:
        lines.append(f"**Planning:** {logistics}")
    link_parts = []
    if p.get("link"):
        link_parts.append(f"[Details on TrailVerse]({p['link']})")
    if p.get("mapsUrl"):
        link_parts.append(f"[Google Maps]({p['mapsUrl']})")
    if link_parts:
        lines.append(" | ".join(link_parts))
    lines.append("")
    return lines


def _search_vibe_guide_links(query: str | None) -> list[str]:
    """Editorial ranked lists that match common search intents."""
    if not query:
        return []
    q = query.lower()
    links: list[str] = []
    if re.search(r"\b(quiet|peaceful|calm|less crowded|underrated|low crowd)\b", q):
        links.append(f"[Quiet national parks]({WEB_BASE}/quiet-national-parks)")
    if re.search(r"\b(beginners?|first[- ]?time|first visit|new to)\b", q):
        links.append(f"[Parks for first-timers]({WEB_BASE}/parks-for-first-timers)")
    if re.search(r"\b(couples?|romantic|honeymoon)\b", q):
        links.append(f"[Parks for couples]({WEB_BASE}/parks-for-couples)")
    return links


def format_search(
    resp: dict[str, Any], query: str | None = None
) -> tuple[dict[str, Any], str]:
    results = resp.get("data") or resp.get("results") or []
    if isinstance(results, dict) and "parks" in results:
        results = results["parks"]

    parks = []
    for p in results if isinstance(results, list) else []:
        code = p.get("parkCode") or p.get("code")
        pname = p.get("fullName") or p.get("name") or ""
        maps_url = _google_maps_point_url(p.get("latitude"), p.get("longitude"), pname)
        parks.append({
            "parkCode": code,
            "name": p.get("fullName") or p.get("name"),
            "designation": p.get("designation"),
            "states": p.get("states"),
            "matchReason": p.get("matchReason"),
            "matchedTraits": p.get("matchedTraits"),
            "summary": _smart_truncate(p.get("description") or "", 220),
            "heroImage": _pick_image(p),
            "rating": p.get("rating"),
            "link": f"{WEB_BASE}/parks/{code}" if code else None,
            "mapsUrl": maps_url,
        })

    # Preserve API relevance order (token score from backend); no NPS designation bias.

    structured = {
        "kind": "park_list",
        "parks": parks,
        "count": len(parks),
        "links": {"exploreAll": f"{WEB_BASE}/explore"},
    }

    # Finished Trailie reply — ChatGPT should pass this through, not invent a new list.
    text_lines: list[str] = []

    if not parks:
        text_lines.append("No parks matched that search. Try broadening your criteria — different state, activity, or keyword.")
        return structured, "\n".join(text_lines)

    headline = _search_headline(query)
    text_lines.append(f"# {headline}")
    text_lines.append("")
    text_lines.append(_search_framing_sentence(query, len(parks)))
    text_lines.append("")

    top = parks[:5]
    rest = parks[5:]

    text_lines.append("## Top picks")
    text_lines.append("")
    for i, p in enumerate(top, 1):
        text_lines.extend(_search_park_block(p, i))

    if rest:
        text_lines.append("## Also consider")
        text_lines.append("")
        for p in rest:
            pname = p.get("name", "Unknown")
            states = p.get("states") or ""
            line = f"- **{pname}** ({states})"
            match_reason = p.get("matchReason")
            if match_reason:
                line += f" — {match_reason}"
            elif p.get("summary"):
                line += f": {_smart_truncate(p['summary'], 120)}"
            link = p.get("link")
            if link:
                line += f" — [TrailVerse]({link})"
            text_lines.append(line)
        text_lines.append("")

    footer = [f"[Explore all parks]({WEB_BASE}/explore)"]
    footer.extend(_search_vibe_guide_links(query))
    footer.append(f"[Planning guides]({WEB_BASE}/guides)")
    text_lines.append("---")
    text_lines.append(" | ".join(footer))

    return structured, "\n".join(text_lines)


# ---------- find_events ----------

def format_events(resp: dict[str, Any]) -> tuple[dict[str, Any], str]:
    events_raw = resp.get("data") or resp.get("events") or []
    if isinstance(events_raw, dict) and "events" in events_raw:
        events_raw = events_raw["events"]

    events = []
    for e in events_raw if isinstance(events_raw, list) else []:
        eid = e.get("id") or e.get("_id")
        # Capture all dates for recurring events
        all_dates = e.get("dates") or []
        if isinstance(all_dates, list) and len(all_dates) > 1:
            recurring = True
            date_start = all_dates[0]
            date_end = all_dates[-1]
        else:
            recurring = False
            date_start = e.get("date") or e.get("startDate") or (all_dates[0] if all_dates else None)
            date_end = None
        events.append({
            "id": eid,
            "title": e.get("title") or e.get("name"),
            "parkCode": e.get("parkCode"),
            "parkName": e.get("parkName"),
            "date": date_start,
            "dateEnd": date_end,
            "recurring": recurring,
            "totalDates": len(all_dates) if recurring else 1,
            "time": e.get("time") or e.get("startTime") or e.get("timeinfo"),
            "duration": e.get("duration"),
            "category": e.get("category") or e.get("type"),
            "description": _strip_html((e.get("description") or ""))[:240],
            "location": e.get("location"),
            "registrationUrl": e.get("registrationUrl") or e.get("regresurl") or e.get("url"),
            "isFree": e.get("isfree"),
        })

    structured = {
        "kind": "events_list",
        "events": events,
        "count": len(events),
        "links": {"browseAll": f"{WEB_BASE}/events"},
    }

    # Build a COMPLETE pre-formatted events response in Trailie voice.
    text_lines = []

    if not events:
        text_lines.append("No upcoming events found for that search. Try a different park or broader time window.")
        return structured, "\n".join(text_lines)

    unique_parks = {e.get("parkName") for e in events if e.get("parkName")}
    if len(unique_parks) == 1:
        park_name = events[0].get("parkName") or "the park"
        text_lines.append(f"Here's what's happening at {park_name}:\n")
    elif len(unique_parks) > 1:
        text_lines.append(f"Upcoming events across {len(unique_parks)} parks:\n")
    else:
        text_lines.append("Upcoming events:\n")

    # Separate recurring (daily/weekly) from one-time events
    recurring_events = [e for e in events if e.get("recurring")]
    onetime_events = [e for e in events if not e.get("recurring")]

    def _format_event(e: dict[str, Any]) -> list[str]:
        lines = []
        title = e.get("title", "Untitled")
        time_str = e.get("time") or ""
        category = e.get("category") or ""
        is_special = category.lower() in ("special event", "festival") if category else False
        already_says_free = "free" in title.lower()
        free_tag = " (free)" if e.get("isFree") and not already_says_free else ""

        line = f"- {'⭐ ' if is_special else ''}**{title}**{free_tag}"
        if time_str:
            line += f" — {time_str}"
        lines.append(line)

        # Show recurrence range
        if e.get("recurring") and e.get("dateEnd"):
            lines.append(f"  Runs daily: {e['date']} through {e['dateEnd']}")

        if e.get("description"):
            lines.append(f"  {e['description']}")
        if e.get("location"):
            loc = e["location"][:150] if len(e.get("location", "")) > 150 else e["location"]
            short_loc = loc.split(",")[0].split(".")[0].strip()[:60]
            park_ctx = e.get("parkName") or ""
            loc_query = quote(f"{short_loc}, {park_ctx}")
            maps_link = f"https://www.google.com/maps/search/?api=1&query={loc_query}"
            lines.append(f"  📍 [{short_loc}]({maps_link})")
        if e.get("registrationUrl"):
            lines.append(f"  [Register/Details]({e['registrationUrl']})")
        return lines

    if recurring_events:
        text_lines.append("### Ongoing Programs")
        for e in recurring_events:
            text_lines.extend(_format_event(e))
        text_lines.append("")

    if onetime_events:
        # Group one-time events by date
        from collections import defaultdict
        by_date: dict[str, list[dict[str, Any]]] = defaultdict(list)
        for e in onetime_events:
            date_key = e.get("date") or "Date TBD"
            by_date[date_key].append(e)
        for date, date_events in sorted(by_date.items()):
            text_lines.append(f"### {_format_forecast_date(date) if date != 'Date TBD' else date}")
            for e in date_events:
                text_lines.extend(_format_event(e))
            text_lines.append("")

    text_lines.append(f"---\nBrowse all events on [TrailVerse]({WEB_BASE}/events)")

    return structured, "\n".join(text_lines)
