'use client';

import { useMemo, useState } from 'react';
import { VoiceSessionContext } from '@/context/VoiceSessionContext';
import VoiceDock from '@/components/voice/VoiceDock';
import VoiceImmersive from '@/components/voice/VoiceImmersive';
import VoiceButton from '@/components/voice/VoiceButton';

/**
 * Local visual QA harness — no OpenAI calls.
 * Visit /dev/voice-ui and switch states to review dock / immersive / auth.
 */
const LONG_REPLY = [
  'Gateway Arch National Park is a convenient option if you are near St. Louis.',
  'You can visit the museum beneath the Arch, walk the riverfront, and ride to the top when tickets are available.',
  'If you want more nature-focused time, I can also compare nearby options like Mark Twain National Forest day trips or a longer drive toward Ozark landscapes.',
  'Tell me your dates, how far you will drive, and whether you prefer city sightseeing or quieter trails.',
].join(' ');

const SCENES = [
  { id: 'launcher', label: 'Idle launcher' },
  { id: 'listening', label: 'Listening' },
  { id: 'hearing', label: 'Hearing you' },
  { id: 'thinking', label: 'Thinking' },
  { id: 'checking', label: 'Checking park' },
  { id: 'speaking', label: 'Speaking' },
  { id: 'muted', label: 'Muted' },
  { id: 'immersive', label: 'Immersive' },
  { id: 'history', label: 'Long conversation' },
  { id: 'auth', label: 'Signup gate' },
  { id: 'error', label: 'Permission / error' },
];

function buildScene(scene, setScene) {
  const noop = () => {};
  const base = {
    transcript: [],
    isTrailieSpeaking: false,
    isToolCalling: false,
    toolName: null,
    toolArgs: null,
    toolStartedAt: null,
    toolCallInfo: null,
    responsePending: false,
    thinkingStartedAt: null,
    error: null,
    authRequired: false,
    permissionDenied: false,
    userMuted: false,
    bargeInEnabled: false,
    audioLevel: 0.35,
    micActive: true,
    setMuted: noop,
    toggleMute: noop,
    hidden: false,
    parkCode: 'yose',
    pagePath: '/parks/yosemite-national-park',
    startSession: noop,
    endCall: () => setScene('launcher'),
    retry: noop,
    expand: () => setScene('immersive'),
    dock: () => setScene('listening'),
    setUiMode: noop,
  };

  switch (scene) {
    case 'launcher':
      return { ...base, status: 'idle', uiMode: 'closed', micActive: false, audioLevel: 0 };
    case 'listening':
      return {
        ...base,
        status: 'connected',
        uiMode: 'docked',
        audioLevel: 0.12,
        transcript: [
          { id: 'u1', role: 'user', text: 'What national park would you recommend near me?' },
          { id: 'a1', role: 'assistant', text: LONG_REPLY },
        ],
      };
    case 'hearing':
      return {
        ...base,
        status: 'listening',
        uiMode: 'docked',
        audioLevel: 0.65,
        transcript: [
          { id: 'u1', role: 'user', text: 'What national park would you recommend near me?' },
          { id: 'a1', role: 'assistant', text: LONG_REPLY },
        ],
      };
    case 'thinking':
      return {
        ...base,
        status: 'connected',
        uiMode: 'docked',
        responsePending: true,
        thinkingStartedAt: Date.now() - 800,
        audioLevel: 0,
        transcript: [
          { id: 'u1', role: 'user', text: 'What national park would you recommend near me?' },
          { id: 'a1', role: 'assistant', text: LONG_REPLY },
        ],
      };
    case 'checking':
      return {
        ...base,
        status: 'connected',
        uiMode: 'docked',
        isToolCalling: true,
        toolName: 'get_park_details',
        toolArgs: { park_code: 'zion' },
        toolStartedAt: Date.now() - 1200,
        toolCallInfo: 'get_park_details',
        responsePending: true,
        thinkingStartedAt: Date.now() - 2000,
        audioLevel: 0,
        transcript: [
          { id: 'u1', role: 'user', text: 'How is the weather at Zion?' },
          { id: 'a1', role: 'assistant', text: LONG_REPLY },
        ],
      };
    case 'speaking':
      return {
        ...base,
        status: 'speaking',
        uiMode: 'docked',
        isTrailieSpeaking: true,
        audioLevel: 0.7,
        transcript: [
          { id: 'u1', role: 'user', text: 'What should I not miss in Yosemite?' },
          {
            id: 'a1',
            role: 'assistant',
            text: 'Yosemite Valley is best early. Start at Tunnel View, then Glacier Point if roads are open.',
            streaming: true,
          },
        ],
      };
    case 'muted':
      return {
        ...base,
        status: 'connected',
        uiMode: 'docked',
        userMuted: true,
        micActive: false,
        audioLevel: 0,
        transcript: [
          { id: 'a1', role: 'assistant', text: LONG_REPLY },
        ],
      };
    case 'immersive':
      return {
        ...base,
        status: 'listening',
        uiMode: 'immersive',
        audioLevel: 0.4,
        transcript: [
          { id: 'u1', role: 'user', text: 'What national park would you recommend near me?' },
          { id: 'a1', role: 'assistant', text: LONG_REPLY },
          { id: 'u2', role: 'user', text: 'What about something with hiking trails?' },
        ],
      };
    case 'history': {
      const turns = [];
      for (let i = 1; i <= 10; i += 1) {
        turns.push({ id: `u${i}`, role: 'user', text: `Question ${i}: park tip?` });
        turns.push({
          id: `a${i}`,
          role: 'assistant',
          text: `Answer ${i}. ${LONG_REPLY}`,
        });
      }
      return {
        ...base,
        status: 'listening',
        uiMode: 'immersive',
        audioLevel: 0.45,
        transcript: turns,
      };
    }
    case 'auth':
      return {
        ...base,
        status: 'error',
        uiMode: 'docked',
        authRequired: true,
        micActive: false,
        audioLevel: 0,
        error: 'Sign up to continue using Trailie Voice.',
      };
    case 'error':
      return {
        ...base,
        status: 'error',
        uiMode: 'docked',
        permissionDenied: true,
        micActive: false,
        audioLevel: 0,
        error: 'Microphone permission was denied. Enable it in browser settings, then retry.',
      };
    default:
      return { ...base, status: 'idle', uiMode: 'closed' };
  }
}

