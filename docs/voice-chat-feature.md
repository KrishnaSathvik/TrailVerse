# TrailVerse Voice Chat — Feature Documentation

## Overview

Trailie Voice is a real-time voice assistant integrated into TrailVerse that lets users ask questions about U.S. national parks and receive spoken answers powered by live data. It uses OpenAI's Realtime API over WebRTC for low-latency voice-to-voice interaction, with function calling to fetch live park data from the NPS API, weather services, and TrailVerse's data layer.

**Status:** Beta
**Rate limit:** 30 sessions per hour per user
**Voice model:** `gpt-realtime` with `marin` voice

---

## Architecture

```
┌─────────────────┐      ┌──────────────────┐      ┌─────────────────┐
│   Browser        │      │  Express Backend  │      │  OpenAI Realtime │
│                  │      │  (server/routes/  │      │  API             │
│  VoiceButton     │      │   ai.js)          │      │                  │
│  VoiceOverlay    │      │                   │      │                  │
│  useRealtimeVoice│      │                   │      │                  │
│                  │      │                   │      │                  │
│  1. Tap mic ─────┼──2──▶│  /realtime-session │──3──▶│  Create session  │
│                  │      │  - Rate limit     │◀──4──│  Return token    │
│  5. WebRTC ──────┼──────┼───────────────────┼──────┼▶ Audio stream    │
│     connection   │      │                   │      │                  │
│                  │      │                   │      │  6. Model needs  │
│  7. Function ────┼──────┼▶ /voice-tool      │      │     data →       │
│     call result  │      │  - get_park_details│      │     function call│
│                  │      │  - search_parks   │      │                  │
│  8. Audio ◀──────┼──────┼───────────────────┼──────┼─ Speaks answer   │
│     response     │      │  - compare_parks  │      │                  │
│                  │      │  - find_events    │      │                  │
└─────────────────┘      └──────────────────┘      └─────────────────┘
```

### Connection Flow

1. User taps the microphone FAB (floating action button)
2. `VoiceOverlay` mounts, `useRealtimeVoice.connect()` is called
3. Browser requests microphone permission and geolocation (2s timeout)
4. Frontend POSTs to `/api/ai/realtime-session` with optional `parkCode`, `lat`, `lng`
5. Backend builds instructions (park context, geolocation, date/season), requests ephemeral token from OpenAI
6. Frontend creates RTCPeerConnection, exchanges SDP with OpenAI Realtime API
7. WebRTC data channel opens for events (transcripts, function calls)
8. Voice session is live — user speaks, model responds

### Function Calling Flow

When the model needs live data it can't answer from pre-loaded context:

1. Model emits `response.output_item.added` with `type: 'function_call'`
2. Frontend tracks the call via `activeFnCallRef` and shows tool-calling UI
3. Arguments stream in via `response.function_call_arguments.delta`
4. On `response.function_call_arguments.done`, frontend calls `POST /api/ai/voice-tool`
5. Backend executes the function (NPS API, weather, etc.) and returns result
6. Frontend sends result back through data channel as `conversation.item.create` (type `function_call_output`)
7. Frontend sends `response.create` to trigger the model to respond
8. Model speaks the answer using the tool result

---

## Components

### Frontend

| File | Purpose |
|------|---------|
| `components/voice/VoiceButton.jsx` | Floating mic button (FAB), hint tooltip, page visibility logic |
| `components/voice/VoiceOverlay.jsx` | Full-screen voice UI — orb, status, captions, suggested prompts |
| `hooks/useRealtimeVoice.js` | WebRTC connection, data channel events, function call execution |

### Backend

| File | Purpose |
|------|---------|
| `server/src/routes/ai.js` | `/realtime-session` — session creation, context injection; `/voice-tool` — function execution |

---

## Features

### 1. Live Park Data

