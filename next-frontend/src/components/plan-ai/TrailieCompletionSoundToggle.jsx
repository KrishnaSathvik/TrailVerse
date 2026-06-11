'use client';

import { Volume2, VolumeOff } from '@components/icons';

export default function TrailieCompletionSoundToggle({
  enabled,
  onToggle,
  offBackground = 'var(--button-filled-bg)',
  ariaLabelOn = 'Sounds on — plays a chime when Trailie finishes replying',
  ariaLabelOff = 'Sounds off — enable to hear a chime when Trailie finishes replying',
  titleOn = 'Sounds on',
  titleOff = 'Sounds off — reply-complete chime',
}) {
  const Icon = enabled ? Volume2 : VolumeOff;

  return (
    <button
      type="button"
      onClick={onToggle}
      className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition"
      style={{
        backgroundColor: enabled ? 'var(--accent-green)' : offBackground,
        borderWidth: '1px',
        borderColor: enabled ? 'var(--accent-green)' : 'var(--border)',
        color: enabled ? '#fff' : 'var(--text-secondary)',
        boxShadow: enabled ? undefined : 'var(--shadow)',
      }}
      aria-pressed={enabled}
      aria-label={enabled ? ariaLabelOn : ariaLabelOff}
      title={enabled ? titleOn : titleOff}
    >
      <Icon className="h-4 w-4" aria-hidden />
    </button>
  );
}
