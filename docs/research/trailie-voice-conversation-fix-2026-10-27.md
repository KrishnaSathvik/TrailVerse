# Trailie Voice — Conversation UI Correction

**Date:** 2026-10-27  
**Status:** Local fix complete. **No commit / push / deploy.**

## Transcript root cause

Two bugs truncated or discarded spoken text:

1. **UI truncation (primary):** `shortCaption()` in `VoiceDock` / `VoiceImmersive` sliced assistant text to ~160–220 characters and appended `…`. CSS `-webkit-line-clamp: 3` also hid overflow.
2. **State wipe (secondary):** on `response.output_item.added` for function calls, the hook ran `setTranscript(prev => prev.filter(m => m.role === 'user'))`, deleting prior assistant turns whenever a park tool ran.

## Fixes

- Added `lib/voiceTranscript.js` reducer: accumulates deltas by `item_id`, finalizes on `.done`, keeps history on tool calls, marks cancelled streams incomplete.
- Wired reducer into `useRealtimeVoice` (audio + text transcript events, cancel/done).
- Removed `shortCaption` and line-clamp caption CSS.
- Shared `VoiceConversation` scroll log (stick-to-bottom unless user scrolled up).
- **Modes:** `closed` | `docked` | `immersive` only. Removed minimized pill / Minimize control.
- Dock header: Expand only. Immersive header: compact Return-to-dock icon.
- Immersive: conversation workspace (main transcript + compact side status), not a giant empty orb stage.

## Tests

| Suite | Result |
| --- | --- |
| `voiceTranscript` | 6 passed |
| `voiceStatusCopy` + `voiceRoutes` | 5 passed |
| Total | 11 passed |

Visual QA (mocked): `docs/research/voice-ui-qa-2026-10-27/v2-*.png`  
Checks: Minimize buttons = 0, Expand = 1, no `.trailie-voice-dock-caption` clamp class.

## Remaining (manual mic)

- Confirm Realtime event names against live `gpt-realtime-2.1` session.
- Confirm input transcription quality when enabled server-side.
- Interrupt/`response.cancelled` labeling under barge-in.
