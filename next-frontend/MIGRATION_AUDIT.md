# Vite → Next.js Migration Audit

## Route Parity

| Old Vite Route | Old File | Next.js Route | Status |
|---|---|---|---|
| `/` | `LandingPage.jsx` | `/` (`src/app/page.jsx`) | DONE |
| `/about` | `AboutPage.jsx` | `/about` | DONE |
| `/faq` | `FAQPage.jsx` | `/faq` | DONE |
| `/privacy` | `PrivacyPage.jsx` | `/privacy` | DONE |
| `/terms` | `TermsPage.jsx` | `/terms` | DONE |
| `/features` | `FeaturesPage.jsx` | `/features` | DONE |
| `/login` | `LoginPage.jsx` | `/login` | DONE |
| `/signup` | `SignupPage.jsx` | `/signup` | DONE |
| `/verify-email/:token` | `VerifyEmailPage.jsx` | `/verify-email/[token]` | DONE |
| `/forgot-password` | `ForgotPasswordPage.jsx` | `/forgot-password` | DONE |
| `/reset-password/:token` | `ResetPasswordPage.jsx` | `/reset-password/[token]` | DONE |
| `/parks/:parkCode` | `ParkDetailPage.jsx` | `/parks/[parkCode]` | DONE |
| `/explore` | `ExploreParksPage.jsx` | `/explore` | DONE |
| `/home` | `DailyFeedPage.jsx` | `/home` | DONE |
| `/compare` | `ComparePage.jsx` | `/compare` | DONE |
| `/testimonials` | `TestimonialsPage.jsx` | `/testimonials` | DONE |
| `/unsubscribe` | `UnsubscribePage.jsx` | `/unsubscribe` | DONE |
| `*` (404) | `NotFoundPage.jsx` | `not-found.jsx` | DONE |
| `/map` | `MapPageWrapper.jsx` + `MapPage.jsx` + `MobileMapPage.jsx` | `/map` (responsive) | DONE |
| `/profile` | `ProfilePage.jsx` | `/profile` | DONE |
| `/plan-ai` | `PlanAIPage.jsx` | `/plan-ai` | DONE |
| `/plan-ai/:tripId` | `PlanAIPage.jsx` | `/plan-ai/[tripId]` | DONE |
| `/blog` | `BlogPage.jsx` | `/blog` | DONE |
| `/blog/:slug` | `BlogPostPage.jsx` | `/blog/[slug]` | DONE |
| `/events` | `EventsPage.jsx` | `/events` | DONE |
| `/parks/:parkCode/activity/:id` | `ActivityDetailPage.jsx` | `/parks/[parkCode]/activity/[id]` | DONE |
| `/admin` | `AdminDashboard.jsx` | `/admin` | DONE |
| `/admin/login` | `AdminLoginPage.jsx` | `/admin/login` | DONE |
| `/admin/blog/new` | `CreateBlogPage.jsx` | `/admin/blog/new` | DONE |
| `/admin/blog/edit/:id` | `EditBlogPage.jsx` | `/admin/blog/edit/[id]` | DONE |
| `/admin/performance` | `AdminPerformancePage.jsx` | `/admin/performance` | DONE |
| `/admin/users` | `AdminUsersPage.jsx` | `/admin/users` | DONE |
| `/admin/settings` | `AdminSettingsPage.jsx` | `/admin/settings` | DONE |

## Summary

- **DONE**: 31 routes (all migrated)
- **PENDING**: 0 routes

## Infrastructure Status

| Component | Status |
|---|---|
| App Router bootstrap | DONE |
| Providers (React Query, Theme, Toast, Auth) | DONE |
| Proxy (auth redirect, renamed from middleware for Next.js 16) | DONE |
| `robots.ts` | DONE |
| `sitemap.ts` | DONE |
| `error.jsx` (error boundary) | DONE |
| `not-found.jsx` (404 page) | DONE |
| Speed Insights | PENDING |
| SSG/ISR for park pages | DONE |
| Playwright E2E | DONE |
| Lighthouse CI | PENDING |
