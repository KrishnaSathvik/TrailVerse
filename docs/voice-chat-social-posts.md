# TrailVerse Voice Chat — Social Media Posts

---

## X / Twitter

### Post 1 — Launch announcement (thread starter)

Just shipped voice chat for TrailVerse — ask Trailie anything about U.S. national parks and get answers with live data.

"What parks are near me?"
"Any closures at Zion right now?"
"Compare Glacier and Yellowstone"

Built with OpenAI Realtime API + WebRTC. Real-time weather, alerts, events — not cached training data.

https://www.nationalparksexplorerusa.com

### Post 2 — Thread reply (technical angle)

How it works under the hood:

- Browser requests mic → WebRTC peer connection to OpenAI Realtime API
- Voice-to-voice, no text intermediary for latency
- Function calling hits our Express backend for live NPS data, weather, alerts
- Geolocation finds your 8 nearest parks automatically
- Park page context is pre-fetched so answers are instant

### Post 3 — Thread reply (feature highlights)

What Trailie Voice can do:

- Get live park details (weather, fees, hours, alerts)
- Search 470+ NPS sites by state, activity, or keyword
- Compare parks side-by-side
- Find upcoming ranger programs and events
- "Near me" queries using browser geolocation
- Seasonal recommendations based on current date

---

## LinkedIn

### Post

**We just added voice chat to TrailVerse — and it answers with live national park data.**

TrailVerse covers all 470+ National Park Service sites. We just shipped a voice assistant called Trailie that lets you ask questions hands-free and get real-time answers — not stale training data.

**What it does:**
- Live weather, alerts, closures, fees, and hours for any NPS site
- Park search by state, activity, or keyword
- Side-by-side park comparisons
- Upcoming ranger programs and events
- "What parks are near me?" using browser geolocation
- Context-aware: if you're on a park page, Trailie already knows which park you're looking at

**How we built it:**

The stack is OpenAI's Realtime API over WebRTC for voice-to-voice with minimal latency. When Trailie needs data, it uses function calling — the model calls our Express backend, which hits the NPS API, weather services, and our own data layer. Results go back through the WebRTC data channel, and Trailie speaks the answer.

Key technical decisions:
- **Pre-fetching park context** — when you open voice chat on a park page, we inject live weather, alerts, and fees into the model's instructions so the first answer is instant (no tool call round-trip)
- **Geolocation with timeout racing** — we request browser location with a 2-second timeout so the connection doesn't stall if permissions are slow
- **Semantic VAD** — using OpenAI's semantic voice activity detection instead of silence-based, so the model knows when you're actually done talking
- **Function calling over MCP** — we started with MCP tools but migrated to Express function calling for better control, lower latency, and simpler error handling

This is in beta. Try it at https://www.nationalparksexplorerusa.com — the mic button is in the bottom right.

#NationalParks #WebRTC #OpenAI #VoiceAI #TrailVerse #RealtimeAPI #React #NextJS

---

## Reddit

### r/webdev or r/nextjs

**Title:** Built a voice assistant for national parks using OpenAI Realtime API + WebRTC — here's how

**Body:**

I've been building TrailVerse, a platform covering all 470+ National Park Service sites. Just shipped a voice feature where you can talk to "Trailie" and get answers with live data — real-time weather, alerts, events, not cached responses.

**Tech stack:**
- Next.js frontend, Express backend
- OpenAI Realtime API (gpt-realtime model) over WebRTC
- Function calling for live data (NPS API, weather APIs)
- Browser Geolocation API for "near me" queries

**Architecture:**

1. User taps the mic button → browser requests microphone access
2. Frontend calls our Express backend for an ephemeral OpenAI token
3. WebRTC peer connection established directly with OpenAI
4. User speaks → model processes → audio response streams back
5. When the model needs data, it triggers a function call → our backend fetches from NPS/weather APIs → result sent back through the data channel → model speaks the answer

**Interesting problems we solved:**

- **Pre-fetching context:** If you're on a park page, we inject live weather, alerts, fees, and hours into the model instructions before the session starts. First answer is instant — no tool call needed.
- **Geolocation timing:** Originally we requested location in the button component and passed it via ref, but the overlay mounted before coords resolved. Moved geolocation into the connect function with a 2s Promise.race timeout.
- **MCP → function calling migration:** Started with MCP tools but switched to Express function calling. Simpler to debug, better error handling, and we control the data formatting.
- **Semantic VAD:** OpenAI's semantic voice activity detection is significantly better than silence-based. It understands when you pause mid-sentence vs when you're actually done.
- **React Strict Mode + WebRTC:** Strict Mode double-mounts components, which means double mic requests and double connections. Added a generation counter to cancel stale async connects.

**What the voice can do:**
- Get live details for any park (weather, fees, hours, alerts, activities)
- Search parks by state, activity, or keyword
- Compare two parks side-by-side
- Find upcoming ranger programs and events
- Answer "what parks are near me" using geolocation
- Seasonal recommendations (knows today's date and season)

Currently in beta — rate limited to 30 sessions/hour. Try it at https://www.nationalparksexplorerusa.com (mic button, bottom right).

Happy to answer questions about the WebRTC setup or the function calling flow.

### r/NationalPark

**Title:** Built a voice assistant for planning national park trips — ask it anything and it answers with live data

**Body:**

I've been working on TrailVerse, a site that covers all 470+ National Park Service sites (not just the 63 "big" national parks — monuments, seashores, historic sites, everything).

Just added a voice feature: tap the mic button and ask anything. It pulls live data — current weather, active alerts/closures, entrance fees, hours, ranger programs, and events.

Some things you can ask:
- "What parks are near me?" (uses your location)
- "Any closures at Yellowstone right now?"
- "Compare Zion and Grand Canyon"
- "Ranger programs at Grand Canyon this week"
- "Best parks for stargazing in Utah"

It's context-aware too — if you're on a specific park page and open voice chat, it already knows which park you're looking at and has the latest data loaded.

It's in beta right now. You can try it at https://www.nationalparksexplorerusa.com — mic button is in the bottom right corner.

Would love feedback from people who actually use it for trip planning.
