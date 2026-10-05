/**
 * Shared helpers for Plan AI SSE streaming routes.
 */

function setSseHeaders(res) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
}

function writeSseEvent(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
  if (typeof res.flush === 'function') res.flush();
}

/**
 * Abort upstream LLM work when the client disconnects before the response
 * completes.
 *
 * Built on the RESPONSE, not the request. The previous implementation
 * listened for `req.on('close')`; verified end-to-end against this actual
 * app/runtime (an isolated harness AND the real running server, both with a
 * genuine, process-killed client disconnect), that listener did not detect
 * real client disconnects here — it did not fire on a verified kill, so
 * upstream work was never actually cancelled by it. `res.on('close')` was
 * verified correct in the same tests: it fires exactly once, exactly when
 * the connection genuinely ends, for both outcomes. `res.writableEnded` is
 * what tells those two outcomes apart — true only when the response itself
 * already finished normally, false when the client left before it did — so
 * a normal completion never aborts, and a premature disconnect always does.
 *
 * @param {import('http').IncomingMessage} req  not read by the detection
 *   logic; kept as the first parameter only for existing call-site shape.
 * @param {import('http').ServerResponse} res
 * @param {AbortController} [existingController] reuse a controller the
 *   caller already owns (e.g. one that also carries its own deadline
 *   timer) instead of minting a second, independent one for the same
 *   logical request. Defaults to a fresh controller when omitted.
 */
function attachClientDisconnectAbort(req, res, existingController) {
  const controller = existingController || new AbortController();

  const onClose = () => {
    // 'close' fires on normal completion too — writableEnded is the only
    // thing that tells "finished" apart from "the client left early".
    if (res.writableEnded) return;
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  res.on('close', onClose);

  return {
    signal: controller.signal,
    cleanup: () => res.off('close', onClose),
  };
}

module.exports = {
  setSseHeaders,
  writeSseEvent,
  attachClientDisconnectAbort,
};
