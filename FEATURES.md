# TrailVerse — Product Features Catalog

A user-facing catalog of everything TrailVerse can do for visitors planning
trips to America's National Parks. Organized by capability area so product,
design and stakeholders can see the full picture at a glance.

### Access legend

- 🌐 **Public** — no account required
- 🔒 **Auth** — signed-in users only
- ⚡ **Hybrid** — available to everyone, with extra capability for signed-in
  users (e.g. 5 free AI messages for anonymous, unlimited for Auth)

---

## Table of Contents

0. [Page Index](#0-page-index)
1. [Discovery & Exploration](#1-discovery--exploration)
2. [Interactive Map](#2-interactive-map)
3. [Park Detail Experience](#3-park-detail-experience)
4. [Parks by State](#4-parks-by-state)
5. [Park Comparison](#5-park-comparison)
6. [AI Trip Planner](#6-ai-trip-planner)
7. [Personalized Daily Nature Feed](#7-personalized-daily-nature-feed)
8. [Reviews & Ratings](#8-reviews--ratings)
9. [Events & Ranger Programs](#9-events--ranger-programs)
10. [Blog & Editorial Content](#10-blog--editorial-content)
11. [User Accounts & Profiles](#11-user-accounts--profiles)
12. [Favorites, Visits & Saved Items](#12-favorites-visits--saved-items)
13. [Trips & Chat History](#13-trips--chat-history)
14. [Testimonials](#14-testimonials)
15. [Accounts & Sign-In](#15-accounts--sign-in)
16. [Notifications & Email](#16-notifications--email)
17. [Sharing & Social](#17-sharing--social)
18. [Static & Informational Pages](#18-static--informational-pages)
19. [Global UI & Platform Features](#19-global-ui--platform-features)

---

## 0. Page Index

Every route in the app and who can access it.

### Public pages (🌐)
| Route | What it is |
|---|---|
| `/` | Landing page — hero, search, featured parks, testimonials, CTAs |
| `/explore` | All-parks listing with search, filters, sorting and view modes |
| `/parks/[parkCode]` | Individual park detail page |
| `/parks/[parkCode]/activity/[id]` | Individual park activity detail page |
| `/parks/state/[stateCode]` | Parks filtered by a specific US state |
| `/map` | Interactive map of all parks |
| `/compare` | Side-by-side comparison of up to 4 parks |
| `/events` | Events and ranger programs catalog |
| `/blog` | Blog index with featured, popular, categories |
| `/blog/[slug]` | Individual blog post |
| `/blog/category/[category]` | Blog posts filtered by category |
| `/plan-ai/shared/[shareId]` | Public read-only view of a shared AI trip |
| `/testimonials` | Public testimonials wall |
| `/about` | About TrailVerse |
| `/features` | Marketing features showcase |
| `/faq` | Frequently Asked Questions (accordion) |
| `/privacy` | Privacy Policy |
| `/terms` | Terms of Service |
| `/unsubscribe` | Email unsubscribe landing (tokenized) |
| `/not-found` | 404 page |
| `/error` | Global error boundary |

### Authentication pages (🌐)
| Route | What it is |
|---|---|
| `/login` | Sign in (also available as an inline modal from gated actions) |
| `/signup` | Create account |
| `/forgot-password` | Request password-reset email |
| `/reset-password/[token]` | Set a new password via emailed token |
| `/verify-email/[token]` | Confirm email address via emailed token |

### Hybrid pages (⚡)
| Route | Public experience | Auth experience |
|---|---|---|
| `/plan-ai` | 5 free AI messages per 48 h, no web search, no save | Unlimited messages, auto-save, web search, share, PDF export |
| `/chat-history` | Sign-in gate | Active + archived conversations with topic pills |

### Auth-only pages (🔒)
| Route | What it is |
|---|---|
| `/home` | Personalized Daily Nature Feed (signed-in homepage) |
| `/profile` | User profile with all personal tabs |
| `/plan-ai/[tripId]` | Continue or view a saved AI trip |
| `/plan-ai/[tripId]/itinerary` | Dedicated multi-day itinerary builder for a trip |

---

## 1. Discovery & Exploration

### Landing page — `/` 🌐
- Full-bleed hero banner with background imagery and a "470+ Parks. One
  Platform" credibility badge.
- Global park autocomplete search — results show thumbnail, full name, states
  and designation and deep-link to the park detail page.
- Featured parks carousel/grid (image, name, location, short description) with
  hover-zoom and image lazy-loading.
- Primary calls to action: *Plan with AI*, *Browse All Parks*, *Interactive
  Map*.
- Daily-feed teaser surfacing the "Popular Destinations" block.
- Testimonial preview row linking to the full testimonials page.

### Explore page — `/explore` 🌐
- All 470+ National Parks and NPS sites, paginated (12–24 per page) with
  skeleton loaders and graceful empty states.
- **View modes:** grid (default) or list, toggled from the header.
- **Search:** debounced text search across name, code and state.
- **Filters:** national-parks-only toggle, multi-select states, multi-select
  activities, active-filter chips and a *Clear filters* action.
- **Sorting:** name, state, rating, crowd level, recently updated.
- **Virtualized park list** — smooth scrolling through hundreds of parks
  without jank.
- **Responsive filter sidebar** — collapsible on desktop, bottom-sheet on
  mobile.
- Per-card heart button to save a park to *Favorites* 🔒.
- Star ratings surfaced on cards when review data exists.

### Universal park search 🌐
- Autocomplete is available from both the landing hero and the header.
- Searches match on park name, 4-letter park code, and state.
- Results show designation (*National Park*, *National Monument*, etc.) so
  users can tell park types apart.

---

## 2. Interactive Map — `/map`

A dedicated experience that pairs a scrollable park list with a live map.

- 🌐 **Two-pane desktop layout:** park list on the left, interactive map on
  the right with synced selection.
- 🌐 **Mobile layout:** full-screen map with a slide-up bottom sheet for park
  details and a top search bar.
- 🌐 **Park markers** with clustering at low zoom, color-coded by region/type
  and info windows on click.
- 🌐 **Dark theme map** styling aligned with the TrailVerse brand.
- 🌐 **Map interactions:** click to select, drag to pan, scroll/pinch to zoom,
  double-click zoom, auto-fit bounds when a park is selected.
- 🌐 **Map-side filters:** state, park type (National Park, Monument,
  Historic Site, etc.), activity, and free-text search with a *Clear filters*
  button.
- 🌐 **Park preview cards** in the list pane showing thumbnail, name,
  location, quick stats and a favorite button.
- 🌐 **Full-screen toggle** and accessibility-friendly keyboard controls.
- 🌐 **Graceful fallback** — if the interactive map fails to load, a static
  map image is shown instead so the page is never broken.
- 🌐 **Persistent map state** — zoom, center, search query and selected
  park are remembered in the browser (localStorage) so reopening the map
  on the same device restores your last view.

---

## 3. Park Detail Experience — `/parks/[parkCode]`

### Hero & quick info
- 🌐 Full-width hero image with park name, states, designation, and
  visitor-center phone.
- 🌐 **Alert banner** at the top of the page for active NPS alerts (closures,
  warnings, road work), dismissible per session.
- 🌐 Quick-info cards: current weather, entrance fees, best time to visit,
  key amenities, accessibility summary, live crowd level.
- 🌐 *Share*, *Plan a Trip with AI*.
- 🔒 *Add to Favorites*.
- 🔒 *Mark as Visited* / update visit notes.

### Tabbed content 🌐
- **Overview** — key facts, history and highlights.
- **Activities** — icon-annotated list of every activity available at the
  park; clickable to cross-filter related parks.
- **Camping** — campgrounds with facilities, reservation info and links.
- **Accessibility** — ADA compliance details and accessible trails.
- **Weather** — live weather widget with current conditions, wind, humidity,
  visibility and 5-day forecast.
- **Reviews** — community reviews with average rating, distribution and
  filter options. 🔒 *Write a Review* button.
- **Maps** — embedded interactive map with boundaries, POIs and trails.
- **News** — recent park updates and alerts.
- **Hours & Entrance** — operating hours, entrance fees and gate info.

### Contextual data 🌐
- **Alerts** from the National Park Service (closures, warnings, road work).
- **Visitor centers**, **places of interest**, **ranger-led tours**,
  **webcams** and **videos** pulled from live NPS data.
- **Photo gallery** with official park imagery (opens in a full-screen
  lightbox with next/prev navigation and keyboard controls).
- **Parking lots**, **brochures**, **permits** and **facilities**.
- **Related parks** block — "similar parks you might like" with comparison
  metrics.

---

## 3b. Activity Detail — `/parks/[parkCode]/activity/[id]` 🌐

Every activity inside a park (specific trails, ranger programs, guided tours)
gets its own page.

- Activity hero image with photo gallery and image selector.
- Key facts: duration, difficulty, season / best time, pet policy,
  accessibility, reservation requirements and fees.
- Rich description with practical tips.
- **Directions** — Google Maps link to the trailhead or meeting point.
- **Related activities** — tags and cross-links to similar activities in the
  same park.
- **Share buttons** for social media.
- Deep links back to the parent park page.

---

## 4. Parks by State — `/parks/state/[stateCode]` 🌐

- Landing page listing every park inside a given US state.
- Inherits the card layout and filters from the main explore experience.
- SEO-friendly entry point for search traffic like "national parks in Utah".
- Deep-links back to individual park pages and to the main map/explore views.

---

## 5. Park Comparison — `/compare` 🌐

- Compare **up to 4 parks** at once via search or quick-add.
- Selected-park chips with thumbnail, name, designation, state and a remove
  button.
- **Comparison highlights** auto-computed across the selection: *Best overall
  bet*, *Warmest right now*, *Lower-crowd option* and *Shared highlights*.
- **Comparison table** with sticky left column and rows for:
  - Designation, states
  - Star rating and review counts
  - Current temperature and seasonal averages
  - Visitor centers, campgrounds, lodging, food facilities
  - Accessibility status
  - Best time to visit (months + rationale)
  - Current crowd level
  - Entrance fees
  - Top activities
  - Quick actions (*View Details*, *Plan Trip*)
- **Color-coded columns** — each park gets a unique accent used in headers
  and highlights.
- **Fully responsive** (single column on mobile, 2-col on tablet, full table
  on desktop).
- **Road-trip CTA** — "Can't decide? Visit both" button pre-fills Plan AI
  with all selected parks.

---

## 6. AI Trip Planner — `/plan-ai` ⚡

Conversational, context-aware trip planning.

### Intake — Quick Fill modal 🌐
- Park selector with autocomplete.
- Start/end date pickers.
- Group-size stepper.
- Budget range slider.
- Multi-select interests (hiking, photography, wildlife, etc.).
- Fitness level radio (easy / moderate / challenging).
- Accommodation type radio (camping / hotel / mixed).
- URL parameters can auto-populate the form (e.g. from a park page CTA).

### Chat experience 🌐
- **Streaming responses** — answers appear word-by-word with a typing
  indicator.
- Alternating user/assistant bubbles, timestamps, copy-message buttons and
  quick actions on responses.
- **Context bar** showing the current park selection, dates, group size and
  budget so users can see what the AI is planning against.
- **Suggested prompts** ("Create a 3-day itinerary", "Best hiking trails",
  "Family-friendly activities", "Budget camping options").
- **Collapsible history drawer** showing prior messages.
- **AI provider selector** — pick which model answers a question (Claude or
  OpenAI) with keyboard-navigable tabs, model icons and a selected checkmark.
- 🔒 **Share mode** — generates a view-only public link to a conversation.
- 🌐 **Shared conversation viewer** — recipients of a share link see a
  dedicated read-only rendering without signing in.

### What the AI knows 🌐
The assistant is grounded in fresh, real-world data before every answer:
- **Live weather** — current conditions and 5-day forecast for the park.
- **National Park Service facts** — alerts, campgrounds, visitor centers,
  facilities, permits and events for every park referenced in the message.
- **Recreation.gov permits** — backcountry, vehicle and timed-entry permits.
- **Multi-park awareness** — a single message mentioning two parks pulls
  facts for both.
- 🔒 **Live web search** — road and trail conditions, news, events, seasonal
  wildlife and local business lookups with freshness filters (disabled for
  anonymous visitors, who see a sign-up prompt instead).

### Itineraries
- 🌐 Automatic itinerary extraction from AI responses.
- 🔒 **Save Trip modal** — name the trip, add a description, save it to the
  profile.
- 🔒 **Continue a trip** — open any saved trip at `/plan-ai/[tripId]` to pick
  up the conversation exactly where it left off.
- 🔒 **Dedicated itinerary builder** — `/plan-ai/[tripId]/itinerary` opens a
  full-page multi-day planner with drag-and-drop stops, a day column per day,
  add-stop search, per-stop cards with notes, and conflict detection.
- 🔒 **PDF export** of the final plan with full trip document formatting.

### Public shared trip view — `/plan-ai/shared/[shareId]` 🌐
- Recipients of a share link open a dedicated read-only page that renders
  the AI conversation and itinerary without needing to sign in.
- Layout optimized for presentation — no editing controls, no chat input.
- Works for both conversation shares and trip shares.

### Feedback ⚡
- Thumbs up/down buttons on every assistant response, with a clear
  liked/disliked visual state.
- 🔒 Submitted feedback is saved to the user's account so the assistant can
  learn what was useful. Anonymous users see the buttons but their clicks
  aren't persisted — another gentle nudge to sign up.

### Anonymous usage ⚡
- Visitors without an account get **5 free messages per 48 hours**.
- Live counter shows remaining messages.
- At the limit, a friendly modal invites sign-up with a reset timer and
  sign-in/sign-up CTAs.
- Sign-up carries the anonymous conversation and any pending trip forward to
  the new account automatically.

---

## 7. Personalized Daily Nature Feed — `/home` 🔒

A signed-in homepage that delivers a fresh dose of park content every day.

- **Park of the day** hero with full-width imagery, date badge and CTAs.
- **Quick info cards** with live weather, sunrise/sunset/twilight timings,
  moon phase, visibility and wind.
- **Lead insight** — AI-written bold narrative about the featured park.
- **Park insights grid** — habitat, wildlife, geology bullets.
- **Weather analysis card** — what to wear, what to bring, comfort and safety.
- **Sky analysis card** — tonight's astronomy focus, best viewing windows.
- **At-a-glance card** — quick practical takeaways.
- **Personalized recommendations** — time-targeted "do this now" actions
  based on weather and time of day.
- Feed refreshes automatically every day so users always see same-day
  content.

---

## 8. Reviews & Ratings

Community-driven park reviews, surfaced on park detail pages.

- 🌐 **Review listing** per park with pagination and summary statistics
  (average rating, rating distribution).
- 🌐 **Ranger responses** to reviews appear inline.
- 🌐 **Top-rated parks** lists power featured selections and sort options.
- 🌐 **Reviewer avatars** displayed on every review.
- 🔒 **Helpful voting** — mark reviews helpful or not helpful.
- 🌐 **Live updates** — new reviews appear to other browsing sessions
  without needing to refresh.
- ⚡ **Write a review** — title, 1–5 star rating, comment, visit year,
  activities, highlights and challenges. **Guests can submit reviews** too
  (with an optional display name that defaults to *Guest Explorer*); signed-
  in users get their real name attached.
- 🔒 **Photo attachments** — upload images with your review (multiple files,
  previews, remove-before-submit). Photo upload is only available to
  signed-in users.
- 🔒 **Review image gallery** — photos from other users are browsable under
  each park.
- 🔒 **Edit / delete** your own reviews.
- 🔒 **User review dashboard** — see all your reviews from the profile.

---

## 9. Events & Ranger Programs — `/events`

- 🌐 **Events catalog** with grid of ranger programs, guided hikes, lectures
  and activities.
- 🌐 **Filters:** by park, type, state, date range; plus keyword search.
- 🌐 **Event cards** with imagery, title, park, date/time, duration, category
  badge and *Learn More*.
- 🌐 **List and grid view modes** toggled from the header.
- 🌐 **Event detail pages** with full description, timezone-aware dates,
  location, capacity and related events. Registration itself happens on the
  external NPS/Recreation.gov site via a link.
- 🌐 **Save / unsave events** — bookmark interesting events with a single
  click. Stored locally in the browser, so it works for everyone without an
  account.
- 🌐 **Saved Events list** — surfaced under the profile (if signed in) and
  persists in the browser between visits.
- 🌐 **Cross-tab sync** — saving an event in one tab updates the list
  instantly in other open tabs on the same device. Not synced across devices.

---

## 10. Blog & Editorial Content

### Blog index — `/blog` 🌐
- Featured posts carousel/cards at the top.
- Popular posts list with view counts.
- Category pills for navigation and an *All Posts* view.
- Post grid with image, category tag, title, excerpt, author, publish date,
  read-time estimate.
- Numbered pagination with page-size 12, including "Showing X of Y" counter.
- Full-text search and category filter.

### Blog category — `/blog/category/[category]` 🌐
- Dedicated listing page for each category, reusing the blog index layout.
- SEO-friendly URL for categories like "hiking" or "photography".

### Blog post detail — `/blog/[slug]`
- 🌐 Hero image, author, date, category, tags, read time.
- 🌐 Rich text body, inline imagery and embedded media.
- 🌐 **Auto-generated table of contents** — sticky on desktop, expandable on
  mobile; jump-to-heading scrolling.
- 🌐 **Author bio card** — name, avatar, short bio and author profile link at
  the end of the post.
- 🌐 **Share buttons** (Twitter, Facebook, email).
- 🌐 **Like** a post (count visible to everyone).
- 🌐 **Comment section** with posting, likes and deletion.
- 🌐 **Related posts** carousel.
- 🌐 **Inline newsletter widget** — subscribe without leaving the article.
- 🌐 **Back-to-blog** navigation.
- 🔒 **Favorite** a post — appears under the profile's favorited-posts tab.

---

## 11. User Accounts & Profiles — `/profile` 🔒

### Profile header
- Avatar with upload, name (first/last), bio, cover image and *Edit Profile*
  button.
- **Quick stats:** parks visited, parks favorited, reviews written, trips
  planned, member since.

### Profile tabs
- **Account settings** — email, password, name, avatar upload, bio, location,
  website, privacy toggles and *Delete Account* (with confirmation modal).
- **Saved Parks** — favorited parks grid with remove-from-favorites.
- **Visited Parks** — mark/unmark visited, track visit date, notes and
  photos, quick *Write a Review* jump.
- **Saved Events** — events the user has bookmarked from the events
  catalog (browser-local, cross-tab sync).
- **Reviews** — list of your reviews with edit/delete, helpful counts.
- **Saved Trips / Trip History** — AI-planned trips with status
  (active/archived), trip summary cards, *Continue Planning*, *View Trip*
  and delete.
- **Favorite Blog Posts** — saved articles with quick unsave.
- **Testimonial** — view/edit/delete your submitted testimonial.
- **Settings** — email notification preferences and newsletter subscription
  toggles.

### Avatar system
- **Avatar upload** — upload your own image with automatic resize.
- **Avatar picker** — choose from a gallery of generated/preset avatars.
- **Unified avatar selector** — a single picker surface used across the app
  (profile, reviews, header) so the avatar stays consistent everywhere.

---

## 12. Favorites, Visits & Saved Items

- 🔒 **Favorite parks** — add/remove via heart button on any park card or
  detail page; synced across tabs and devices in real time.
- 🔒 **Visited parks** — mark parks as visited with optional visit date,
  photos and notes; separate from favorites.
- 🔒 **Favorite blog posts** — heart any article to save it.
- 🌐 **Saved events** — bookmark events from the catalog; stored in the
  browser and synced across open tabs on the same device. Works without an
  account.
- 🔒 **Favorites count** — surfaced in the profile header and kept live
  without polling.

---

## 13. Trips & Chat History

### Trip management 🔒
- Create, read, update and delete AI-planned trips.
- Trip form data captured: dates, group size, budget, fitness level,
  interests, accommodation and activities.
- Conversation history attached per-trip with auto-save.
- Itinerary saved alongside the chat so it can be re-rendered without
  another model call.
- **Share a trip** — generate a public link for read-only viewing.
- **Trip statuses:** active, archived, deleted.
- **Trip summary cards** — message counts, topics and last activity at a
  glance.

### Chat history — `/chat-history` 🔒
- Two tabs: **Active** and **Archived**.
- Per-conversation cards showing status badge, title (usually the park), last
  updated time, message count, 140-character preview and up to three
  extracted **topic pills** (hiking, photography, wildlife, camping, lodging,
  dining, weather, transportation, budget, safety).
- Actions: **Continue Chat**, **Archive**, **Restore**, **Delete** (with
  confirm).
- Graceful empty states and auth gate for anonymous visitors.

### Shared trip view 🌐
- Recipients of a share link see a read-only version of the trip without
  needing to sign in.

---

## 14. Testimonials — `/testimonials`

- 🌐 **Public testimonials page** with featured quotes, user avatars, star
  ratings, park attribution and park-background imagery.
- 🔒 **Submit a testimonial** from your profile with a dedicated form
  (rating, story, park selection).
- 🔒 **Edit / delete** your own testimonial.
- Real-testimonials policy — only real, reviewed user stories are featured.

---

## 15. Accounts & Sign-In

### Sign up — `/signup` 🌐
- Email + password signup with first/last name.
- Password strength meter (weak → strong) with requirements checklist.
- Confirm-password field and terms checkbox.
- Welcome email on account creation.

### Sign in — `/login` 🌐
- Email/password with show-password toggle and *Remember Me*.
- Email-verification banner if the account isn't confirmed yet, with a
  *Resend verification* action.
- **Inline login modal** — gated actions (e.g. favoriting a park, writing a
  review) open a sign-in modal in place so users don't lose their context.

### Email verification — `/verify-email/[token]` 🌐
- Tokenized link delivered by email.
- **Auto sign-in on success** — users are logged in automatically and sent
  to the right landing page (explore, chat, or their pending trip) without
  having to visit the login form.
- Error state with a clear retry/resend path.
- Resend verification available from the login banner.

### Forgot password — `/forgot-password` 🌐
- Enter email to request a reset link.
- Confirmation state after submission.
- "Back to login" navigation.

### Reset password — `/reset-password/[token]` 🌐
- New password + confirm password with strength meter.
- Show/hide password toggles.
- Success state that redirects to login.

### Session behavior
- 🔒 Sign-in persists across visits with *Remember Me*.
- 🔒 Sign-out available from the user menu in the header.
- ⚡ Automatic session migration — anonymous chat users who sign up mid-flow
  keep their conversation and any pending trip.

---

## 16. Notifications & Email

### Emails a user might receive
- 🔒 Welcome email on signup.
- 🔒 Email verification.
- 🌐 Password reset (only requires knowing the account email).
- 🔒 Blog-post published notification.
- 🔒 Feature announcement.
- 🌐 Newsletter confirmation (double opt-in).
- 🌐 Unsubscribe confirmation.
- 🔒 Account-deletion confirmation.

### Newsletter & preferences
- 🌐 **Subscribe** to the newsletter with double opt-in confirmation.
- 🌐 **Inline newsletter widget** embedded in blog posts.
- 🌐 **Unsubscribe** landing page (`/unsubscribe`) offering selective or full
  unsubscribe via tokenized link.
- 🔒 **Per-user preference toggles** for blog notifications, feature
  announcements and newsletter — editable from the profile.
- 🌐 Every email has an unsubscribe footer link that works without signing
  in.

### In-app notifications 🔒
- Feature announcement modals/banners.
- System notifications for key account activity.

---

## 17. Sharing & Social

- 🔒 **Shareable AI trip links** — only signed-in users can generate a share
  link from a saved trip. The recipient opens it at `/plan-ai/shared/[shareId]`
  without needing an account.
- 🔒 **Shareable conversation links** — same flow for AI chat conversations:
  creator must be signed in, viewer does not.
- 🌐 **Share buttons** on blog post and park detail pages (Twitter, Facebook,
  email) — available to everyone.
- 🌐 **Rich link previews** — pasting any TrailVerse URL into social media or
  chat apps produces a proper preview card with image, title and description.
- 🌐 **Deep-linkable park URLs** throughout the app so any conversation about
  a park can point directly to the right page.

---

## 18. Static & Informational Pages 🌐

All accessible without an account.

### About — `/about`
- Company mission, background, values and contact info.

### Features showcase — `/features`
- Marketing page highlighting key capabilities with icons and descriptions
  (exploration, AI planning, maps, comparison, community, etc.).

### FAQ — `/faq`
- Accordion-based Q&A grouped by topic (General, Parks & Exploration, Trip
  Planning, AI Chat, Account & Settings, Technical).
- Each entry expands/collapses and supports rich-text answers.

### Privacy Policy — `/privacy`
- Full policy: information collection, use of information, data protection,
  cookies, user rights, contact info.
- Last-updated date displayed.

### Terms of Service — `/terms`
- Full terms: agreement, user responsibilities, intellectual property,
  limitation of liability, disclaimer, modifications.
- Last-updated date displayed.

### 404 — `/not-found`
- Friendly not-found page with navigation back to safe entry points.

### Error boundary — `/error`
- Graceful error state shown when something goes wrong in a route, with a
  *Try again* action.

---

## 19. Global UI & Platform Features 🌐

Things that apply across every page.

### Global header
- Logo (home link).
- Navigation: Explore, Map, Plan AI, Compare, Blog, Events.
- Mobile hamburger menu.
- Search bar (mobile).
- 🌐 Sign In / Sign Up buttons when signed out.
- 🔒 User menu when signed in: Profile, Chat History, Settings, Sign Out.

### Global footer
- Logo and tagline.
- Quick links (Explore, Plan AI, Blog, Contact).
- Product links (Features, About, FAQ).
- Legal links (Privacy, Terms, Cookie Policy).
- Newsletter signup.
- Social media links.
- Copyright notice.

### Cookie consent banner 🌐
- Displayed on first visit.
- Accept / customize options.
- Preferences persisted locally.

### PWA (installable app) 🌐
- **Install prompt** — eligible browsers are offered an *Install TrailVerse*
  action.
- **Install button** in the UI as a manual fallback.
- Works offline for previously viewed content (baseline service-worker
  support).

### Theme switcher 🌐
- **Three options:** Light, Dark, or *System* (follows OS preference).
- Listens live to OS theme changes when *System* is selected.
- Preference persisted per device.
- 🔒 Theme preference also syncs across devices in real time for signed-in
  users so your dark-mode choice follows you.

### Photo lightbox 🌐
- Clicking any gallery image opens a full-screen lightbox with next/prev
  navigation and keyboard controls.

### Breadcrumbs 🌐
- Structured breadcrumb navigation on deep pages (park details, blog posts,
  category pages) for orientation and SEO.

### Sync status indicator 🔒
- Small indicator showing when data is syncing across devices in real time
  so users know their changes have propagated.

### Toast notifications 🌐
- Success/error/warning/info toasts for user feedback after actions.

### Scroll to top 🌐
- Floating button on long pages to return to the top.

### Loading, empty & error states 🌐
- Skeleton loaders on lists and grids.
- Friendly empty states with calls to action.
- Global error boundary with a retry action.

### Accessibility 🌐
- ARIA labels, keyboard navigation, focus indicators, alt text, skip-to-main-
  content and screen-reader support throughout.

### Responsive design 🌐
- Mobile-first layout with touch-friendly controls, hamburger menu, swipe
  gestures and responsive tables/grids across all breakpoints.

---

*Document generated from a full review of the TrailVerse application's
frontend routes, components and backend capabilities. This is a product
reference — for implementation details on any single feature see the dedicated
write-ups in `docs/`.*