When users ask about a specific park, Trailie fetches real-time data:
- Current weather (temperature, conditions, humidity)
- 3-day forecast
- Active alerts and closures
- Entrance fees
- Operating hours (today's hours specifically)
- Available activities
- Upcoming ranger programs and events

### 2. Park Context Pre-fetching

When voice chat is opened from a park detail page (`/parks/[slug]`), the backend pre-fetches that park's live data and injects it directly into the model instructions. This means:
- The first answer about that park is **instant** — no tool call round-trip
- The model is instructed to only use tools for *different* parks

### 3. Geolocation — "Near Me" Queries

On connect, the browser requests geolocation with a non-blocking 2-second timeout:
- If granted, coordinates are sent to the backend
- Backend calculates Haversine distance to all 474 NPS sites
- The 8 nearest parks are injected into instructions with distances and drive time estimates
- Model can answer "What parks are near me?" without asking the user's location

### 4. Date & Season Awareness

Current date and season are injected into instructions so the model can:
- Recommend parks based on current conditions
- Know which roads/facilities are seasonally closed
- Suggest appropriate activities for the time of year

### 5. Page-Aware Suggested Prompts

The voice overlay shows contextual suggested prompts based on the current page:

| Page | Prompts |
|------|---------|
| Park detail page | "What should I not miss here?", "Any closures or alerts?", "Best hikes for beginners?" |
| Events page | "Events at Grand Canyon this week?", "Ranger programs at Yellowstone?", "Any stargazing events in Utah?" |
| Compare page | "Compare Zion and Grand Canyon", "Which has better hiking, Glacier or Yellowstone?", "Yosemite vs Sequoia for families?" |
| Landing/other | "What parks are near me?", "Best parks to visit right now?", "Top parks for first-timers?" |

### 6. Page Visibility

Voice chat is hidden on pages where it's not relevant:
- `/plan-ai` — has its own text chat interface
- `/blog` — content reading pages
- `/map` — map interaction pages

### 7. First-Time Hint

A tooltip appears after 3 seconds for first-time visitors (per session) with contextual messaging:
- On park pages: "Ask Trailie for insider tips, weather, or trip ideas — hands-free"
- Elsewhere: "Ask Trailie to plan trips, compare parks, or get insider tips"

---

## Available Voice Tools

### `get_park_details`
- **Input:** `park_code` (string, required)
- **Returns:** Park overview, state, fees, hours, weather, forecast, alerts, activities
- **When used:** User asks about a specific park not already in context

### `search_parks`
- **Input:** `state` (2-letter code), `activity` (string), `query` (string) — all optional
- **Returns:** Matching parks with names, codes, states, descriptions
- **When used:** User asks for recommendations, discovery, or filtering

### `compare_parks`
- **Input:** `park_codes` (array of 2 strings, required)
- **Returns:** Side-by-side comparison of weather, fees, alerts, activities
- **When used:** User wants to choose between two parks

### `find_events`
- **Input:** `park_code` (required), `date_start`, `date_end` (optional, defaults to next 7 days)
- **Returns:** Upcoming ranger programs, tours, and events
- **When used:** User asks about events, programs, or things happening at a park

---

## Voice UI States

| State | Orb Color | Animation | Status Text |
|-------|-----------|-----------|-------------|
| Connecting | Green | Spinner icon | "Connecting..." |
| Listening (idle) | Green | Idle | "Listening" |
| User speaking | Green | Mic animation | "You're speaking..." |
| Trailie speaking | Blue | Speaking animation | "Trailie is speaking" |
| Tool calling | Orange | Spinner ring + bouncing dots | Tool-specific label |
| Error | Red | Error icon | "Connection error" |

### Tool Call Labels

| Tool | UI Label |
|------|----------|
| `get_park_details` | "Fetching live park data" |
| `search_parks` | "Searching parks" |
| `compare_parks` | "Comparing parks" |
| `find_events` | "Finding events" |
| `plan_trip` | "Building your itinerary" |

---

## Technical Details

### Voice Model Configuration

```json
{
  "model": "gpt-realtime",
  "output_modalities": ["audio"],
  "audio": {
    "input": {
      "turn_detection": {
        "type": "semantic_vad",
        "interrupt_response": true,
        "create_response": true
      }
    },
    "output": {
      "voice": "marin"
    }
  }
}
```

- **Semantic VAD:** Understands natural speech patterns — pauses mid-sentence don't trigger responses, only when the user is actually done talking
- **Interrupt support:** User can interrupt Trailie mid-response by speaking
- **Voice:** `marin` — warm, conversational tone

### Rate Limiting

- 30 sessions per hour per user (keyed by UID or IP)
- Stale rate limit entries cleaned probabilistically (1% chance per request)
- Returns 429 with descriptive error message when exceeded

### Security

- Park codes sanitized: alphanumeric only, max 10 chars
- Geolocation validated: lat ≤ 90, lng ≤ 180
- Query inputs truncated (state: 2 chars, activity: 50 chars, query: 100 chars)
- Ephemeral tokens — API keys never sent to the browser
- Rate limiting per user/IP

### React Strict Mode Handling

React Strict Mode double-mounts components in development, which would cause:
- Double microphone requests
- Double WebRTC connections

Solved with a **generation counter** (`connectGenRef`):
- Each `connect()` call increments the counter
- Async steps check `stale()` before proceeding
- If a newer connect started, the older one bails out silently

### Error Recovery

- Geolocation timeout: 2 seconds, falls back gracefully (no location data)
- Park pre-fetch failure: non-blocking, falls back to tool calls
- WebRTC disconnect/failure: shows error state, cleans up resources
- Function call failure: sends error message back so the model can respond gracefully
- Connection state monitoring via `onconnectionstatechange`

---

## Environment Variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `OPENAI_API_KEY` | Yes | Server-side key for creating realtime sessions |
| `NEXT_PUBLIC_API_URL` | No | API URL override (defaults to localhost:5001 in dev, production URL in prod) |

---

## Future Considerations

- Trip planning via voice (`plan_trip` tool definition exists but is not yet wired to voice)
- Voice session history/persistence
- Multi-language support
- Voice-initiated navigation (e.g., "Take me to the Zion page")
