export const answerStreamEnabled = () => process.env.NEXT_PUBLIC_TRAILIE_ANSWER_STREAM === 'true';

export const answerStreamHeaders = () => answerStreamEnabled() ? { 'x-trailie-answer-stream': '1' } : {};

export function reduceAnswerStream(state, event) {
  if (event.type === 'answer_closed') return null;
  if (event.type === 'answer_started') {
    if (state || typeof event.responseId !== 'string' || event.sequence !== 1) return state;
    return { responseId: event.responseId, sequence: 1, content: '', withdrawn: false };
  }
  if (!state || state.withdrawn || event.responseId !== state.responseId) return state;
  if (!Number.isInteger(event.sequence) || event.sequence !== state.sequence + 1) return { ...state, content: '', withdrawn: true };
  if (event.type === 'answer_withdrawn') return { ...state, sequence: event.sequence, content: '', withdrawn: true };
  if (event.type !== 'answer_delta' || typeof event.content !== 'string' || state.content.length + event.content.length > 64000) {
    return { ...state, content: '', withdrawn: true };
  }
  return { ...state, sequence: event.sequence, content: state.content + event.content };
}
