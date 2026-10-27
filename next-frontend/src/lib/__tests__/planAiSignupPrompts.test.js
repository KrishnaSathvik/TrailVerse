import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { SIGNUP_PROMPT_REASONS, getSignupPrompt } from '@/lib/planAiSignupPrompts';
import { GUIDES } from '@/data/guides';

// Signed-in Trailie has no daily token cap, but it is still bounded by request
// rate limits and per-request guards, so signup copy must not promise
// "unlimited" use or the absence of any cap.
const ABSOLUTE_CLAIM = /unlimited|no (message )?(cap|limit)|without (message )?limits?|limitless/i;

function promptText(prompt) {
  return [prompt.badge, prompt.title, prompt.subtitle, prompt.inlineTitle, prompt.inlineSubtitle,
    prompt.primaryCta, prompt.secondaryCta, prompt.loginCta, prompt.inlineCta, ...(prompt.benefits || [])]
    .filter(Boolean).join('\n');
}

describe('plan-ai signup prompt copy', () => {
  it.each(Object.values(SIGNUP_PROMPT_REASONS))('%s makes no "unlimited" claim', (reason) => {
    const prompt = getSignupPrompt(reason, { parkName: 'Zion' });
    expect(promptText(prompt)).not.toMatch(ABSOLUTE_CLAIM);
  });

  it('module source carries no absolute usage claim', () => {
    const source = fs.readFileSync(path.resolve(__dirname, '../planAiSignupPrompts.js'), 'utf8');
    expect(source).not.toMatch(ABSOLUTE_CLAIM);
  });

  it('message-limit gate still names the 5 free guest messages and a natural benefit', () => {
    const prompt = getSignupPrompt(SIGNUP_PROMPT_REASONS.MESSAGE_LIMIT);
    expect(prompt.title).toMatch(/5 Free Messages/);
    expect(prompt.benefits.join('\n')).toMatch(/Keep chatting with Trailie/);
  });

  it('planning guides do not promise unlimited Trailie planning', () => {
    expect(JSON.stringify(GUIDES)).not.toMatch(/unlimited (saved )?planning|unlimited trailie/i);
  });
});
