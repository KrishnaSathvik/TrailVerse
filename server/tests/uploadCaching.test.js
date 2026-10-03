const fs = require('fs');
const os = require('os');
const path = require('path');
const express = require('express');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const User = require('../src/models/User');
const uploadPolicy = require('../src/config/uploadCache');
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'trailverse-upload-cache-'));
const previousDirectory = process.env.UPLOADS_DIR;
process.env.UPLOADS_DIR = directory;
const images = require('../src/routes/images');
const policy = 'public, max-age=31536000, s-maxage=31536000, immutable';
let app;
beforeAll(() => {
  fs.writeFileSync(path.join(directory, 'sample.svg'), '<svg xmlns="http://www.w3.org/2000/svg"/>');
  app = express(); app.use('/uploads', express.static(directory, uploadPolicy)); app.use('/api/images', images);
});
afterAll(() => {
  fs.rmSync(directory, { recursive: true, force: true });
  if (previousDirectory == null) delete process.env.UPLOADS_DIR; else process.env.UPLOADS_DIR = previousDirectory;
});
test.each(['/uploads/sample.svg', '/api/images/file/sample.svg'])('public upload %s keeps its immutable headers', async route => {
  const response = await request(app).get(route);
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe(policy);
  expect(response.headers['content-type']).toContain('image/svg+xml');
});
test.each(['/uploads/missing.svg', '/api/images/file/missing.svg'])('missing upload %s has no long-lived public caching', async route => {
  const response = await request(app).get(route);
  expect(response.status).toBe(404);
  expect(response.headers['cache-control'] || '').not.toContain('immutable');
});
test('upload management requires auth and its rejection is private', async () => {
  const response = await request(app).get('/api/images');
  expect(response.status).toBe(401);
  expect(response.headers['cache-control']).toBe('private, no-store');
});
test('authenticated image listing is private', async () => {
  const user = await User.create({ name: 'Upload Test', email: 'upload-cache@example.com', password: 'password123' });
  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET);
  const response = await request(app).get('/api/images').set('Authorization', `Bearer ${token}`);
  expect(response.status).toBe(200);
  expect(response.headers['cache-control']).toBe('private, no-store');
});
test('anonymous uploads are rejected before files are written', async () => {
  const response = await request(app).post('/api/images/upload').attach('images', Buffer.from('bad'), 'bad.png');
  expect(response.status).toBe(401);
  expect(fs.readdirSync(directory)).toEqual(['sample.svg']);
});
