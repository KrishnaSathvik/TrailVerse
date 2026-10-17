const { setSseHeaders, writeSseEvent, attachClientDisconnectAbort } = require('../sseStream');

/** A minimal fake `http.ServerResponse` — just enough EventEmitter-shaped
 * surface (`on`/`off`) plus the one property (`writableEnded`) the helper
 * actually reads. `writableEnded` is a plain mutable field here so a test
 * can flip it exactly like a real response would at the moment it ends. */
function fakeRes({ writableEnded = false } = {}) {
  const listeners = {};
  return {
    writableEnded,
    on: (event, handler) => {
      listeners[event] = handler;
    },
    off: (event, handler) => {
      if (listeners[event] === handler) delete listeners[event];
    },
    // Test-only helper: fire 'close' the way Node actually would.
    __emitClose() {
      listeners.close?.();
    },
  };
}

describe('sseStream', () => {
  test('setSseHeaders sets anti-buffering SSE headers', () => {
    const headers = {};
    const res = {
      setHeader: (key, value) => {
        headers[key] = value;
      },
      flushHeaders: jest.fn(),
    };

    setSseHeaders(res);

    expect(headers['Content-Type']).toBe('text/event-stream');
    expect(headers['Cache-Control']).toBe('no-cache, no-transform');
    expect(headers['X-Accel-Buffering']).toBe('no');
    expect(res.flushHeaders).toHaveBeenCalled();
  });

  test('writeSseEvent writes SSE payload and flushes', () => {
    const writes = [];
    const res = {
      write: (chunk) => writes.push(chunk),
      flush: jest.fn(),
    };

    writeSseEvent(res, { type: 'thinking', sources: ['nps'] });

    expect(writes[0]).toContain('"type":"thinking"');
    expect(res.flush).toHaveBeenCalled();
  });

  describe('attachClientDisconnectAbort — Phase 6B.2', () => {
    /**
     * Phase 6B.1 proved the previous `req.on('close')`-based implementation
     * did not detect real client disconnects in this app/runtime: an
     * isolated harness and the real running server behaved differently from
     * each other, but in neither case did the old listener reliably track
     * whether the client actually left. This suite pins the corrected,
     * response-lifetime-based replacement instead.
     */

    test('normal completion never aborts: res "close" firing with writableEnded=true is a no-op', () => {
      const req = {};
      const res = fakeRes({ writableEnded: false });
      const { signal, cleanup } = attachClientDisconnectAbort(req, res);
      expect(signal.aborted).toBe(false);

      // The response finishes normally FIRST...
      res.writableEnded = true;
      // ...then 'close' fires, exactly like a real completed response.
      res.__emitClose();

      expect(signal.aborted).toBe(false);
      cleanup();
    });

    test('premature disconnect aborts exactly once: res "close" firing with writableEnded=false', () => {
      const req = {};
      const res = fakeRes({ writableEnded: false });
      const { signal, cleanup } = attachClientDisconnectAbort(req, res);
      expect(signal.aborted).toBe(false);

      let abortEvents = 0;
      signal.addEventListener('abort', () => { abortEvents += 1; });

      // The response never finished — the client left first.
      res.__emitClose();

      expect(signal.aborted).toBe(true);
      expect(abortEvents).toBe(1);

      // A duplicate 'close' (defensive — Node fires it once, but the
      // handler's own guard must still be safe against a second call).
      res.__emitClose();
      expect(abortEvents).toBe(1);

      cleanup();
    });

    test('cleanup() removes the listener — a close AFTER cleanup never aborts', () => {
      const req = {};
      const res = fakeRes({ writableEnded: false });
      const { signal, cleanup } = attachClientDisconnectAbort(req, res);

      cleanup();
      res.__emitClose();

      expect(signal.aborted).toBe(false);
    });

    test('an existing controller is reused (and aborted) rather than a fresh one minted', () => {
      const req = {};
      const res = fakeRes({ writableEnded: false });
      const existingController = new AbortController();

      const { signal, cleanup } = attachClientDisconnectAbort(req, res, existingController);
      expect(signal).toBe(existingController.signal);

      res.__emitClose();
      expect(existingController.signal.aborted).toBe(true);
      cleanup();
    });

    test('an existing controller already provided (e.g. its own deadline timer fired) is respected, not overwritten', () => {
      const req = {};
      const res = fakeRes({ writableEnded: false });
      const existingController = new AbortController();
      existingController.abort(); // some OTHER reason already aborted it

      const { signal, cleanup } = attachClientDisconnectAbort(req, res, existingController);
      expect(signal.aborted).toBe(true);
      cleanup();
    });
  });
});
