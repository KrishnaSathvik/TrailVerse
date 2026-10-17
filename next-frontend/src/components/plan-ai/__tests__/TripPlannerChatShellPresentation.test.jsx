import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCE = fs.readFileSync(path.resolve(__dirname, '../TripPlannerChat.jsx'), 'utf8');

describe('TripPlannerChat — Phase 7B shell presentation', () => {
  it('renders sync-needed explanation as visible text instead of title-only help', () => {
    expect(SOURCE).toMatch(/chatStatus\.tone === 'sync-needed'[\s\S]{0,1800}chatStatus\.description/);
    expect(SOURCE).toMatch(/chatStatus\.tone === 'sync-needed' \? chatStatus\.description : chatStatus\.label/);
  });

  it('keeps sync-needed readable on phones instead of hiding it below sm', () => {
    expect(SOURCE).not.toMatch(/hidden items-center gap-2 text-\[11px\] font-medium sm:inline-flex/);
    expect(SOURCE).toMatch(/data-testid=\{chatStatus\.tone === 'sync-needed' \? 'sync-needed-status'/);
    expect(SOURCE).toMatch(/inline-flex min-w-0 max-w-full items-center text-\[11px\]/);
  });

  it('wraps composer utilities instead of using a horizontal overflow strip', () => {
    expect(SOURCE).toMatch(/trailie-composer-utilities mb-1\.5 flex flex-wrap items-center/);
    expect(SOURCE).not.toMatch(/trailie-composer-utilities[^"]*overflow-x-auto/);
  });

  it('shows one guest continuation card, only once the allowance is spent', () => {
    expect(SOURCE.match(/<GuestAccountCard\b/g)).toHaveLength(1);
    expect(SOURCE).toMatch(/isAnonymous && !isGenerating &&\s*\(!canSendMore \|\| messages\.some\(message => message\.isConversionMessage\)\) && \(\s*<GuestAccountCard/);
    // Before the limit the allowance is a quiet line by the composer, not a card.
    expect(SOURCE).toMatch(/free \{anonymousMessagesRemaining === 1 \? 'message' : 'messages'\} remaining/);
  });

  it('marks welcome and conversion messages with visual-only variants', () => {
    expect(SOURCE).toMatch(/variant=\{[\s\S]{0,350}message\.isConversionMessage[\s\S]{0,350}'opening'/);
  });

  it('keeps UI-only welcome chrome out of an active conversation', () => {
    expect(SOURCE).toMatch(/message\.messageKind === MESSAGE_KIND\.UI_WELCOME && !isWelcomeState/);
  });
});
