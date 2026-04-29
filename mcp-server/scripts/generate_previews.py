"""
Generate a static HTML preview of all 5 widgets with realistic mock data.
This lets us visually QA the widgets without running the full MCP stack.
"""
from pathlib import Path

WIDGETS_DIR = Path(__file__).resolve().parent.parent / "widgets"
OUT_DIR = Path(__file__).resolve().parent.parent / "docs"
OUT_DIR.mkdir(exist_ok=True)

MOCK_DATA = {
    "itinerary": {
        "kind": "itinerary",
        "parkName": "Zion National Park",
        "parkCode": "zion",
        "persona": "planner",
        "provider": "openai",
        "model": "gpt-5.4-mini",
        "hasItinerary": True,
        "intent": "photographer",
        "confidence": {"level": "high", "score": 0.92},
        "planScore": {
            "overall": 0.85,
            "label": "Excellent",
            "dimensions": {"compliance": 1.0, "diversity": 0.82, "pacing": 0.88, "interestMatch": 0.9, "geoEfficiency": 0.7}
        },
        "narrative": "Here's a 3-day Zion itinerary tuned for **beginner hikers** with photography stops throughout. I've grounded this in live NPS data — the **Angels Landing permit lottery is active** and timed-entry is enforced for the main canyon, so we'll work around both.\n\n## What I changed for your group\n\nI swapped Angels Landing for **Canyon Overlook Trail** — same dramatic cliff views, 1 mile round trip, no permit needed. The narrows section is moved to Day 2 afternoon to catch softer light.",
        "itinerary": {
            "days": [
                {
                    "dayNumber": 1,
                    "label": "Arrival & Canyon Overlook",
                    "stops": [
                        {"name": "Springdale Arrival", "startTime": "11:00", "duration": 45, "type": "lodging", "difficulty": "easy", "why": "Check in, drop bags, grab lunch before entering the park.", "drivingTimeFromPreviousMin": 0},
                        {"name": "Canyon Overlook Trail", "startTime": "14:30", "duration": 90, "type": "trail", "difficulty": "easy", "why": "Short hike with sweeping views of the main canyon — better golden-hour spot than Angels Landing and no permit required.", "drivingTimeFromPreviousMin": 25},
                        {"name": "Zion-Mount Carmel Highway sunset", "startTime": "18:15", "duration": 60, "type": "landmark", "difficulty": "easy", "why": "Tunnel-side pull-outs are prime for warm cliff light as the sun sets.", "drivingTimeFromPreviousMin": 10}
                    ]
                },
                {
                    "dayNumber": 2,
                    "label": "The Narrows (bottom-up)",
                    "stops": [
                        {"name": "Riverside Walk", "startTime": "07:30", "duration": 75, "type": "trail", "difficulty": "easy", "why": "Paved approach to the Narrows entrance — good for easing into the day.", "drivingTimeFromPreviousMin": 20, "permitRequired": False},
                        {"name": "The Narrows (bottom-up)", "startTime": "09:00", "duration": 240, "type": "trail", "difficulty": "moderate", "why": "Wade up the Virgin River. Turn around whenever tired — no commitment to a full out-and-back.", "drivingTimeFromPreviousMin": 5, "permitRequired": False},
                        {"name": "Emerald Pools Trail", "startTime": "15:00", "duration": 120, "type": "trail", "difficulty": "easy", "why": "Shaded afternoon hike to cool off. Waterfall payoff is worth the crowds.", "drivingTimeFromPreviousMin": 15}
                    ]
                },
                {
                    "dayNumber": 3,
                    "label": "Kolob Canyons",
                    "stops": [
                        {"name": "Kolob Canyons Visitor Center", "startTime": "09:00", "duration": 45, "type": "visitor_center", "difficulty": "easy", "why": "Different entrance — fewer crowds, great intro to the lesser-seen side of Zion.", "drivingTimeFromPreviousMin": 50},
                        {"name": "Timber Creek Overlook", "startTime": "10:30", "duration": 60, "type": "trail", "difficulty": "easy", "why": "Half-mile round trip to a wide desert panorama. Ideal closer before the drive back.", "drivingTimeFromPreviousMin": 20}
                    ]
                }
            ]
        },
        "links": {
            "continueOnWebsite": "https://www.nationalparksexplorerusa.com/plan-ai",
            "parkDetail": "https://www.nationalparksexplorerusa.com/parks/zion"
        }
    },
    "park-details": {
        "kind": "park_details",
        "parkCode": "zion",
        "name": "Zion National Park",
        "designation": "National Park",
        "states": "UT",
        "description": "Massive sandstone cliffs of cream, pink, and red rise above a narrow slot canyon cut by the Virgin River. Zion's unique mix of high plateau, canyon, and desert ecosystems supports hundreds of species of plants and animals. Human history spans 8,000 years — from the Ancestral Puebloan to present-day communities. Today, visitors explore the park through hikes, scenic drives, canyoneering, and wildlife watching.",
        "heroImage": "https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=1200",
        "activities": ["Hiking", "Canyoneering", "Stargazing", "Climbing", "Wildlife Watching", "Photography", "Scenic Driving", "Camping"],
        "entranceFees": [
            {"title": "Private Vehicle (7 days)", "cost": "35"},
            {"title": "Motorcycle (7 days)", "cost": "30"},
            {"title": "Per Person", "cost": "20"}
        ],
        "weather": {
            "current": {"tempF": 78, "description": "Clear skies", "humidity": 22, "windMph": 8},
            "forecast": [
                {"date": "2026-04-22", "highF": 82, "lowF": 58, "description": "Sunny"},
                {"date": "2026-04-23", "highF": 79, "lowF": 55, "description": "Partly cloudy"},
                {"date": "2026-04-24", "highF": 75, "lowF": 52, "description": "Cloudy"},
                {"date": "2026-04-25", "highF": 71, "lowF": 49, "description": "Chance of rain"},
                {"date": "2026-04-26", "highF": 76, "lowF": 53, "description": "Sunny"}
            ]
        },
        "alerts": [
            {"title": "Angels Landing Permit Required", "category": "Permit", "description": "A lottery permit is required to hike Angels Landing beyond Scouts Lookout. Apply at recreation.gov up to 4 months in advance."},
            {"title": "Weeping Rock Trail Closed", "category": "Closure", "description": "Trail remains closed indefinitely due to rockfall. No estimated reopening."}
        ],
        "editorial": {
            "leadInsight": "Spring in Zion is a negotiation — low crowds before Memorial Day, but the Virgin River still runs high enough to close The Narrows most mornings. Plan your hikes for the drive, not the forecast.",
            "weatherInsight": "Afternoon highs in the upper 70s make mid-day hikes on exposed trails uncomfortable. Start at dawn; rest in Springdale through noon.",
            "skyInsight": "Moonless nights this week. Kolob Canyons turnouts are Bortle 2 — you'll see the Milky Way core rising around 1 AM facing south.",
            "atAGlance": "Shuttle mandatory April through October. Permit lottery for Angels Landing. Dogs only on the Pa'rus Trail."
        },
        "links": {
            "trailverse": "https://www.nationalparksexplorerusa.com/parks/zion",
            "planTrip": "https://www.nationalparksexplorerusa.com/plan-ai?parkCode=zion"
        }
    },
    "compare": {
        "kind": "compare",
        "parks": [
            {"parkCode": "ZION", "name": "Zion National Park", "designation": "National Park", "states": "UT",
             "rating": 4.8, "reviewCount": 2341, "currentTempF": 78, "crowdLevel": "High",
             "entranceFee": "$35/vehicle", "topActivities": ["Hiking", "Canyoneering", "Stargazing"],
             "heroImage": "https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=600"},
            {"parkCode": "BRCA", "name": "Bryce Canyon", "designation": "National Park", "states": "UT",
             "rating": 4.7, "reviewCount": 1892, "currentTempF": 64, "crowdLevel": "Moderate",
             "entranceFee": "$35/vehicle", "topActivities": ["Hiking", "Stargazing", "Photography"],
             "heroImage": "https://images.unsplash.com/photo-1589307004173-3c2c8b1b8b3e?w=600"}
        ],
        "highlights": {
            "bestOverall": "Zion",
            "warmest": "Zion",
            "lowerCrowd": "Bryce Canyon",
            "sharedHighlights": ["Utah", "Spring shoulder season", "Dark sky designation"]
        },
        "links": {
            "continueOnWebsite": "https://www.nationalparksexplorerusa.com/compare?parks=zion,brca",
            "planRoadTrip": "https://www.nationalparksexplorerusa.com/plan-ai?parks=zion,brca"
        }
    },
    "park-list": {
        "kind": "park_list",
        "count": 5,
        "parks": [
            {"parkCode": "ZION", "name": "Zion National Park", "designation": "National Park", "states": "UT",
             "summary": "Massive sandstone cliffs of cream, pink, and red rise above a narrow slot canyon cut by the Virgin River.",
             "rating": 4.8, "heroImage": "https://images.unsplash.com/photo-1509316785289-025f5b846b35?w=600",
             "link": "https://www.nationalparksexplorerusa.com/parks/zion"},
            {"parkCode": "BRCA", "name": "Bryce Canyon", "designation": "National Park", "states": "UT",
             "summary": "Forest of stone spires (hoodoos) rises from the amphitheater — a geologic wonder unlike anywhere else.",
             "rating": 4.7, "heroImage": "https://images.unsplash.com/photo-1589307004173-3c2c8b1b8b3e?w=600",
             "link": "https://www.nationalparksexplorerusa.com/parks/brca"},
            {"parkCode": "ARCH", "name": "Arches National Park", "designation": "National Park", "states": "UT",
             "summary": "Over 2,000 natural stone arches — the densest concentration of natural arches anywhere in the world.",
             "rating": 4.7, "heroImage": "https://images.unsplash.com/photo-1583309219338-a582f1f9ca6d?w=600",
             "link": "https://www.nationalparksexplorerusa.com/parks/arch"},
            {"parkCode": "CANY", "name": "Canyonlands", "designation": "National Park", "states": "UT",
             "summary": "Vast wilderness of mesas, buttes, and canyons carved by the Colorado and Green Rivers.",
             "rating": 4.6, "heroImage": "https://images.unsplash.com/photo-1518534441551-2d79b6d3d99e?w=600",
             "link": "https://www.nationalparksexplorerusa.com/parks/cany"},
            {"parkCode": "CARE", "name": "Capitol Reef", "designation": "National Park", "states": "UT",
             "summary": "Long wrinkle in the earth — the Waterpocket Fold — filled with cliffs, canyons, domes, and bridges.",
             "rating": 4.5, "heroImage": "https://images.unsplash.com/photo-1617717389686-b1e0fb3be3cf?w=600",
             "link": "https://www.nationalparksexplorerusa.com/parks/care"}
        ],
        "links": {"exploreAll": "https://www.nationalparksexplorerusa.com/explore"}
    },
    "events": {
        "kind": "events_list",
        "count": 4,
        "events": [
            {"id": "e1", "title": "Ranger-led Star Party",
             "parkName": "Bryce Canyon", "parkCode": "BRCA",
             "date": "2026-05-14", "time": "21:00", "duration": "2h",
             "category": "Stargazing",
             "description": "Join dark-sky rangers under one of the darkest skies in North America. Telescopes provided; dress warmly.",
             "location": "Sunset Point Amphitheater",
             "registrationUrl": "https://www.nps.gov/brca/planyourvisit/astronomy-programs.htm"},
            {"id": "e2", "title": "Photography Workshop — Watchman Sunset",
             "parkName": "Zion National Park", "parkCode": "ZION",
             "date": "2026-05-18", "time": "17:30", "duration": "3h",
             "category": "Workshop",
             "description": "Hands-on sunset photography along the Virgin River with composition tips from a park naturalist.",
             "location": "Canyon Junction Bridge"},
            {"id": "e3", "title": "Wildlife Tracking Walk",
             "parkName": "Yellowstone", "parkCode": "YELL",
             "date": "2026-06-02", "time": "06:00", "duration": "4h",
             "category": "Guided Tour",
             "description": "Early-morning walk through Lamar Valley looking for bison, wolves, and bears with an experienced guide.",
             "location": "Lamar Valley Trailhead",
             "registrationUrl": "https://www.nps.gov/yell/"},
            {"id": "e4", "title": "Junior Ranger Orientation",
             "parkName": "Yosemite", "parkCode": "YOSE",
             "date": "2026-06-08", "time": "10:00", "duration": "1h",
             "category": "Family Program",
             "description": "Kids ages 7–13 earn their Junior Ranger badge through interactive activities in the valley.",
             "location": "Yosemite Valley Visitor Center"}
        ],
        "links": {"browseAll": "https://www.nationalparksexplorerusa.com/events"}
    }
}


