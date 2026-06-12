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
 * Abort upstream LLM work when the client disconnects or closes the request.
 */
function attachClientDisconnectAbort(req) {
  const controller = new AbortController();

  const onClose = () => {
    if (!controller.signal.aborted) {
      controller.abort();
    }
  };

  req.on('close', onClose);

  return {
    signal: controller.signal,
    cleanup: () => req.off('close', onClose),
  };
}

module.exports = {
  setSseHeaders,
  writeSseEvent,
  attachClientDisconnectAbort,
};
