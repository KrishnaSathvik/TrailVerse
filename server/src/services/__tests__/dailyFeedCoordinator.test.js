const { createDailyFeedCoordinator } = require('../dailyFeedCoordinator');

describe('daily feed generation and persistence coordination', () => {
  let clock, read, generate, save, sleep, coordinator;
  const date = '2026-10-02';
  const feed = { date, parkOfDay: { parkCode: 'yell' }, natureFact: 'A fact', generatedAt: new Date('2026-10-02T12:00:00Z') };
  beforeEach(() => {
    clock = 100000;
    read = jest.fn().mockResolvedValue(null);
    generate = jest.fn().mockResolvedValue(feed);
    save = jest.fn().mockImplementation(async draft => draft);
    sleep = jest.fn().mockResolvedValue();
    coordinator = createDailyFeedCoordinator({ read, generate, save, sleep, now: () => clock,
      isFresh: value => Boolean(value?.natureFact), baseBackoffMs: 1000, maxBackoffMs: 4000 });
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => jest.restoreAllMocks());
  test('simultaneous HTTP/scheduler calls perform one generation and save', async () => {
    const results = await Promise.all(Array.from({ length: 20 }, () => coordinator.get({ feedDate: date, force: true })));
    expect(results).toEqual(Array(20).fill(feed));
    expect(generate).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
  });
  test('quota failure retains generated result; repeated and forced requests never repeat AI', async () => {
    save.mockRejectedValue(Object.assign(new Error('quota'), { code: 8000 }));
    expect(await coordinator.get({ feedDate: date })).toEqual(feed);
    for (let i = 0; i < 10; i++) await coordinator.get({ feedDate: date, force: true });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
    clock += 1001;
    await coordinator.get({ feedDate: date });
    expect(save).toHaveBeenCalledTimes(2);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(coordinator.status().retryAt).toBe(clock + 2000);
    clock += 2001;
    save.mockImplementation(async draft => draft);
    await coordinator.get({ feedDate: date, force: true });
    expect(save).toHaveBeenLastCalledWith(feed);
    expect(generate).toHaveBeenCalledTimes(1);
    expect(coordinator.status().persistencePending).toBe(false);
  });
  test('unavailable Mongo prevents any AI and backs off repeated reads', async () => {
    read.mockRejectedValue(new Error('offline'));
    for (let i = 0; i < 10; i++) {
      await expect(coordinator.get({ feedDate: date })).rejects.toMatchObject({ code: 'DAILY_FEED_UNAVAILABLE' });
    }
    expect(read).toHaveBeenCalledTimes(1);
    expect(generate).not.toHaveBeenCalled();
  });
  test('transient saves retry at most three times with backoff, using the same draft', async () => {
    save.mockRejectedValue(Object.assign(new Error('timeout'), { name: 'MongoNetworkError' }));
    await coordinator.get({ feedDate: date });
    expect(save).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls).toEqual([[250], [500]]);
    expect(generate).toHaveBeenCalledTimes(1);
    await coordinator.get({ feedDate: date });
    expect(save).toHaveBeenCalledTimes(3);
  });
  test('fresh existing result avoids provider and writes', async () => {
    read.mockResolvedValue(feed);
    expect(await coordinator.get({ feedDate: date })).toEqual(feed);
    expect(generate).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });
  test('generation failure has controlled failure and bounded exponential cooldown', async () => {
    generate.mockRejectedValue(new Error('provider failed'));
    for (let i = 0; i < 6; i++) {
      await expect(coordinator.get({ feedDate: date })).rejects.toMatchObject({ code: 'DAILY_FEED_UNAVAILABLE' });
      expect(coordinator.status().retryAt - clock).toBeLessThanOrEqual(4000);
      clock = coordinator.status().retryAt + 1;
    }
    expect(generate).toHaveBeenCalledTimes(6);
  });
  test('does not relabel yesterday as today or start new AI while persistence is broken', async () => {
    save.mockRejectedValue(Object.assign(new Error('quota'), { code: 8000 }));
    await coordinator.get({ feedDate: date });
    clock += 1001;
    await expect(coordinator.get({ feedDate: '2026-10-03' })).rejects.toMatchObject({ code: 'DAILY_FEED_UNAVAILABLE' });
    expect(generate).toHaveBeenCalledTimes(1);
    expect(feed.date).toBe(date);
  });
  test('incomplete generated content does not trigger paid regeneration on each request', async () => {
    generate.mockResolvedValue({ ...feed, natureFact: null });
    await coordinator.get({ feedDate: date });
    await coordinator.get({ feedDate: date });
    expect(generate).toHaveBeenCalledTimes(1);
  });
});
