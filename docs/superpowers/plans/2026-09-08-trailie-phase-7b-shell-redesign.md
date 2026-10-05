# Trailie Phase 7B Conversation Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give `/plan-ai` one calm, editorial desktop conversation grammar while preserving all existing chat, persistence, retry, quota, and header-authority behavior.

**Architecture:** Keep the current behavioral owners intact. Limit changes to presentational components, shell classes, copy for the deterministic starter set, and one narrow rendering condition that removes the duplicate guest promotion. Reuse the already loaded `--font-display` token and the existing `TrailieResponse` identity pattern.

**Tech Stack:** Next.js 16.2.1, React 19, Tailwind CSS v4, CSS custom properties, Vitest/Testing Library, Playwright CLI.

## Global Constraints

- No itinerary artifact/day-card redesign, maps, backend changes, or new features.
- Do not change TravelerJob, presentation-manifest, evidence, persistence, retry, target-resolution, or header-data semantics.
- Keep comparison structure and column logic unchanged; styling only.
- Add no font package, asset, or loading strategy; `--font-display` is already available.
- Preserve responsive safeguards without making this a mobile redesign.
- Use deterministic local state injection only; no live or paid model calls.
- Do not commit, push, or deploy.

---

### Task 1: Lock shell presentation contracts

**Files:**
- Create: `next-frontend/src/components/ai-chat/__tests__/ChatInput.test.jsx`
- Create: `next-frontend/src/components/ai-chat/__tests__/MessageBubble.test.jsx`
- Create: `next-frontend/src/components/ai-chat/__tests__/SuggestedPrompts.test.jsx`
- Modify: `next-frontend/src/components/ai-chat/__tests__/TypingIndicator.test.jsx`
- Modify: `next-frontend/src/components/trailie-response/__tests__/TrailieResponse.test.jsx`
- Modify: `next-frontend/src/components/plan-ai/__tests__/TripPlannerChatLoadingCopy.test.jsx`
- Modify: `next-frontend/src/lib/__tests__/trailieDemoPrompts.test.js`

**Interfaces:**
- Consumes: existing component props and outcome classifications.
- Produces: regression coverage for compact user turns, open Trailie status rows, one composer surface, real-question starters, visible sync copy, guest-promotion deduplication, and failure tone hooks.

- [ ] Write focused rendered/source contract tests for each Phase 7B requirement.
- [ ] Run only those tests and confirm they fail for the intended missing presentation behavior.

### Task 2: Unify the opening, turn, and state grammar

**Files:**
- Modify: `next-frontend/src/components/ai-chat/MessageBubble.jsx`
- Modify: `next-frontend/src/components/ai-chat/TypingIndicator.jsx`
- Modify: `next-frontend/src/components/ai-chat/SuggestedPrompts.jsx`
- Modify: `next-frontend/src/components/trailie-response/TrailieResponse.jsx`
- Modify: `next-frontend/src/lib/planAiWelcomeCopy.js`
- Modify: `next-frontend/src/lib/trailieDemoPrompts.js`

**Interfaces:**
- Consumes: `inlineAvatarLayout`, existing message content/outcome, and prompt click handlers.
- Produces: compact right-aligned user turns, open Trailie rows, restrained state tones, and four concise traveler-question starters.

- [ ] Implement the minimum markup/class changes needed to satisfy Task 1.
- [ ] Re-run the focused tests until green.

### Task 3: Rebalance shell, header, composer, and utilities

**Files:**
- Modify: `next-frontend/src/components/plan-ai/PlanAIShell.jsx`
- Modify: `next-frontend/src/app/plan-ai/PlanAIContent.jsx`
- Modify: `next-frontend/src/components/ai-chat/ChatInput.jsx`
- Modify: `next-frontend/src/components/plan-ai/TripPlannerChat.jsx`
- Modify: `next-frontend/src/app/globals.css`

**Interfaces:**
- Consumes: unchanged `derivePlanAiHeaderMeta` output, chat actions, quota state, and `resolveChatStatus` output.
- Produces: 68rem desktop rail, editorial active-trip heading, unified composer, secondary utilities, visible sync-needed explanation, and exactly one guest CTA.

- [ ] Implement layout and styling only, except for suppressing the duplicate generic signup prompt when a conversion message is already present.
- [ ] Preserve Enter, Shift+Enter, IME composition, disabled/loading behavior, and all action handlers.
- [ ] Re-run focused tests and the existing plan-ai/recovery/persistence regression set.

### Task 4: Refine prose and comparison presentation

**Files:**
- Modify: `next-frontend/src/components/trailie-response/TrailieMarkdown.jsx`

**Interfaces:**
- Consumes: existing rendered Markdown table tree and column-width calculation.
- Produces: calmer prose measure and table separators/header emphasis without changing table content or logic.

- [ ] Apply spacing, typography, separators, and overflow styling only.
- [ ] Re-run `TrailieResponse.test.jsx` and confirm existing column/count assertions remain green.

### Task 5: Rendered acceptance and final verification

**Files:**
- Create: `output/playwright/phase7b/*.png`

**Interfaces:**
- Consumes: the existing local frontend and deterministic browser route fixtures.
- Produces: 1440×1000 screenshots plus direct interaction/accessibility observations.

- [ ] Capture empty, short, long, recommendation, comparison, active-trip, loading, known failure, uncertain, sync-needed, guest-limit, focus, and multiline states.
- [ ] Verify keyboard order, visible focus, Enter/Shift+Enter, status live region, 200% zoom/reflow, and non-hover status copy.
- [ ] Run fresh focused tests, plan-ai regressions, lint for changed files, and a production build or report any pre-existing blocker accurately.
- [ ] Review `git diff` and report only the files and evidence actually produced.
