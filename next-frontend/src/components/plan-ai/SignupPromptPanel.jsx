'use client';

import React from 'react';
import { Mountain, Check, Sparkles, LogIn } from '@components/icons';
import Button from '@components/common/Button';
import { getSignupPrompt } from '@/lib/planAiSignupPrompts';

/**
 * Full signup pitch card — message limit, early gate, in-chat conversion.
 */
export default function SignupPromptPanel({
  reason,
  parkName,
  onSignup,
  onLogin,
  timeUntilReset = null,
  headingLevel = 'h2',
  className = '',
}) {
  const prompt = getSignupPrompt(reason, { parkName });
  const Heading = headingLevel;
  const headingClass =
    headingLevel === 'h3'
      ? 'text-base font-bold'
      : 'text-lg font-bold';

  return (
    <div
      className={`rounded-2xl overflow-hidden ${className}`}
      style={{
        backgroundColor: 'var(--surface)',
        border: '1px solid var(--border)',
        boxShadow: '0 25px 50px rgba(0, 0, 0, 0.12)',
      }}
    >
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-2 mb-2">
          <Mountain className="h-5 w-5" style={{ color: 'var(--accent-green)' }} />
          <Heading className={headingClass} style={{ color: 'var(--text-primary)' }}>
            {prompt.title}
          </Heading>
        </div>
        <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
          {prompt.subtitle}
        </p>
        <ul className="space-y-1.5 mb-4">
          {prompt.benefits.map((prop) => (
            <li key={prop} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-secondary)' }}>
              <Check className="h-3.5 w-3.5 flex-shrink-0" style={{ color: 'var(--accent-green)' }} />
              {prop}
            </li>
          ))}
        </ul>
      </div>

      <div className="h-px" style={{ backgroundColor: 'var(--border)' }} />

      <div className="px-6 py-4 space-y-3">
        <Button onClick={onSignup} variant="primary" size="md" icon={Sparkles} className="w-full">
          {prompt.primaryCta}
        </Button>
        <Button onClick={onLogin} variant="secondary" size="md" icon={LogIn} className="w-full">
          {prompt.secondaryCta}
        </Button>

        {timeUntilReset && (
          <div className="pt-1">
            <div
              className="px-4 py-3 rounded-xl text-center"
              style={{
                backgroundColor: 'var(--surface-hover)',
                border: '1px solid var(--border)',
              }}
            >
              <p className="text-xs font-medium mb-1" style={{ color: 'var(--text-tertiary)' }}>
                Or wait for free reset:
              </p>
              <p className="text-xl font-bold" style={{ color: 'var(--accent-green)' }}>
                {timeUntilReset}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
