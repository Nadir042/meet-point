'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createServer } = require('../server');
const { openStore } = require('../shared-store');

test('two independent clients complete the shared activity flow', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meetpoint-shared-'));
  const filename = path.join(directory, 'test.sqlite');
  let store = openStore(filename), server = createServer(store);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, method = 'GET', data, token) {
    const response = await fetch(base + route, { method, headers: {
      ...(data ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }, body: data ? JSON.stringify(data) : undefined });
    return { status: response.status, body: await response.json() };
  }
  try {
    assert.equal((await fetch(base + '/index.html')).status, 200);
    const body = Buffer.from(JSON.stringify({ title: '周末聚餐', nickname: '小林', type: '聚餐', date: '2026-10-29', time: '18:30' }));
    const splitAt = body.indexOf(Buffer.from('周')) + 1;
    const created = await new Promise((resolve, reject) => {
      const req = http.request(base + '/api/activities', { method: 'POST', headers: { 'Content-Type': 'application/json' } }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
      });
      req.on('error', reject);
      req.write(body.subarray(0, splitAt));
      req.end(body.subarray(splitAt));
    });
    assert.equal(created.status, 201);
    assert.equal(created.body.activity.title, '周末聚餐');
    const { id, code } = created.body.activity;
    assert.match(created.body.token, /^[A-Za-z0-9_-]{43}$/);
    const joined = await request('/api/activities/join', 'POST', { code, nickname: '小陈' });
    assert.equal(joined.status, 201);
    assert.equal(joined.body.activity.members.length, 2);
    const saved = await request(`/api/activities/${id}/requirements`, 'PUT', { originIndex: 2, mode: '公共交通', preference: '聚餐', budget: 100, shared: false }, joined.body.token);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.activity.members[1].origin.name, '人民广场');
    const hostView = await request(`/api/activities/${id}`, 'GET', null, created.body.token);
    assert.equal(hostView.body.activity.members[1].ready, true);
    assert.equal(hostView.body.activity.members[1].origin, null, 'private origin is hidden from other members');
    assert.equal(hostView.body.activity.members[1].preference, '聚餐');
    const hostReady = await request(`/api/activities/${id}/requirements`, 'PUT', { originIndex: 0, mode: '公共交通', preference: '不限', budget: 150, shared: true }, created.body.token);
    assert.equal(hostReady.body.activity.requirementsReady, true);
    const recommended = await request(`/api/activities/${id}/actions`, 'POST', { action: 'recommend' }, created.body.token);
    assert.equal(recommended.body.activity.status, 'voting');
    assert.ok(recommended.body.activity.candidates.length > 0);
    const place = recommended.body.activity.candidates[0].id;
    const voted = await request(`/api/activities/${id}/actions`, 'POST', { action: 'vote', data: { id: place } }, joined.body.token);
    assert.equal(voted.body.activity.votes[joined.body.activity.viewerId], place);
    assert.equal((await request(`/api/activities/${id}`, 'GET', null, created.body.token)).body.activity.votes[joined.body.activity.viewerId], place);
    const feeling = await request(`/api/activities/${id}/actions`, 'POST', { action: 'feeling', data: { text: '很期待见面' } }, joined.body.token);
    assert.equal(feeling.body.activity.journal.feelings[0].text, '很期待见面');
    const photoId = crypto.randomUUID();
    const uploaded = await request(`/api/activities/${id}/photos`, 'POST', { id: photoId, name: '一起.png', mime: 'image/png', base64: 'iVBORw0KGgo=' }, joined.body.token);
    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.body.activity.journal.photos[0].id, photoId);
    const photo = await fetch(`${base}/api/activities/${id}/photos/${photoId}`, { headers: { Authorization: `Bearer ${created.body.token}` } });
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get('content-type'), 'image/png');
    assert.equal((await request(`/api/activities/${id}/actions`, 'POST', { action: 'delete-photo', data: { id: photoId } }, created.body.token)).status, 400);
    assert.equal((await request(`/api/activities/${id}`, 'GET')).status, 401);
    assert.equal((await request(`/api/activities/${id}/requirements`, 'PUT', { originIndex: 0, mode: '步行', preference: '不限', budget: 0 }, 'invalid')).status, 401);
    const repeat = await request('/api/activities/join', 'POST', { code, nickname: '小陈' });
    assert.equal(repeat.status, 400, 'voting still prevents joining');
    const names = await request('/api/activities', 'POST', { title: '重名测试', nickname: '小陈', type: '聚餐', date: '2026-10-29', time: '18:30' });
    const namesId = names.body.activity.id;
    const sameName = await request('/api/activities/join', 'POST', { code: names.body.activity.code, nickname: '小陈' });
    assert.equal(sameName.status, 201);
    assert.equal(sameName.body.activity.members[1].name, '小陈（2）');
    assert.notEqual(sameName.body.activity.viewerId, names.body.activity.viewerId);
    const renamed = await request(`/api/activities/${namesId}/actions`, 'POST', { action: 'rename', data: { name: '新昵称' } }, sameName.body.token);
    assert.equal(renamed.body.activity.members[1].name, '新昵称');
    assert.equal((await request(`/api/activities/${namesId}`, 'GET', null, names.body.token)).body.activity.members[1].name, '新昵称');
    // New members cannot join while this activity is voting; use another activity for cap tests.
    const capActivity = await request('/api/activities', 'POST', { title: '人数测试', nickname: '发起人', type: '聚餐', date: '2026-10-29', time: '18:30' });
    const capCode = capActivity.body.activity.code;
    for (let i = 2; i <= 9; i++) assert.equal((await request('/api/activities/join', 'POST', { code: capCode, nickname: `成员${i}` })).status, 201);
    const simultaneous = await Promise.all(['第十位', '第十一位'].map(nickname => request('/api/activities/join', 'POST', { code: capCode, nickname })));
    assert.deepEqual(simultaneous.map(result => result.status).sort(), [201, 400]);
    assert.equal((await request(`/api/activities/${capActivity.body.activity.id}`, 'GET', null, capActivity.body.token)).body.activity.members.length, 10);
    await new Promise(resolve => server.close(resolve)); store.close();
    store = openStore(filename); server = createServer(store);
    assert.equal(store.get(capActivity.body.activity.id, capActivity.body.token).activity.members.length, 10, 'database survives server restart');
  } finally {
    if (server.listening) await new Promise(resolve => server.close(resolve));
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('account gathers activities across nicknames and can claim a guest membership', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meetpoint-account-'));
  const store = openStore(path.join(directory, 'test.sqlite'));
  const server = createServer(store);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, method = 'GET', data, token) {
    const response = await fetch(base + route, { method, headers: {
      ...(data ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }, body: data ? JSON.stringify(data) : undefined });
    return { status: response.status, body: await response.json() };
  }
  const activity = (title, nickname) => ({ title, nickname, type: '聚餐', date: '2026-10-29', time: '18:30' });
  try {
    const registered = await request('/api/account/register', 'POST', { username: 'demo_user', password: 'demo-pass-123' });
    assert.equal(registered.status, 201);
    const accountToken = registered.body.token;
    const first = await request('/api/activities', 'POST', activity('账号活动甲', '小甲'), accountToken);
    const second = await request('/api/activities', 'POST', activity('账号活动乙', '小乙'), accountToken);
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
    assert.equal(first.body.activity.members[0].identityType, 'account');
    assert.equal(first.body.token, null);
    const list = await request('/api/account/activities', 'GET', null, accountToken);
    assert.deepEqual(new Set(list.body.activities.map(a => a.title)), new Set(['账号活动甲', '账号活动乙']));
    assert.equal((await request(`/api/activities/${first.body.activity.id}`, 'GET', null, accountToken)).status, 200);
    assert.equal((await request('/api/activities/join', 'POST', { code: first.body.activity.code, nickname: '另一个昵称' }, accountToken)).status, 409);
    const guest = await request('/api/activities', 'POST', activity('游客活动', '游客昵称'));
    assert.equal((await request('/api/account/activities', 'GET', null, accountToken)).body.activities.length, 2);
    const claimed = await request(`/api/activities/${guest.body.activity.id}/claim`, 'POST', { guestToken: guest.body.token }, accountToken);
    assert.equal(claimed.status, 200);
    assert.equal(claimed.body.activity.members[0].identityType, 'account');
    assert.equal((await request('/api/account/activities', 'GET', null, accountToken)).body.activities.length, 3);
    assert.equal((await request(`/api/activities/${guest.body.activity.id}`, 'GET', null, guest.body.token)).status, 401);
    assert.equal((await request(`/api/activities/${guest.body.activity.id}`, 'GET', null, accountToken)).status, 200);
    const loggedIn = await request('/api/account/login', 'POST', { username: 'demo_user', password: 'demo-pass-123' });
    assert.equal(loggedIn.status, 200);
    assert.equal((await request('/api/account/activities', 'GET', null, loggedIn.body.token)).body.activities.length, 3);
    assert.equal((await request('/api/account/logout', 'POST', {}, accountToken)).status, 200);
    assert.equal((await request('/api/account/activities', 'GET', null, accountToken)).status, 401);
  } finally {
    await new Promise(resolve => server.close(resolve));
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('expired guest credential is pruned while the shared activity remains', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meetpoint-expiry-'));
  const filename = path.join(directory, 'test.sqlite');
  const store = openStore(filename);
  try {
    const result = store.create({ title: '过期测试', nickname: '游客', type: '聚餐', date: '2026-10-29', time: '18:30' });
    const db = new DatabaseSync(filename);
    try {
      const activity = JSON.parse(db.prepare('SELECT payload FROM activities WHERE id = ?').get(result.activity.id).payload);
      activity.members[0].lastActiveAt = Date.now() - 2 * 24 * 60 * 60 * 1000;
      db.prepare('UPDATE activities SET payload = ? WHERE id = ?').run(JSON.stringify(activity), activity.id);
      store.pruneExpiredGuests();
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE activity_id = ?').get(activity.id).count, 0);
      assert.ok(db.prepare('SELECT id FROM activities WHERE id = ?').get(activity.id));
      assert.throws(() => store.get(activity.id, result.token), /无效或已过期/);
    } finally { db.close(); }
  } finally { store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});
