// Shared by the visible FAQ and FAQPage structured data. Audited against local code, October 5, 2026.
export const FAQ_CATEGORIES = [
  {
    "category": "Getting started",
    "icon": "Sparkles",
    "questions": [
      {
        "question": "What is TrailVerse?",
        "answer": "TrailVerse brings together information for 470+ National Park Service parks and sites, maps, weather, alerts, events, community content, and Trailie trip planning. It is an independent product, not an official National Park Service website."
      },
      {
        "question": "Do I need an account?",
        "answer": "No. You can browse parks, use the map, compare parks, read guides, and browse events without signing in. Create a free account to save park and blog favorites, track visits, and keep Trailie trips in your history."
      },
      {
        "question": "Is TrailVerse free?",
        "answer": "TrailVerse currently offers free browsing and free accounts. Website guests can complete 5 Trailie chat turns within the 48-hour guest allowance. Sign in to continue beyond that allowance. Voice and connected apps have separate usage limits; external services may require their own account or plan."
      },
      {
        "question": "Where should I start?",
        "answer": "Use Explore to search and filter parks, Map to see parks and nearby campgrounds or places, or Sample Itineraries for trip ideas. Open Trailie when you want help turning dates, interests, and constraints into a plan."
      }
    ]
  },
  {
    "category": "Trailie and your trips",
    "icon": "Sparkles",
    "questions": [
      {
        "question": "What can Trailie plan?",
        "answer": "Ask for park suggestions, comparisons, day-by-day itineraries, or changes to an existing trip. Trailie can use NPS, weather, and other relevant sources when available. Signed-in website users can request named state parks and other outdoor destinations with relevant web research. Coverage and the detail available vary by destination; check important arrangements with the official source."
      },
      {
        "question": "Does Trailie search the web for every answer?",
        "answer": "No. The website guest experience does not use live web search. Signed-in requests can use web research when it is relevant; NPS questions can rely on park data instead. ChatGPT and Claude use a separate connector route that can also fetch relevant evidence. A reply is not a guarantee that every source is current or every detail has been verified."
      },
      {
        "question": "What AI powers Trailie?",
        "answer": "The current website planner is configured around Anthropic Claude. Talk to Trailie uses OpenAI Realtime for voice. The service handles model selection; you do not need to choose a model. Your request and relevant conversation or trip context are processed by AI services."
      },
      {
        "question": "What is Quick Fill?",
        "answer": "Quick Fill helps you start a trip using a National Parks picker and preferences such as dates, group size, and interests. You can also type a destination or describe a different kind of trip directly in chat."
      },
      {
        "question": "How do history and recommendations work?",
        "answer": "Signed-in trips are saved in your history so you can reopen, rename, archive, restore, or delete them. My Recommendations appears after trips for at least three distinct parks have been recorded. It starts a conversation based on your planning history; saving favorites alone does not unlock it."
      },
      {
        "question": "Can I edit, export, or share a plan?",
        "answer": "A generated itinerary can be opened in the plan workspace to reorder stops and edit activities. PDF export provides a downloaded copy for offline reference. A public share link lets anyone with the link view the shared trip and conversation, so review the content before sharing."
      },
      {
        "question": "How does voice work?",
        "answer": "Talk to Trailie uses your microphone to send audio to OpenAI Realtime and can call park search, details, comparison, and event tools. Guests get 3 voice sessions per 24 hours; voice use is also limited to 10 sessions per hour. Microphone permission and an internet connection are required."
      }
    ]
  },
  {
    "category": "Parks, maps, and events",
    "icon": "Mountain",
    "questions": [
      {
        "question": "What parks are included?",
        "answer": "The browsing catalog covers 470+ NPS parks and sites, including national parks, monuments, historic sites, seashores, and other designations. The National Parks filter shows that designation only. State-park chat planning does not mean every state park has a catalog page."
      },
      {
        "question": "How does the map work?",
        "answer": "The map lets you search for parks and switch between park, campground, and place layers. Open a marker for a preview and links to details. Explore has separate state and designation filters. Map tiles and current place information need a connection."
      },
      {
        "question": "How current are weather and alerts?",
        "answer": "Park pages can show OpenWeather current conditions and a five-day forecast, plus NPS alerts. Availability depends on the location and data source. A future trip date is not a long-range weather forecast; check official alerts and a current forecast before leaving."
      },
      {
        "question": "How do I find and save events?",
        "answer": "Use the Events search, month selector, category filters, and grid or calendar view. Event bookmarks are stored in this browser on this device; they do not sync to your account. Follow the event’s official link for registration requirements and updates."
      }
    ]
  },
  {
    "category": "Community and saved places",
    "icon": "Heart",
    "questions": [
      {
        "question": "What syncs with my account?",
        "answer": "Park favorites, saved blog posts, visited-park records, and saved Trailie trips are associated with your account. Event bookmarks and some browser preferences are stored locally and can disappear if you clear browser data."
      },
      {
        "question": "How do I track visited parks?",
        "answer": "Sign in, then use the visited-park controls on park pages or in your profile to record a visit, date, and notes. You can manage those records from your profile."
      },
      {
        "question": "How do photo reviews and comments work?",
        "answer": "Signed-in users can write park reviews and add up to 5 images per review, with a 10 MB limit per image. Supported review uploads include JPEG, PNG, GIF, and WebP. Blog discussions support comments, replies, likes, and editing or deleting your own comments."
      },
      {
        "question": "How do Traveler Stories work?",
        "answer": "You can submit a name, rating, and story without an account. Stories are reviewed before public display. Do not include private information you would not want published."
      },
      {
        "question": "Can I use TrailVerse offline?",
        "answer": "You can install TrailVerse on supported devices, and some assets or previously loaded park data may be cached. This is not a complete offline park guide: live data, chat, account history, and many page loads need a connection. Download a trip PDF before traveling if you need an offline copy."
      }
    ]
  },
  {
    "category": "Privacy and support",
    "icon": "Shield",
    "questions": [
      {
        "question": "Are my trips private?",
        "answer": "Saved website trips are tied to your account. AI providers process relevant messages and context to generate replies; information you type is not guaranteed to be anonymized. Public share links expose the shared trip and conversation to anyone with the link. Reviews, comments, and approved stories are public."
      },
      {
        "question": "How do I delete my account?",
        "answer": "In Profile settings, open Privacy & Security and choose Delete Account. Confirm your password and type DELETE. The deletion process removes linked account records, trips, reviews, comments, and controlled uploads; limited deletion-audit records and separately retained service logs may remain. Contact support about guest submissions or data not linked to your account."
      },
      {
        "question": "How can I contact support?",
        "answer": "Email trailverseteam@gmail.com for questions, corrections, privacy requests, or bug reports. For a park closure, permit, reservation, or emergency, contact the responsible park or service directly."
      }
    ]
  }
];
