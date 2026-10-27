'use client';

import { useMemo, useState } from 'react';
import { VoiceSessionContext } from '@/context/VoiceSessionContext';
import VoiceDock from '@/components/voice/VoiceDock';
import VoiceImmersive from '@/components/voice/VoiceImmersive';
import VoiceMinimizedPill from '@/components/voice/VoiceMinimizedPill';
import VoiceButton from '@/components/voice/VoiceButton';

/**
 * Local visual QA harness — no OpenAI calls.
 * Visit /dev/voice-ui and switch states to review dock / immersive / mini / auth.
 */
const SCENES = [
  { id: 'launcher', label: 'Idle launcher' },
  { id: 'listening', label: 'Listening dock' },
  { id: 'speaking', label: 'Speaking dock' },
  { id: 'muted', label: 'Muted dock' },
  { id: 'minimized', label: 'Minimized' },
  { id: 'immersive', label: 'Immersive' },
  { id: 'auth', label: 'Signup gate' },
  { id: 'error', label: 'Permission / error' },
];

function buildScene(scene, setScene) {
  const noop = () => {};
  const base = {
    transcript: [],
    isTrailieSpeaking: false,
    isToolCalling: false,
    toolCallInfo: null,
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
    minimize: () => setScene('minimized'),
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
        transcript: [],
      };
    case 'speaking':
      return {
        ...base,
        status: 'speaking',
        uiMode: 'docked',
        isTrailieSpeaking: true,
        audioLevel: 0.7,
        transcript: [
          {
            role: 'assistant',
            text: 'Yosemite Valley is best early. Start at Tunnel View, then Glacier Point if roads are open.',
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
      };
    case 'minimized':
      return {
        ...base,
        status: 'connected',
        uiMode: 'minimized',
        audioLevel: 0.4,
      };
    case 'immersive':
      return {
        ...base,
        status: 'speaking',
        uiMode: 'immersive',
        isTrailieSpeaking: true,
        audioLevel: 0.65,
        transcript: [
          {
            role: 'assistant',
            text: 'For a first visit, give yourself a full day in the valley and keep Half Dome for another trip unless you already have permits.',
          },
        ],
      };
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
          Mocked session states for visual review. Switch scenes below; the live components render in the
          corner exactly as they do in product.
        </p>

        <div
          className="sticky top-0 z-[100] mt-6 flex flex-wrap gap-2 py-3"
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
            {value.uiMode === 'minimized' && <VoiceMinimizedPill />}
            {value.uiMode === 'immersive' && <VoiceImmersive />}
          </VoiceSessionContext.Provider>
        </div>
      </div>
    </div>
  );
}
