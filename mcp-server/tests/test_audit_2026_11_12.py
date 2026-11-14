"""Regressions from the 2026-11-12 live MCP audit (17 calls across Claude).

Each test names the observed failure it pins down.
"""
from __future__ import annotations

import asyncio

from server import main
from server.formatters import (
    describe_save_state,
    format_compare,
    format_events,
    format_park_details,
    format_search,
    rank_activity_names,
    render_trip_summary,
)
from server.search_query import detect_proximity
from server.search_ranking import rerank_search_results
from tests.test_park_accuracy import FakeBackend, _err, _text, run_tool

NPS_ALPHABETICAL = [
    "Arts and Culture", "Cultural Demonstrations", "Live Music", "Auto and ATV",
    "Scenic Driving", "Astronomy", "Biking", "Boating", "Camping", "Fishing",
    "Hiking", "Wildlife Watching",
]


# ---------- activities: "Known for arts and culture, auto and ATV" ----------

def test_signature_activities_come_before_umbrella_categories():
    ranked = rank_activity_names(NPS_ALPHABETICAL)
    assert ranked[:3] == ["Hiking", "Wildlife Watching", "Scenic Driving"]
    assert ranked.index("Arts and Culture") > ranked.index("Fishing")


def test_park_details_lists_hiking_for_glacier():
    park = {"parkCode": "glac", "fullName": "Glacier National Park", "states": "MT",
            "activities": [{"name": n} for n in NPS_ALPHABETICAL]}
    _, text = format_park_details({"data": park})
    section = text.split("## What You Can Do")[1].split("##")[0]
    assert section.strip().startswith("Hiking")


def test_compare_strengths_are_not_umbrella_categories():
    parks = [{"parkCode": c, "fullName": n, "states": "WY",
              "activities": [{"name": a} for a in NPS_ALPHABETICAL]}
             for c, n in (("yell", "Yellowstone National Park"), ("grte", "Grand Teton National Park"))]
    _, text = format_compare({"data": {"parks": parks}}, {})
    assert "arts and culture" not in text.lower()
    assert "Known for hiking" in text


# ---------- search output ----------

def test_search_text_does_not_instruct_the_host_model():
    parks = [{"parkCode": "noca", "fullName": "North Cascades National Park", "states": "WA",
              "description": "Glaciers and alpine lakes.", "matchReason": "Low-stress and peaceful."},
             {"parkCode": "chir", "fullName": "Chiricahua National Park", "states": "AZ",
              "description": "Rock pinnacles.", "matchReason": "Low-stress and peaceful."}]
    _, text = format_search({"data": parks}, query="quiet parks for beginners")
    assert "Lead with" not in text and "flat dump" not in text
    # A reason every result shares is dropped; each park's own description stays.
    assert "Low-stress and peaceful" not in text
    assert "Glaciers and alpine lakes." in text and "Rock pinnacles." in text


def test_trait_query_ranks_national_parks_above_historic_trails():
    resp = {"data": [
        {"parkCode": "glca", "fullName": "Glen Canyon National Recreation Area", "designation": "National Recreation Area", "states": "AZ,UT"},
        {"parkCode": "cali", "fullName": "California National Historic Trail", "designation": "National Historic Trail", "states": "CA,UT"},
        {"parkCode": "nabr", "fullName": "Natural Bridges National Monument", "designation": "National Monument", "states": "UT"},
        {"parkCode": "brca", "fullName": "Bryce Canyon National Park", "designation": "National Park", "states": "UT"},
    ]}
    ranked = [p["parkCode"] for p in rerank_search_results(resp, "dark sky", limit=3)["data"]]
    assert ranked == ["brca", "nabr", "glca"]


def test_rerank_handles_list_shaped_backend_response():
    # /api/parks/search returns {"data": [...]}; the re-ranker used to no-op on it.
    resp = {"data": [{"parkCode": "acvi", "fullName": "Acadian Village"},
                     {"parkCode": "acad", "fullName": "Acadia National Park", "designation": "National Park"}]}
    assert rerank_search_results(resp, "Acadia")["data"][0]["parkCode"] == "acad"


