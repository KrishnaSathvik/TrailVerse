test('failed analytics writes back off without logging rejected documents', async () => {
  const { persistAnalytics } = require('../analyticsWriter');
  const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
  let clock = 1000; const time = jest.spyOn(Date, 'now').mockImplementation(() => clock);
  const write = jest.fn().mockRejectedValue(Object.assign(new Error('private rejected batch'), { code: 8000 }));
  try {
    expect(await persistAnalytics(write)).toBe(false);
    await persistAnalytics(write);
    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain('private rejected batch');
    clock += 10001; write.mockResolvedValue({});
    expect(await persistAnalytics(write)).toBe(true);
  } finally { warn.mockRestore(); time.mockRestore(); }
});
