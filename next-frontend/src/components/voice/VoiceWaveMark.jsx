'use client';

/**
 * Static Trailie Voice identity mark — white waveform bars.
 * Used in dock header, minimized pill, and immersive visual chrome.
 */
export default function VoiceWaveMark({ size = 'md', tone = 'dark', className = '' }) {
  return (
    <span
      className={`trailie-voice-wavemark trailie-voice-wavemark--${size} trailie-voice-wavemark--${tone} ${className}`.trim()}
      aria-hidden="true"
    >
      <i /><i /><i /><i /><i />
    </span>
  );
}
