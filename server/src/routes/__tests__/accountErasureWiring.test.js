'use strict';

const fs = require('fs');
const path = require('path');
const express = require('express');
const request = require('supertest');

jest.mock('../../models/User');
jest.mock('bcryptjs', () => ({ compare: jest.fn().mockResolvedValue(true) }));
jest.mock('../../middleware/auth', () => ({
  protect: (req, _res, next) => {
    req.user = { id: 'user-self', _id: 'user-self' };
    next();
  },
}));
jest.mock('../../services/resendEmailService', () => ({
  sendAccountDeletionConfirmation: jest.fn().mockResolvedValue(undefined),
}));
jest.mock('../../services/accountErasureService', () => ({
  eraseAccountData: jest.fn().mockResolvedValue({ erasureId: 'erase-1', status: 'complete' }),
}));

const User = require('../../models/User');
const resendEmailService = require('../../services/resendEmailService');
const { eraseAccountData } = require('../../services/accountErasureService');
const adminController = require('../../controllers/adminController');

function mockRes() {
  return {
    statusCode: 200,
    body: null,
    cleared: [],
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
    clearCookie(name) { this.cleared.push(name); return this; },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
  eraseAccountData.mockResolvedValue({ erasureId: 'erase-1', status: 'complete' });
  resendEmailService.sendAccountDeletionConfirmation.mockResolvedValue(undefined);
});

describe('account erasure wiring', () => {
  test('self-service deletion completes centralized erasure before confirming by email', async () => {
    const user = { _id: 'user-self', id: 'user-self', email: 'self@example.com', password: 'hash' };
    User.findById.mockReturnValue({ select: jest.fn().mockResolvedValue(user) });
    const app = express();
    app.use(express.json());
    app.use('/api/user', require('../userRoutes'));

    const response = await request(app)
      .delete('/api/user/delete-account')
      .send({ password: 'password123', confirmation: 'DELETE' });

    expect(response.status).toBe(200);
    expect(eraseAccountData).toHaveBeenCalledWith({
      userId: 'user-self',
      actor: { type: 'self', id: 'user-self' },
    });
    expect(resendEmailService.sendAccountDeletionConfirmation).toHaveBeenCalledWith(user);
    expect(eraseAccountData.mock.invocationCallOrder[0]).toBeLessThan(
      resendEmailService.sendAccountDeletionConfirmation.mock.invocationCallOrder[0]
    );
  });

  test('admin single deletion uses the same erasure service', async () => {
    User.findById.mockResolvedValue({ _id: 'target-user' });
    const req = { params: { id: 'target-user' }, user: { _id: 'admin-user' } };
    const res = mockRes();
    await adminController.deleteUser(req, res, jest.fn());

    expect(eraseAccountData).toHaveBeenCalledWith({
      userId: 'target-user',
      actor: { type: 'admin', id: 'admin-user' },
    });
    expect(res.statusCode).toBe(200);
  });

  test('admin bulk deletion erases every selected account independently', async () => {
    const req = {
      body: { userIds: ['target-1', 'target-2'], action: 'delete' },
      user: { _id: 'admin-user' },
    };
    const res = mockRes();
    await adminController.bulkActionUsers(req, res, jest.fn());

    expect(eraseAccountData).toHaveBeenCalledTimes(2);
    expect(eraseAccountData).toHaveBeenNthCalledWith(1, {
      userId: 'target-1',
      actor: { type: 'admin', id: 'admin-user' },
    });
    expect(eraseAccountData).toHaveBeenNthCalledWith(2, {
      userId: 'target-2',
      actor: { type: 'admin', id: 'admin-user' },
    });
    expect(res.body.modifiedCount).toBe(2);
  });

  test('legacy admin userAction delete cannot bypass centralized erasure', async () => {
    User.findById.mockResolvedValue({ _id: 'target-user' });
    const req = {
      params: { id: 'target-user', action: 'delete' },
      user: { _id: 'admin-user' },
    };
    const res = mockRes();
    await adminController.userAction(req, res, jest.fn());

    expect(eraseAccountData).toHaveBeenCalledWith({
      userId: 'target-user',
      actor: { type: 'admin', id: 'admin-user' },
    });
  });

  test('user and admin request paths contain no direct User deletion escape hatch', () => {
    const files = [
      path.resolve(__dirname, '../userRoutes.js'),
      path.resolve(__dirname, '../../controllers/adminController.js'),
    ];
    for (const file of files) {
      const source = fs.readFileSync(file, 'utf8');
      expect(source).not.toMatch(/User\.(?:findByIdAndDelete|deleteMany|deleteOne)\s*\(/);
    }
  });
});
