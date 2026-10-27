const {
  getVoiceConfig,
  resolveVoiceRealtimeModel,
  resolveVoiceName,
  resolveVoiceBargeIn,
} = require('../voiceConfig');

describe('voiceConfig', () => {
  const original = { ...process.env };

  afterEach(() => {
    process.env = { ...original };
  });

  it('defaults to gpt-realtime-2.1 and marin', () => {
    delete process.env.VOICE_REALTIME_MODEL;
    delete process.env.VOICE_NAME;
    delete process.env.VOICE_BARGE_IN;
    const cfg = getVoiceConfig();
    expect(cfg.model).toBe('gpt-realtime-2.1');
    expect(cfg.voice).toBe('marin');
    expect(cfg.bargeIn).toBe(false);
    expect(cfg.reasoningEffort).toBe('low');
  });

  it('rejects unsupported voices and falls back to marin', () => {
    process.env.VOICE_NAME = 'cedar';
    expect(resolveVoiceName()).toBe('marin');
  });

  it('allows configured realtime models', () => {
    process.env.VOICE_REALTIME_MODEL = 'gpt-realtime-2.1-mini';
    expect(resolveVoiceRealtimeModel()).toBe('gpt-realtime-2.1-mini');
  });

  it('enables barge-in only when VOICE_BARGE_IN=true', () => {
    process.env.VOICE_BARGE_IN = 'true';
    expect(resolveVoiceBargeIn()).toBe(true);
    process.env.VOICE_BARGE_IN = 'false';
    expect(resolveVoiceBargeIn()).toBe(false);
  });
});
