const User = require('../User');

test('concurrent turns reset yesterday once and retain both increments and lifetime usage', async () => {
  const yesterday = new Date(Date.now() - 86400000);
  const user = await User.create({ name: 'Token Test', email: 'tokens@example.com', password: 'fixture-password',
    tokenUsage: { dailyTokensUsed: 400, totalTokensUsed: 900, lastResetDate: yesterday } });
  const [first, second] = await Promise.all([User.findById(user._id).select('-password'), User.findById(user._id).select('-password')]);
  const original = User.updateOne.bind(User);
  const resets = [];
  const spy = jest.spyOn(User, 'updateOne').mockImplementation(async (...args) => {
    const result = await original(...args);
    resets.push(result.modifiedCount);
    return result;
  });
  try {
    await Promise.all([first.addTokenUsage(10, 20), second.addTokenUsage(30, 40)]);
    expect(resets.sort()).toEqual([0, 1]);
    const saved = await User.findById(user._id);
    expect(saved.tokenUsage.dailyTokensUsed).toBe(100);
    expect(saved.tokenUsage.totalTokensUsed).toBe(1000);
    expect(saved.tokenUsage.lastResetDate.toDateString()).toBe(new Date().toDateString());
    // Reusing the stale document must not reset the database a second time.
    await first.addTokenUsage(5, 5);
    expect((await User.findById(user._id)).tokenUsage.dailyTokensUsed).toBe(110);
    expect(resets.reduce((a, b) => a + b, 0)).toBe(1);
  } finally { spy.mockRestore(); }
});
