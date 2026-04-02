# TrailVerse Frontend

This is the Next.js frontend for TrailVerse, the national parks discovery and trip-planning app.

## Stack

- Next.js 16
- React 19
- Tailwind CSS 4
- TanStack Query
- Vitest + Testing Library
- Playwright

## Main Areas

- Landing and public discovery pages
- Explore, Compare, Events, Blog, and Map
- Park detail pages with NPS-driven tabs
- Plan AI chat and trip history
- Daily Feed
- Auth and profile flows

## Local Development

From `next-frontend/`:

```bash
npm install
npm run dev
```

Default local URL:

- `http://127.0.0.1:3000`

In the full app setup, the frontend is usually started from the repo root with:

```bash
cd ..
npm run dev
```

That starts both the frontend and backend together.

## Scripts

```bash
npm run dev
npm run build
npm run start
npm run lint
npm run test
npm run test:watch
npm run test:e2e
npm run test:e2e:headed
```

## Environment

Frontend environment values live in:

- `next-frontend/.env.local`

Common values used by the app include API base URLs, analytics IDs, and third-party client keys.

## Project Structure

```text
src/app/          App Router pages and layouts
src/components/   Shared UI and feature components
src/hooks/        Client hooks
src/services/     API and client-side services
src/context/      React context providers
src/styles/       Theme and prose styles
public/           Static assets and service worker files
```

## Notes

- The app uses shared button/theme tokens across public, auth, and app surfaces.
- Park detail pages, events, and daily feed rely on backend APIs and cached NPS data.
- Some flows behave differently when already authenticated, especially header/navigation state.
