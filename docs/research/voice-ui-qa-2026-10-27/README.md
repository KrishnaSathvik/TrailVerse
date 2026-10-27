# Trailie Voice UI — Visual QA (2026-10-27)

Mocked states via `/dev/voice-ui` (no paid OpenAI calls). Scroll-to-top floating button removed from the app.

## Screenshots

| File | Viewport | State |
| --- | --- | --- |
| `desktop-1440-launcher.png` | 1440×900 | Idle launcher |
| `desktop-1440-listening.png` | 1440×900 | Listening dock |
| `desktop-1440-speaking.png` | 1440×900 | Speaking dock |
| `desktop-1440-muted.png` | 1440×900 | Muted dock |
| `desktop-1440-minimized.png` | 1440×900 | Minimized pill |
| `desktop-1440-immersive.png` | 1440×900 | Immersive |
| `desktop-1440-auth.png` | 1440×900 | Signup gate |
| `desktop-1440-error.png` | 1440×900 | Permission / error |
| `mobile-390-*.png` | 390×844 | Key mobile states |
| `mobile-320-listening.png` / `auth` | 320×720 | Narrow mobile |
| `desktop-1440-explore-no-scrolltop.png` | 1440×900 | Explore scrolled — no scroll-top FAB |

## Visual review (static)

| Check | Result |
| --- | --- |
| Desktop dock hierarchy | Pass — Trailie + one status; Minimize/Expand in header; Mute/End only in footer |
| Signup gate | Pass — no Connected / Mute / End; Create account · Log in · Dismiss |
| Minimized pill | Pass — waveform + Listening + end |
| Immersive | Pass — black waveform stage, Back to dock, restrained caption, bottom Mute/End. QA scene pills overlay immersive during harness only (not product) |
| Mobile 390 / 320 dock | Pass — bottom sheet, handle, no overflow |
| Scroll-to-top FAB | Pass — `button[aria-label*="Scroll to top"]` count = 0 on scrolled `/explore` |
| Next.js `N` badge | Dev indicator only (bottom-left) — not Trailie UI |

## Still needs your live mic pass

Minimize/expand same WebRTC peer, mute/end track release, guest-limit disconnect, interruptions, and cross-route session policy.
