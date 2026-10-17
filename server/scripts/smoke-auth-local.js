'use strict';
// Standalone local HTTP smoke. Never loads .env, production MongoDB or email.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'local-auth-smoke-secret-not-for-production';
process.env.CLIENT_URL = 'http://localhost:3000';
const assert = require('node:assert/strict');
const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');
const express = require('express');
const request = require('supertest');
let resetUrl;
const emailPath = require.resolve('../src/services/resendEmailService');
require.cache[emailPath] = { id: emailPath, filename: emailPath, loaded: true, exports: {
  sendEmailVerification: async () => {}, sendAdminNewUserNotification: async () => {},
  sendWelcomeEmail: async () => {}, sendPasswordReset: async (_user, url) => { resetUrl = url; },
} };
const User = require('../src/models/User');
const app = express();
app.use(express.json());
app.use('/api/auth', require('../src/routes/auth'));
app.use('/api/users', require('../src/routes/users'));
app.use(require('../src/middleware/errorHandler'));
(async () => {
  const mongo = await MongoMemoryServer.create();
  try {
    await mongoose.connect(mongo.getUri());
    const email = 'local-smoke@example.com';
    await request(app).post('/api/auth/signup').send({ firstName: 'Local', lastName: 'Smoke', email, password: 'initial-password' }).expect(201);
    await request(app).post('/api/auth/login').send({ email, password: 'initial-password' }).expect(200);
    await request(app).post('/api/auth/forgot-password').send({ email }).expect(200);
    await request(app).put('/api/auth/reset-password/' + resetUrl.split('/').pop()).send({ password: 'reset-password' }).expect(200);
    const login = await request(app).post('/api/auth/login').send({ email, password: 'reset-password' }).expect(200);
    const before = await User.findOne({ email }).select('+password');
    await request(app).put('/api/users/profile').set('Authorization', 'Bearer ' + login.body.token).send({ firstName: 'Edited' }).expect(200);
    const projected = await User.findOne({ email }).select('-password');
    assert.equal(projected.password, undefined);
    projected.bio = 'Password-preserving save';
    await projected.save();
    assert.equal((await User.findOne({ email }).select('+password')).password, before.password);
    await request(app).post('/api/auth/login').send({ email, password: 'reset-password' }).expect(200);
    await request(app).post('/api/auth/login').send({ email, password: 'initial-password' }).expect(401);
    console.log('PASS: signup → login → password reset → profile edit → login; projected save preserves hash; old password rejected');
  } finally { await mongoose.disconnect(); await mongo.stop(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
