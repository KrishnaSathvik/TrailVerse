const { setSseHeaders, writeSseEvent, attachClientDisconnectAbort } = require('../sseStream');

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

  test('attachClientDisconnectAbort aborts when request closes', () => {
    const listeners = {};
    const req = {
      on: (event, handler) => {
        listeners[event] = handler;
      },
      off: (event, handler) => {
        if (listeners[event] === handler) delete listeners[event];
      },
    };

    const { signal, cleanup } = attachClientDisconnectAbort(req);
    expect(signal.aborted).toBe(false);

    listeners.close();
    expect(signal.aborted).toBe(true);

    cleanup();
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
});
