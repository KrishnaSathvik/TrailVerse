/**
 * Stage 14.8A/B acceptance — browser-side SSE tee.
 *
 * Exported as a plain self-contained function so it can be BOTH:
 *   - serialized into the page by Playwright (`context.addInitScript(installSseTee)`)
 *   - imported and unit-tested directly, with no dynamic evaluation
 *
 * Stage 14.8B.1 §12: an earlier copy of this script was extracted from a
 * template literal and kept its `\n` escapes literal, so it split the buffer on
 * the two-character sequence backslash-n and parsed zero events while still
 * reporting a healthy `responses: 1, closed: true`. It must reference real
 * newline characters, and it must not close over anything outside itself.
 */
export function installSseTee() {
  window.__stage14Sse = { events: [], responses: 0, closed: false };

  const originalFetch = window.fetch;

  window.fetch = async function stage14TeedFetch(input, init) {
    const res = await originalFetch.call(this, input, init);
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream') || !res.body) return res;

    window.__stage14Sse.responses += 1;

    // Tee so the application's own consumption is completely unaffected.
    const [appStream, mirror] = res.body.tee();

    (async () => {
      const reader = mirror.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const drainFrame = (frame) => {
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue;
          try {
            const payload = JSON.parse(line.slice(5).trim());
            window.__stage14Sse.events.push({
              at: Date.now(),
              type: payload.type || 'unknown',
              stage: payload.stage || null,
              hasItinerary: payload.hasItinerary ?? null,
              messageCount: payload.messageCount ?? null,
              canSendMore: payload.canSendMore ?? null,
              remainingAllowance: payload.remainingAllowance ?? null,
            });
          } catch {
            // A partial or malformed frame is not evidence; later frames still parse.
          }
        }
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split('\n\n');
        buffer = frames.pop();
        for (const frame of frames) drainFrame(frame);
      }
      if (buffer.trim()) drainFrame(buffer);

      window.__stage14Sse.closed = true;
    })();

    return new Response(appStream, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  };
}

export default installSseTee;
