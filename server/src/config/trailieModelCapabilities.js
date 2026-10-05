'use strict';

const MODEL_CAPABILITIES = Object.freeze(Object.fromEntries([
  'gpt-6-luna', 'gpt-6-sol', 'gpt-6-astra', 'gpt-6.1-sol',
].map((model) => [model, Object.freeze({
  endpoint: 'responses',
  tools: true,
  reasoningEfforts: Object.freeze(model === 'gpt-6-astra'
    ? ['low', 'medium', 'high', 'xhigh', 'max']
    : ['none', 'low', 'medium', 'high', 'xhigh', 'max']),
  temperatureWithoutReasoning: model !== 'gpt-6-astra',
})])));

module.exports = { MODEL_CAPABILITIES };