# ---------- proximity: "near Chicago" → Port Chicago, CA ----------

def test_detects_distance_phrases():
    assert detect_proximity("best parks near Chicago for a weekend") == "Chicago"
    assert detect_proximity("parks within 3 hours of Atlanta") == "Atlanta"
    assert detect_proximity("dark sky") is None


def test_near_city_returns_actionable_error_not_a_word_match():
    result, backend = run_tool(main.search_parks, query="best parks near Chicago for a weekend")
    assert result.isError
    assert _err(result)["code"] == "PROXIMITY_SEARCH_UNSUPPORTED"
    assert not any(name == "search_parks" for name, _ in backend.calls)


def test_near_state_becomes_a_state_filter():
    result, backend = run_tool(main.search_parks, query="parks near Utah")
    assert not result.isError
    assert any(kw.get("state") == "UT" for name, kw in backend.calls if name == "search_parks")


# ---------- events ----------

def test_event_text_is_not_cut_mid_word_and_names_its_park():
    long = ("Learn about the role of orchards in Fruita, the fruits grown, and park management "
            "of them over the years. Short, flat walk over uneven ground in the Johnson Orchard. "
            "Bring water and wear shoes appropriate for walking. Meet at the Johnson Orchard entrance.")
    events = [
        {"title": "Orchard Stroll", "parkName": "Capitol Reef National Park", "date": "2026-11-14",
         "description": long, "location": "Meet at the Johnson Orchard entrance (near the picnic area restrooms)",
         "registrationUrl": "https://www.recreation.gov/"},
        {"title": "Full Moon Hike", "parkName": "Bryce Canyon National Park", "date": "2026-11-24",
         "description": "Ranger-led.", "registrationUrl": "https://www.recreation.gov/ticket/facility/1"},
    ]
    _, text = format_events({"data": events})
    assert "Johnson Or\n" not in text and "picnic area r]" not in text
    assert "Orchard Stroll** · Capitol Reef National Park" in text
    # A bare site root is not a registration link; a real page is kept.
    assert "(https://www.recreation.gov/)" not in text
    assert "ticket/facility/1" in text


# ---------- plan_trip text ----------

PLAN = {
    "parkCode": "zion",
    "days": [{
        "dayNumber": 1, "label": "River day", "overnightLocation": "Springdale",
        "stops": [{"id": "s1", "name": "Riverside Walk", "note": "Easy 2 miles.", "startTime": ""},
                  {"id": "s2", "name": "Pa'rus Trail", "note": "Sunrise light.", "startTime": "6:42 AM",
                   "timingReason": "sunrise"}],
        "travelEdges": [{"fromStopId": "s1", "toStopId": "s2", "label": "20 min by road"}],
        "dayStructure": {"blocks": [
            {"kind": "outing", "periods": ["morning"], "label": "Follow the river", "stopIds": ["s1"]},
            {"kind": "downtime", "periods": ["afternoon"], "label": "Rest", "note": "Free time.", "stopIds": []},
            {"kind": "outing", "periods": ["evening"], "label": "Pa'rus Trail", "stopIds": ["s2"]},
        ]},
    }],
}


def test_trip_summary_is_readable_and_invents_nothing():
    text = render_trip_summary(PLAN)
    assert "**Day 1 — River day** · overnight Springdale" in text
    assert "Morning: Follow the river → **Riverside Walk**: Easy 2 miles." in text
    assert "6:42 AM (sunrise)" in text
    assert "20 min by road" in text
    assert "Afternoon: Rest — Free time." in text
    for invented in ("7:00 AM", "lunch", "drive time", "Budget"):
        assert invented.lower() not in text.lower()


def test_save_state_is_a_sentence_and_failure_stays_visible():
    failed = {"artifactStatus": {"status": "save_failed", "notice": "Couldn't save the trip."},
              "mutationStatus": "rejected_answered"}
    assert describe_save_state(failed).startswith("**Not saved** (save_failed)")
    assert "Saved to this TrailVerse planning session" in describe_save_state({"mutationStatus": "accepted"})


def test_welcome_prompt_is_a_user_turn():
    messages = main.welcome()
    assert messages and all(m.role == "user" for m in messages)
