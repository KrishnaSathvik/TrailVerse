"""
Formatters that convert raw TrailVerse backend responses into the
structuredContent shape our widgets expect.

Each formatter returns a tuple: (structured_content_dict, human_text_summary).
The structured content is what the widget iframe receives via the MCP
Apps bridge. The text is what ChatGPT's model reads.
"""
from __future__ import annotations

import os
from typing import Any

from .client import extract_itinerary, strip_itinerary_block

WEB_BASE = os.getenv(
    "TRAILVERSE_WEB_BASE", "https://www.nationalparksexplorerusa.com"
).rstrip("/")


# ---------- plan_trip ----------

def format_plan_trip(resp: dict[str, Any], *, user_message: str, park_code_hint: str = "") -> tuple[dict[str, Any], str]:
    """Format an AI planner response into widget + text."""
    data = resp.get("data", resp)  # support both wrapped and unwrapped shapes
    content = data.get("content") or ""
    # The backend now returns the parsed itinerary directly (stripped from content).
    # Fall back to extracting from content only if the backend didn't provide it.
    itinerary = data.get("itinerary") or extract_itinerary(content)
    clean_text = strip_itinerary_block(content)

    confidence = data.get("confidence") or {}
    plan_score = data.get("planScore") or {}
    park_name = data.get("parkName") or (itinerary.get("parkName") if itinerary else None)
    park_code = (itinerary.get("parkCode") if itinerary else None) or park_code_hint or ""

    structured = {
        "kind": "itinerary",
        "parkName": park_name,
        "parkCode": park_code,
        "persona": "planner" if data.get("provider") == "openai" else "local",
        "provider": data.get("provider"),
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

    # Text summary the model sees (kept concise so it doesn't parrot the full plan)
    summary_parts = []
    if park_name:
        summary_parts.append(f"Trip plan for {park_name}")
    if itinerary and itinerary.get("days"):
        summary_parts.append(f"{len(itinerary['days'])}-day itinerary")
    if confidence.get("level"):
        summary_parts.append(f"{confidence['level']} confidence")
    if plan_score.get("label"):
        summary_parts.append(f"plan quality: {plan_score['label']}")

    text = (
        f"{', '.join(summary_parts)}. Full itinerary rendered in the card above. "
        f"For unlimited messages and web search, continue at {WEB_BASE}/plan-ai."
        if summary_parts
        else f"Trip planning response rendered above. Continue at {WEB_BASE}/plan-ai."
    )

    return structured, text


# ---------- get_park_details ----------

def format_park_details(
    details: dict[str, Any],
    alerts: dict[str, Any] | None = None,
    weather: dict[str, Any] | None = None,
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
            for a in raw_alerts[:5]:
                alert_list.append({
                    "title": a.get("title"),
                    "category": a.get("category"),
                    "description": (a.get("description") or "")[:300],
                    "url": a.get("url"),
                })

    # Normalize weather
    current = {}
    forecast = []
    if weather:
        w = weather.get("data") or weather
        current = {
            "tempF": w.get("tempF") or w.get("temperature"),
            "description": w.get("description") or w.get("condition"),
            "humidity": w.get("humidity"),
            "windMph": w.get("windMph") or w.get("wind"),
        }
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

    structured = {
        "kind": "park_details",
        "parkCode": park_code,
        "name": name,
        "designation": park.get("designation"),
        "states": park.get("states"),
        "description": park.get("description") or park.get("summary"),
        "heroImage": _pick_image(park),
        "images": _pick_images(park, 4),
        "activities": _pick_activities(park),
        "entranceFees": park.get("entranceFees") or [],
        "operatingHours": park.get("operatingHours") or [],
        "addresses": park.get("addresses") or [],
        "weather": {"current": current, "forecast": forecast},
        "alerts": alert_list,
        "editorial": editorial,
        "links": {
            "trailverse": f"{WEB_BASE}/parks/{park_code}",
            "planTrip": f"{WEB_BASE}/plan-ai?parkCode={park_code}",
        },
    }

    text_parts = [f"{name}"]
    if park.get("designation"):
        text_parts.append(f"({park['designation']})")
    if park.get("states"):
        text_parts.append(f"in {park['states']}")
    if alert_list:
        text_parts.append(f"— {len(alert_list)} active alert(s)")
    if editorial:
        text_parts.append("— with TrailVerse daily feed insight")
    text = " ".join(text_parts) + f". Full details rendered above. Open on TrailVerse: {WEB_BASE}/parks/{park_code}"

    return structured, text


def _pick_image(park: dict[str, Any]) -> str | None:
    images = park.get("images") or []
    if isinstance(images, list) and images:
        first = images[0]
        if isinstance(first, dict):
            return first.get("url")
    return park.get("heroImage") or park.get("image")


def _pick_images(park: dict[str, Any], limit: int = 4) -> list[dict[str, str | None]]:
    """Return up to `limit` gallery images as lightweight dicts."""
    images = park.get("images") or []
    result: list[dict[str, str | None]] = []
    if isinstance(images, list):
        for img in images[:limit]:
            if isinstance(img, dict) and img.get("url"):
                result.append({
                    "url": img["url"],
                    "altText": img.get("altText") or img.get("title"),
                    "title": img.get("title"),
                })
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
        parks.append({
            "parkCode": code,
            "name": p.get("fullName") or p.get("name"),
            "designation": p.get("designation"),
            "states": p.get("states"),
            "rating": p.get("rating"),
            "reviewCount": p.get("reviewCount"),
            "currentTempF": p.get("currentTempF"),
            "crowdLevel": p.get("crowdLevel"),
            "entranceFee": p.get("entranceFee"),
            "topActivities": (p.get("topActivities") or [])[:5],
            "heroImage": _pick_image(p),
            "link": f"{WEB_BASE}/parks/{code}" if code else None,
        })

    highlights = {}
    if summary:
        s = summary.get("data") or summary
        highlights = {
            "bestOverall": s.get("bestOverall"),
            "warmest": s.get("warmest"),
            "lowerCrowd": s.get("lowerCrowd"),
            "sharedHighlights": s.get("sharedHighlights") or [],
        }

    codes = [p["parkCode"] for p in parks if p.get("parkCode")]
    structured = {
        "kind": "compare",
        "parks": parks,
        "highlights": highlights,
        "links": {
            "continueOnWebsite": f"{WEB_BASE}/compare?parks={','.join(codes)}" if codes else f"{WEB_BASE}/compare",
            "planRoadTrip": f"{WEB_BASE}/plan-ai?parks={','.join(codes)}" if codes else None,
        },
    }

    names = [p["name"] for p in parks if p.get("name")]
    text = (
        f"Comparing {', '.join(names)}. Side-by-side comparison rendered above. "
        f"Full comparison: {structured['links']['continueOnWebsite']}"
    )
    return structured, text


# ---------- search_parks ----------

def format_search(resp: dict[str, Any]) -> tuple[dict[str, Any], str]:
    results = resp.get("data") or resp.get("results") or []
    if isinstance(results, dict) and "parks" in results:
        results = results["parks"]

    parks = []
    for p in results if isinstance(results, list) else []:
        code = p.get("parkCode") or p.get("code")
        parks.append({
            "parkCode": code,
            "name": p.get("fullName") or p.get("name"),
            "designation": p.get("designation"),
            "states": p.get("states"),
            "summary": (p.get("description") or "")[:220],
            "heroImage": _pick_image(p),
            "rating": p.get("rating"),
            "link": f"{WEB_BASE}/parks/{code}" if code else None,
        })

    structured = {
        "kind": "park_list",
        "parks": parks,
        "count": len(parks),
        "links": {"exploreAll": f"{WEB_BASE}/explore"},
    }
    text = f"Found {len(parks)} park{'s' if len(parks) != 1 else ''}. Full list rendered above."
    return structured, text


# ---------- find_events ----------

def format_events(resp: dict[str, Any]) -> tuple[dict[str, Any], str]:
    events_raw = resp.get("data") or resp.get("events") or []
    if isinstance(events_raw, dict) and "events" in events_raw:
        events_raw = events_raw["events"]

    events = []
    for e in events_raw if isinstance(events_raw, list) else []:
        eid = e.get("id") or e.get("_id")
        events.append({
            "id": eid,
            "title": e.get("title") or e.get("name"),
            "parkCode": e.get("parkCode"),
            "parkName": e.get("parkName"),
            "date": e.get("date") or e.get("startDate"),
            "time": e.get("time") or e.get("startTime"),
            "duration": e.get("duration"),
            "category": e.get("category") or e.get("type"),
            "description": (e.get("description") or "")[:240],
            "location": e.get("location"),
            "registrationUrl": e.get("registrationUrl") or e.get("url"),
        })

    structured = {
        "kind": "events_list",
        "events": events,
        "count": len(events),
        "links": {"browseAll": f"{WEB_BASE}/events"},
    }
    text = f"Found {len(events)} upcoming event{'s' if len(events) != 1 else ''} — see card above."
    return structured, text
