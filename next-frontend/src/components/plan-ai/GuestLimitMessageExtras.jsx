'use client';

import React from 'react';
import { Sparkles } from '@components/icons';
import Button from '@components/common/Button';

/** Primary CTA under Trailie's guest limit message */
export default function GuestLimitMessageExtras({ onSignup }) {
  return (
    <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
      <Button onClick={onSignup} variant="primary" size="sm" icon={Sparkles} className="w-full sm:w-auto">
        Sign in to continue
      </Button>
    </div>
  );
}
