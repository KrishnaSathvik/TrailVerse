'use strict';

const ANSWER_TOOL = {
  name: 'begin_conversational_answer',
  description: 'Choose this only for ordinary travel advice, explanations or comparisons requiring no itinerary, trip change, or saved-memory update. Finish any necessary research first. Never use for creating or modifying a trip, or to claim something was saved. This hands off to a tool-free conversational response; it does not save anything.',
  input_schema: { type: 'object', properties: {}, additionalProperties: false, required: [] },
};

const ANSWER_INSTRUCTIONS = 'Answer the traveler conversationally using the available evidence. This is a read-only answer: no tools, itinerary creation, trip changes, or memory updates are possible. Never claim to have saved, remembered, created, or updated anything. Do not write a day-by-day itinerary. Respect uncertainty and evidence freshness; do not invent current conditions. Your text is provisional until the conversation is saved.';

function answerStreamEnabled(req, env = process.env) {
  return env.TRAILIE_ANSWER_STREAM === 'true' && req.get('x-trailie-answer-stream') === '1';
}

function createAnswerCollector({ onText, signal }) {
  let itemId = null, content = '', final = null, sequence = -1;
  const invalid = () => { throw Object.assign(new Error('Answer stream could not be confirmed'), { code: 'answer_stream_invalid' }); };
  return {
    push(event) {
      if (signal?.aborted) throw Object.assign(new Error('Answer cancelled'), { name: 'AbortError' });
      if (final) return invalid();
      if (Number.isInteger(event.sequence_number)) {
        if (event.sequence_number <= sequence) return invalid();
        sequence = event.sequence_number;
      }
      if (['error', 'response.failed', 'response.incomplete', 'response.refusal.delta', 'response.refusal.done'].includes(event.type)) return invalid();
      if (event.type === 'response.output_item.added') {
        if (event.item?.type === 'message' && event.item.role === 'assistant' && !itemId) itemId = event.item.id;
        else if (event.item?.type !== 'reasoning') return invalid();
      }
      if (event.type.startsWith('response.function_call_arguments.')) return invalid();
      if (event.type === 'response.output_text.delta') {
        if (!itemId || event.item_id !== itemId || event.content_index !== 0 || typeof event.delta !== 'string') return invalid();
        content += event.delta;
        if (content.length > 64000) return invalid();
        onText(event.delta);
      }
      if (event.type === 'response.completed') final = event.response;
    },
    finish() {
      if (signal?.aborted || final?.status !== 'completed' || !content.trim() || !Array.isArray(final.output)) return invalid();
      const messages = final.output.filter(item => item.type !== 'reasoning');
      const message = messages[0];
      if (messages.length !== 1 || message?.type !== 'message' || message.role !== 'assistant' || message.status !== 'completed' || message.id !== itemId
        || message.content?.length !== 1 || message.content[0].type !== 'output_text' || message.content[0].text !== content) return invalid();
      return { ...final, output_text: content };
    },
  };
}

module.exports = { ANSWER_TOOL, ANSWER_INSTRUCTIONS, answerStreamEnabled, createAnswerCollector };
