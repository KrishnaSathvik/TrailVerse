# TrailVerse

**Your universe of national parks exploration.**

TrailVerse is a national parks discovery and trip-planning platform that brings together everything you need to explore, compare, plan, and remember your park adventures — all in one place.

[www.nationalparksexplorerusa.com](https://www.nationalparksexplorerusa.com)

---

## What Is TrailVerse?

TrailVerse helps you go from "Where should I go?" to "What should I do there?" to "I have a trip plan ready" — without jumping between a dozen tabs.

It combines park research, AI-powered trip planning, a visual itinerary builder, community reviews, a travel blog, and personal collections into one product designed around how people actually plan park trips.

## Why It Exists

Planning a national park trip usually means bouncing between the NPS website, Google Maps, weather apps, travel blogs, and your notes app. Park information is scattered, hard to compare, and easy to lose track of.

TrailVerse was built from real travel experience — years of visiting parks, writing reviews, and helping other travelers — to put all of that in one flow:

- **Discover** parks that match what you're looking for
- **Research** what's there — trails, camping, tours, alerts, photos, webcams
- **Compare** parks side by side
- **Plan** a trip with Trailie AI using real-time park data and curated blog guides
- **Build** a visual day-by-day itinerary
- **Save** your favorites, track your visits, and come back later

---

## What You Can Do

### Explore 470+ Parks
Browse every U.S. national park and NPS site with search, filtering, and an interactive map. Each park page gives you 14 tabs of information — activities, camping, places, tours, parking, photos, videos, webcams, alerts, facilities, brochures, permits, reviews, and visitor centers — all pulled from official NPS data.

### Plan Trips with Trailie AI
Chat with Trailie, your AI trip planner that knows national parks inside and out. Trailie uses live park data — current closures, campground availability, visitor center hours, permits, and real-time weather — so your plan reflects what's actually happening at the park right now. Just mention a park name in your message and Trailie picks it up automatically.

Trailie also draws from TrailVerse's own published blog guides — visitor tips, seasonal recommendations, astrophotography spots, and park-specific advice written from real experience — so answers go beyond generic travel info.

Try it free with 5 messages, no account needed.

### Build Visual Itineraries
After chatting with the AI, switch to the drag-and-drop itinerary builder to customize your trip:
- Organize stops by day — parks, trails, campgrounds, lodging, food, or custom spots
- Set start times and durations for each stop
- Search and add real NPS trails, campgrounds, and visitor centers
- Drag stops between days to rearrange
- Export the whole plan as a PDF
- Share it with a public link anyone can view

### Compare Parks
Put parks side by side to decide between options. Each comparison includes a direct link to start planning a trip with AI.

### Read the Blog
Travel guides, park recommendations, gear and packing tips, seasonal planning, astrophotography, and budget travel — with category filtering and full comment threads. Blog content also feeds into Trailie's knowledge, so the more guides we publish, the smarter your trip plans get.

### Browse Events
See what's happening at parks this month — ranger programs, guided tours, festivals, and seasonal events.

### Save and Track
- Save favorite parks to your collection
- Mark parks as visited with dates and personal memories
- Access your full chat history and saved trip plans anytime

### Write Reviews
Share your experience with photos (up to 5 per review) and help other travelers know what to expect.

### Personalize Your Profile
Choose from 1,000+ avatar combinations or upload your own. Your profile tracks your favorites, visits, reviews, and trip plans.

### Daily Feed
A personalized home page with a featured park, nature facts, weather context, and sky insights — something new every day.

---

## Works Everywhere

- **Dark and light mode** — toggleable across the whole app
- **Installable** — add TrailVerse to your home screen as a PWA for quick access
- **Mobile-friendly** — fully responsive design for phones, tablets, and desktop

---

## Built From Experience

TrailVerse is shaped by actual park travel, review writing, and on-the-ground trip research. The product direction came from seeing how hard it still is to answer simple questions well:

- Which park fits the kind of trip I want right now?
- What is happening there this week?
- What should I save for later?
- How do I compare this with another park?
- What do real visitors recommend?

That's why the app combines park discovery, planning, events, weather, saved collections, blogs, and reviews instead of treating them as separate products.

---

## Local Development

If you want to run TrailVerse locally:

### Requirements
- Node.js 20+
- MongoDB

### Setup

1. Install dependencies:

```bash
npm install
cd next-frontend && npm install
cd ../server && npm install
```

2. Configure environment variables:
   - Copy `server/env.example` to `server/.env` and fill in your keys
   - Copy `next-frontend/.env.example` to `next-frontend/.env.local` and fill in your keys
   - You'll need API keys for: [NPS](https://www.nps.gov/subjects/developer/get-started.htm), MongoDB, OpenWeather, and at least one AI provider (OpenAI or Anthropic)

3. Start both services:

```bash
npm run dev
```

- Frontend: `http://127.0.0.1:3000`
- Backend: `http://localhost:5001`
