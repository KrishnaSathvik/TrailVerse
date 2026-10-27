'use client';

import VoiceWaveform from './VoiceWaveform';
import VoiceThinkingDots from './VoiceThinkingDots';

/**
 * Shared dock/immersive activity visual.
 * visual: listen-wave | hear-wave | think-dots | speak-wave | muted | connecting | error | idle
 */
export default function VoiceActivityMark({
  visual = 'listen-wave',
  audioLevel = 0,
  size = 'md',
  className = '',
}) {
  if (visual === 'think-dots' || visual === 'connecting') {
    return <VoiceThinkingDots size={size === 'lg' ? 'lg' : 'md'} className={className} />;
  }

  const variant =
    visual === 'speak-wave'
      ? 'speak'
      : visual === 'muted' || visual === 'idle' || visual === 'error'
        ? 'muted'
        : 'listen';

  const bars = size === 'lg' ? 9 : size === 'sm' ? 5 : 7;
  // Hearing you: amplify level slightly for clearer motion; muted/idle stay flat.
  const level =
    visual === 'muted' || visual === 'idle' || visual === 'error'
      ? 0
      : visual === 'hear-wave'
        ? Math.max(audioLevel, 0.35)
        : audioLevel;

  return (
    <VoiceWaveform
      level={level}
      variant={variant}
      bars={bars}
      className={className}
    />
  );
}
