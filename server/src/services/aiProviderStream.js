/**
 * Stream raw LLM tokens to an open SSE response (chunk events only).
 * Post-processing (itinerary, anonymous upsell, etc.) stays in the route handler.
 */

async function streamRawLLMToSse(res, {
  anthropic,
  openai,
  provider,
  model,
  temperature,
  maxTokens,
  top_p,
  enhancedSystemPrompt,
  augmentedMessages,
  signal,
}) {
  let fullContent = '';
  let usage = null;
  let resolvedProvider = provider;
  let resolvedModel = model;
  let aborted = false;

  const isAborted = () => signal?.aborted === true;

  if (resolvedProvider !== 'claude' && resolvedProvider !== 'openai') {
    resolvedProvider = anthropic ? 'claude' : 'openai';
  }

  if (resolvedProvider === 'claude') {
    if (!anthropic) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'Claude API key not configured' })}\n\n`);
      return null;
    }

    resolvedModel = model || 'claude-sonnet-4-6';
    const stream = await anthropic.messages.create(
      {
        model: resolvedModel,
        max_tokens: maxTokens,
        temperature,
        system: enhancedSystemPrompt,
        messages: augmentedMessages,
        stream: true,
      },
      signal ? { signal } : undefined
    );

    for await (const chunk of stream) {
      if (isAborted()) {
        aborted = true;
        break;
      }
      if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
        fullContent += chunk.delta.text;
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk.delta.text })}\n\n`);
        if (typeof res.flush === 'function') res.flush();
      }
    }
  } else if (resolvedProvider === 'openai') {
    if (!openai) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: 'OpenAI API key not configured' })}\n\n`);
      return null;
    }

    resolvedModel = model || 'gpt-5.4-mini';
    const openaiMessages = augmentedMessages.map((m) => ({ role: m.role, content: m.content }));
    const stream = await openai.chat.completions.create(
      {
        model: resolvedModel,
        messages: [{ role: 'system', content: enhancedSystemPrompt }, ...openaiMessages],
        temperature,
        max_completion_tokens: maxTokens,
        top_p,
        stream: true,
      },
      signal ? { signal } : undefined
    );

    for await (const chunk of stream) {
      if (isAborted()) {
        aborted = true;
        break;
      }
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) {
        fullContent += text;
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: text })}\n\n`);
        if (typeof res.flush === 'function') res.flush();
      }
    }
  } else {
    res.write(`data: ${JSON.stringify({ type: 'error', message: 'Invalid provider. Use "claude" or "openai"' })}\n\n`);
    return null;
  }

  if (isAborted()) {
    aborted = true;
  }

  if (aborted) {
    return { fullContent, provider: resolvedProvider, model: resolvedModel, usage, aborted: true };
  }

  return {
    fullContent,
    provider: resolvedProvider,
    model: resolvedModel,
    usage,
    aborted: false,
  };
}

module.exports = { streamRawLLMToSse };