export default function VoiceUiQaPage() {
  const [scene, setScene] = useState('listening');
  const value = useMemo(() => buildScene(scene, setScene), [scene]);

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
      <div className="mx-auto max-w-5xl px-4 py-8">
        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text-tertiary)' }}>
          Local QA · no paid voice calls
        </p>
        <h1
          className="mt-2 text-3xl font-bold"
          style={{ fontFamily: 'var(--font-display)', letterSpacing: '-0.03em' }}
        >
          Trailie Voice UI
        </h1>
        <p className="mt-2 max-w-2xl text-sm" style={{ color: 'var(--text-secondary)' }}>
          Mocked session states for visual review. Dock and immersive share one conversation transcript;
          live status stays independent of message history.
        </p>

        <div
          className="sticky top-0 z-[70] mt-6 flex flex-wrap gap-2 py-3"
          data-testid="voice-ui-scenes"
          style={{ background: 'color-mix(in srgb, var(--bg-primary) 92%, transparent)', backdropFilter: 'blur(8px)' }}
        >
          {SCENES.map((s) => (
            <button
              key={s.id}
              type="button"
              data-scene={s.id}
              onClick={() => setScene(s.id)}
              className="rounded-full px-3 py-2 text-sm font-semibold"
              style={{
                background: scene === s.id ? '#121516' : 'var(--surface)',
                color: scene === s.id ? '#fff' : 'var(--text-primary)',
                border: '1px solid var(--border)',
              }}
            >
              {s.label}
            </button>
          ))}
        </div>

        <div
          className="relative mt-10 overflow-hidden rounded-2xl border"
          style={{
            borderColor: 'var(--border)',
            minHeight: '70vh',
            background:
              'linear-gradient(180deg, color-mix(in srgb, var(--accent-green) 8%, var(--bg-primary)), var(--bg-primary))',
          }}
          data-testid="voice-ui-stage"
          data-active-scene={scene}
        >
          <div className="p-8 sm:p-12">
            <p className="text-sm font-medium" style={{ color: 'var(--text-tertiary)' }}>
              Discover the outdoors
            </p>
            <h2
              className="mt-2 max-w-lg text-4xl font-bold leading-tight"
              style={{ fontFamily: 'var(--font-display)' }}
            >
              Explore America&apos;s Parks
            </h2>
            <p className="mt-3 max-w-md text-sm" style={{ color: 'var(--text-secondary)' }}>
              Page content stays usable under the dock. This stage is only for layout QA.
            </p>
          </div>

          <VoiceSessionContext.Provider value={value}>
            {value.uiMode === 'closed' && <VoiceButton />}
            {value.uiMode === 'docked' && <VoiceDock />}
            {value.uiMode === 'immersive' && <VoiceImmersive />}
          </VoiceSessionContext.Provider>
        </div>
      </div>
    </div>
  );
}
