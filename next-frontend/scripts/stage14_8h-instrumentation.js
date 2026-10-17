/**
 * Stage 14.8H — browser-side instrumentation, installed before any app code.
 *
 * Exported as a self-contained function so Playwright can serialize it into the
 * page (`addInitScript`) and so it can be read/tested directly. It must not
 * close over anything outside itself.
 *
 * ONE CLOCK (§22). Every timestamp here is `performance.now()` from the same
 * document, so SSE arrival, persistence acceptance and DOM reveal are directly
 * comparable. `timeOrigin` is recorded once for wall-clock correlation.
 *
 * Four things are captured:
 *   1. SSE events received by the BROWSER (teed, never intercepted)
 *   2. persistence writes — both fetch and XHR, because axios uses XHR in the
 *      browser and a fetch-only tee would have missed every trip write
 *   3. itinerary card mount/unmount, via MutationObserver on the card's stable
 *      `aria-label`, which is what makes a remount observable
 *   4. reveal timestamps for the itinerary and for the prose
 *
 * Nothing sensitive is retained: no Authorization header, no token, no password.
 * Persistence bodies are reduced to bounded identity/lifecycle fields.
 */
export function installStage14HInstrumentation() {
  const H = {
    timeOrigin: performance.timeOrigin,
    sse: { events: [], responses: 0, closed: false },
    writes: [],
    itineraryCard: { mounts: 0, unmounts: 0, firstMountAtMs: null, lastUnmountAtMs: null },
    reveal: {
      itineraryVisibleAtMs: null,
      itineraryDayCountAtReveal: null,
      proseVisibleAtMs: null,
      proseLengthAtReveal: null,
    },
    polls: [],
    sendPressedAtMs: null,
  };
  window.__stage14H = H;

  const nowMs = () => performance.now();
  const ITINERARY_SELECTOR = 'section[aria-label="Trip itinerary"]';

  // ── 1. SSE tee ──────────────────────────────────────────────────────────────
  const originalFetch = window.fetch;

  /** Bounded projection of an SSE payload — shape and identity, never prose. */
  const recordSseEvent = (payload) => {
    H.sse.events.push({
      atMs: nowMs(),
      type: payload.type || 'unknown',
      stage: payload.stage || null,
      responseId: payload.responseId ?? payload.response?.responseId ?? null,
      responseVersion: payload.responseVersion ?? payload.response?.responseVersion ?? null,
      responseRevision: payload.responseRevision ?? payload.response?.responseRevision ?? null,
      lifecycleStatus: payload.lifecycleStatus ?? payload.response?.lifecycleStatus ?? null,
      itineraryHash: payload.itineraryHash ?? payload.response?.itineraryHash ?? null,
      hasItinerary: payload.hasItinerary ?? null,
      dayCount: Array.isArray(payload.canonicalPlan?.days)
        ? payload.canonicalPlan.days.length
        : (Array.isArray(payload.itineraryData?.days) ? payload.itineraryData.days.length : null),
      chunkLength: typeof payload.content === 'string' ? payload.content.length : null,
    });
  };

  /** Bounded projection of a trip persistence body. */
  const describeWriteBody = (raw) => {
    let body = null;
    try { body = typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
    if (!body || typeof body !== 'object') return null;

    const conversation = Array.isArray(body.conversation) ? body.conversation : [];
    const assistant = conversation.filter((m) => m && m.role === 'assistant');
    const last = assistant[assistant.length - 1] || null;
    const plan = body.plan || null;

    return {
      hasConversation: conversation.length > 0,
      conversationLength: conversation.length,
      roleSequence: conversation.map((m) => m && m.role),
      userTurns: conversation.filter((m) => m && m.role === 'user').length,
      assistantTurns: assistant.length,
      assistantMessage: last
        ? {
          id: last.id ?? null,
          idType: typeof last.id,
          timestamp: last.timestamp ?? null,
          responseId: last.responseId ?? null,
          responseVersion: last.responseVersion ?? null,
          responseRevision: last.responseRevision ?? null,
          lifecycleStatus: last.lifecycleStatus ?? null,
          itineraryHash: last.itineraryHash ?? null,
          contentLength: typeof last.content === 'string' ? last.content.length : null,
          hasItineraryPlan: Boolean(last.itineraryPlan),
        }
        : null,
      plan: plan
        ? {
          parkName: plan.parkName ?? null,
          parkCode: plan.parkCode ?? null,
          dayCount: Array.isArray(plan.days) ? plan.days.length : null,
          itineraryHash: plan.itineraryHash ?? null,
          lifecycleStatus: plan.lifecycleStatus ?? null,
          responseRevision: plan.responseRevision ?? null,
        }
        : null,
      parkCode: body.parkCode ?? null,
      parkName: body.parkName ?? null,
    };
  };

  const isTripWrite = (url, method) =>
    /\/api\/trips(\/|$)/.test(url) && ['POST', 'PUT', 'PATCH'].includes(method);

  window.fetch = async function stage14HTeedFetch(input, init) {
    const url = typeof input === 'string' ? input : (input && input.url) || String(input);
    const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();

    let record = null;
    if (isTripWrite(url, method)) {
      record = {
        transport: 'fetch',
        method,
        url: url.replace(/^https?:\/\/[^/]+/, ''),
        startedAtMs: nowMs(),
        acceptedAtMs: null,
        status: null,
        body: describeWriteBody(init && init.body),
        responseTripId: null,
      };
      H.writes.push(record);
    }

    const res = await originalFetch.call(this, input, init);

    if (record) {
      record.acceptedAtMs = nowMs();
      record.status = res.status;
      try {
        const clone = res.clone();
        const parsed = await clone.json();
        record.responseTripId = parsed?.data?._id || parsed?.data?.id || null;
      } catch { /* non-JSON response leaves the id null */ }
    }

    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('text/event-stream') || !res.body) return res;

    H.sse.responses += 1;
    const [appStream, mirror] = res.body.tee();

    (async () => {
      const reader = mirror.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      const drainFrame = (frame) => {
        for (const line of frame.split('\n')) {
          if (!line.startsWith('data:')) continue;
          try { recordSseEvent(JSON.parse(line.slice(5).trim())); } catch { /* partial frame */ }
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
      if (buffer) drainFrame(buffer);
      H.sse.closed = true;
    })();

    return new Response(appStream, {
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
    });
  };

  // ── 2. XHR tee — axios uses XHR in the browser ──────────────────────────────
  const OriginalXHR = window.XMLHttpRequest;

  window.XMLHttpRequest = function Stage14HXHR() {
    const xhr = new OriginalXHR();
    let method = 'GET';
    let url = '';
    let record = null;

    const originalOpen = xhr.open;
    xhr.open = function open(m, u, ...rest) {
      method = String(m || 'GET').toUpperCase();
      url = String(u || '');
      return originalOpen.call(this, m, u, ...rest);
    };

    const originalSend = xhr.send;
    xhr.send = function send(body) {
      if (isTripWrite(url, method)) {
        record = {
          transport: 'xhr',
          method,
          url: url.replace(/^https?:\/\/[^/]+/, ''),
          startedAtMs: nowMs(),
          acceptedAtMs: null,
          status: null,
          body: describeWriteBody(body),
          responseTripId: null,
        };
        H.writes.push(record);

        xhr.addEventListener('loadend', () => {
          record.acceptedAtMs = nowMs();
          record.status = xhr.status;
          try {
            const parsed = JSON.parse(xhr.responseText);
            record.responseTripId = parsed?.data?._id || parsed?.data?.id || null;
          } catch { /* non-JSON response leaves the id null */ }
        });
      }
      return originalSend.call(this, body);
    };

    return xhr;
  };
  window.XMLHttpRequest.prototype = OriginalXHR.prototype;

  // ── 3. Itinerary card mount / unmount ──────────────────────────────────────
  const observer = new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.nodeType !== 1) continue;
        const found = node.matches?.(ITINERARY_SELECTOR)
          ? [node]
          : Array.from(node.querySelectorAll?.(ITINERARY_SELECTOR) || []);
        if (found.length) {
          H.itineraryCard.mounts += found.length;
          if (H.itineraryCard.firstMountAtMs == null) H.itineraryCard.firstMountAtMs = nowMs();
        }
      }
      for (const node of record.removedNodes) {
        if (node.nodeType !== 1) continue;
        const found = node.matches?.(ITINERARY_SELECTOR)
          ? [node]
          : Array.from(node.querySelectorAll?.(ITINERARY_SELECTOR) || []);
        if (found.length) {
          H.itineraryCard.unmounts += found.length;
          H.itineraryCard.lastUnmountAtMs = nowMs();
        }
      }
    }
  });

  const startObserving = () => {
    if (document.body) observer.observe(document.body, { childList: true, subtree: true });
    else setTimeout(startObserving, 50);
  };
  startObserving();

  // ── 4. Reveal polling ──────────────────────────────────────────────────────
  /**
   * Prose is detected as substantial paragraph text OUTSIDE the itinerary card.
   * Revision 1 stores an empty-content assistant shell, so before prose arrives
   * there is no such paragraph; this is what makes the two reveals separable.
   */
  const measureProse = () => {
    const cards = Array.from(document.querySelectorAll(ITINERARY_SELECTOR));
    const inCard = (node) => cards.some((card) => card.contains(node));
    let longest = 0;
    let total = 0;
    // Stage 14.8I — a COUNT as well as a size. On a follow-up turn the previous
    // response's prose is already on screen, so "prose exists" cannot detect the
    // new reveal; the count crossing its pre-send baseline can.
    let longParagraphCount = 0;
    for (const p of document.querySelectorAll('p, li')) {
      if (inCard(p)) continue;
      const text = (p.innerText || '').trim();
      if (text.length < 40) continue;
      total += text.length;
      if (text.length >= 200) longParagraphCount += 1;
      if (text.length > longest) longest = text.length;
    }
    return { longestParagraph: longest, totalProseText: total, longParagraphCount };
  };

  const poll = () => {
    const cards = document.querySelectorAll(ITINERARY_SELECTOR);
    const card = cards[0] || null;
    const dayLabel = card ? (card.innerText.match(/(\d+)\s+days?/) || [])[1] : null;
    const dayCount = dayLabel ? Number(dayLabel) : null;
    const prose = measureProse();
    const spinner = Boolean(document.querySelector('[class*="animate-spin"], [role="progressbar"]'));

    if (cards.length > 0 && H.reveal.itineraryVisibleAtMs == null) {
      H.reveal.itineraryVisibleAtMs = nowMs();
      H.reveal.itineraryDayCountAtReveal = dayCount;
    }
    // A single long paragraph is the terminal prose; the threshold keeps short
    // status/pending labels from counting as a reveal.
    if (prose.longestParagraph >= 200 && H.reveal.proseVisibleAtMs == null) {
      H.reveal.proseVisibleAtMs = nowMs();
      H.reveal.proseLengthAtReveal = prose.totalProseText;
    }

    H.polls.push({
      atMs: nowMs(),
      itineraryCards: cards.length,
      dayCount,
      longestParagraph: prose.longestParagraph,
      totalProseText: prose.totalProseText,
      longParagraphCount: prose.longParagraphCount,
      spinner,
    });
    if (H.polls.length > 4000) H.polls.shift();
  };

  setInterval(poll, 100);

  /**
   * Stage 14.8I — the pre-send baseline. A follow-up turn starts with the prior
   * response already rendered, so every reveal assertion is a DELTA against what
   * was on screen when Send was pressed.
   */
  window.__stage14HMarkSend = () => {
    const cards = document.querySelectorAll(ITINERARY_SELECTOR).length;
    const prose = measureProse();
    H.sendPressedAtMs = nowMs();
    H.baselineAtSend = {
      itineraryCards: cards,
      longParagraphCount: prose.longParagraphCount,
      totalProseText: prose.totalProseText,
    };
    return H.sendPressedAtMs;
  };

  /** First poll after Send where the card count exceeded the baseline. */
  window.__stage14HRevealDeltas = () => {
    const base = H.baselineAtSend;
    if (!base || H.sendPressedAtMs == null) return null;
    const after = H.polls.filter((p) => p.atMs >= H.sendPressedAtMs);
    const newCard = after.find((p) => p.itineraryCards > base.itineraryCards) || null;
    const newProse = after.find((p) => p.longParagraphCount > base.longParagraphCount) || null;
    return {
      baseline: base,
      itinerary2VisibleAtMs: newCard ? newCard.atMs : null,
      itinerary2CardCountAtReveal: newCard ? newCard.itineraryCards : null,
      itinerary2DayCountAtReveal: newCard ? newCard.dayCount : null,
      prose2VisibleAtMs: newProse ? newProse.atMs : null,
      prose2LongParagraphCountAtReveal: newProse ? newProse.longParagraphCount : null,
    };
  };
}