def build_preview_html(widget_name: str, mock: dict) -> str:
    """Inject mock data into a widget HTML so it renders without the MCP bridge."""
    widget_html = (WIDGETS_DIR / f"{widget_name}.html").read_text()
    import json as _json
    mock_js = _json.dumps(mock)
    # Replace the render() call at the bottom with one that uses injected data
    injected = widget_html.replace(
        "render(); init();",
        f"toolOutput = {mock_js}; render();",
    )
    return injected


def main() -> None:
    widgets = ["itinerary", "park-details", "compare", "park-list", "events"]

    # Individual preview files
    for w in widgets:
        out = OUT_DIR / f"preview-{w}.html"
        out.write_text(build_preview_html(w, MOCK_DATA[w]))
        print(f"Wrote {out}")

    # Combined index
    index = ["<!doctype html><html><head><title>TrailVerse widgets preview</title>",
             '<link rel="preconnect" href="https://fonts.googleapis.com" />',
             '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />',
             '<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&family=Bricolage+Grotesque:wght@500;600;700&display=swap" rel="stylesheet" />',
             "<style>",
             ":root{color-scheme:dark}",
             "body{margin:0;padding:48px 20px 80px;background:#0A0E0F;color:#fff;font-family:'Geist',system-ui,sans-serif;-webkit-font-smoothing:antialiased}",
             "h1{font-family:'Bricolage Grotesque','Geist',sans-serif;font-weight:600;font-size:32px;text-align:center;margin:0 0 6px;letter-spacing:-0.02em}",
             ".sub{text-align:center;color:rgba(255,255,255,0.6);font-size:13px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 48px}",
             "h2{font-size:11px;font-weight:600;letter-spacing:0.15em;text-transform:uppercase;color:#22c55e;margin:56px auto 16px;max-width:700px}",
             ".frame{border:0;width:100%;max-width:720px;margin:0 auto;display:block;background:transparent;border-radius:16px}",
             ".wrap{max-width:760px;margin:0 auto}",
             "@media(prefers-color-scheme:light){body{background:#FEFCF9;color:#2D2B28}.sub{color:rgba(45,43,40,0.65)}h2{color:#059669}}",
             "</style></head><body><div class='wrap'>",
             "<h1>TrailVerse widgets</h1>",
             "<p class='sub'>ChatGPT App · preview</p>"]
    heights = {"itinerary": 1800, "park-details": 1400, "compare": 900, "park-list": 1100, "events": 1100}
    for w in widgets:
        index.append(f"<h2>— {w.replace('-', ' ')}</h2>")
        index.append(f"<iframe class='frame' src='preview-{w}.html' style='height:{heights[w]}px' loading='lazy'></iframe>")
    index.append("</div></body></html>")

    (OUT_DIR / "preview-index.html").write_text("\n".join(index))
    print(f"Wrote {OUT_DIR / 'preview-index.html'}")


if __name__ == "__main__":
    main()
