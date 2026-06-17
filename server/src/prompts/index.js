const { buildOpenAIArchitectPrompt } = require('./openaiArchitectPrompt');
const { buildClaudeBuddyPrompt } = require('./claudeBuddyPrompt');
const { TRAILIE_VOICE_INSTRUCTIONS } = require('./voicePrompt');
const coreTrailiePolicy = require('./coreTrailiePolicy');

module.exports = {
  buildOpenAIArchitectPrompt,
  buildClaudeBuddyPrompt,
  TRAILIE_VOICE_INSTRUCTIONS,
  ...coreTrailiePolicy,
};
