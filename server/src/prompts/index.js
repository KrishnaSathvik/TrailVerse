const { buildOpenAIArchitectPrompt } = require('./openaiArchitectPrompt');
const { TRAILIE_VOICE_INSTRUCTIONS } = require('./voicePrompt');
const coreTrailiePolicy = require('./coreTrailiePolicy');

module.exports = {
  buildOpenAIArchitectPrompt,
  TRAILIE_VOICE_INSTRUCTIONS,
  ...coreTrailiePolicy,
};
