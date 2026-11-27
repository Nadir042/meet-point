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
const M = require('../core');
const amapOrigin = index => ({ ...M.ORIGINS[index], provider: 'amap', placeId: `test-place-${index}`, address: '上海市测试地址', category: '地名地址信息' });

function legacyGuest(filename, input) {
  const { createHash, randomBytes } = require('node:crypto');
  const a = M.createActivity(input.title, input.nickname, '聚餐', Date.now());
  const token = randomBytes(32).toString('base64url');
  const db = new DatabaseSync(filename);
  try {
    db.prepare('INSERT INTO activities VALUES (?, ?, ?)').run(a.id, a.code, JSON.stringify(a));
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(createHash('sha256').update(token).digest('hex'), a.id, a.hostId);
  } finally { db.close(); }
  return { activity: a, token };
}

const testMapProvider = () => ({
  async search() {
    return [
      {provider:'test',placeId:'food-1',name:'测试餐厅甲',address:'测试路 1 号',category:'中餐厅',typecode:'050100',lng:121.47,lat:31.22,rating:4.6},
      {provider:'test',placeId:'food-2',name:'测试餐厅乙',address:'测试路 2 号',category:'咖啡厅',typecode:'050500',lng:121.45,lat:31.23,rating:4.4},
      {provider:'test',placeId:'food-3',name:'测试餐厅丙',address:'测试路 3 号',category:'西餐厅',typecode:'050200',lng:121.49,lat:31.21,rating:4.2}
    ];
  },
  async route(origin,destination,mode) {
    const distanceMeters=Math.round(Math.hypot((origin.lng-destination.lng)*95000,(origin.lat-destination.lat)*111000));
    const extraMinutes={公共交通:0,驾车:5,骑行:10,步行:20}[mode]??30;
    return {minutes:Math.max(5,Math.ceil(distanceMeters/500))+extraMinutes,distanceMeters,cost:null,costStatus:'unavailable',transfers:0};
  }
});

test('two independent clients complete the shared activity flow', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meetpoint-shared-'));
  const filename = path.join(directory, 'test.sqlite');
  const provider = testMapProvider();
  let store = openStore(filename), server = createServer(store,provider);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  async function request(route, method = 'GET', data, token) {
    if (!token && method === 'POST' && ['/api/activities', '/api/activities/join'].includes(route)) {
      const session = store.register({ username: 'test_' + crypto.randomUUID().replaceAll('-', '' ).slice(0, 15), password: 'test-password-123' });
      const result = await request(route, method, data, session.token);
      if (result.body.activity) result.body.token = session.token;
      return result;
    }
    const response = await fetch(base + route, { method, headers: {
      ...(data ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    }, body: data ? JSON.stringify(data) : undefined });
    const payload = await response.json();
    return { status: response.status, body: payload.success ? payload.data : payload };
  }
  try {
    assert.equal((await fetch(base + '/index.html')).status, 200);
    const hostSession = store.register({ username: 'host_user', password: 'test-password-123' });
    const body = Buffer.from(JSON.stringify({ title: '周末聚餐', nickname: '小林', type: '聚餐', date: '2026-10-29', time: '18:30' }));
    const splitAt = body.indexOf(Buffer.from('周')) + 1;
    const created = await new Promise((resolve, reject) => {
      const req = http.request(base + '/api/activities', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + hostSession.token } }, res => {
        const chunks = [];
        res.on('data', chunk => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
      });
      req.on('error', reject);
      req.write(body.subarray(0, splitAt));
      req.end(body.subarray(splitAt));
    });
    created.body.token = hostSession.token;
    assert.equal(created.status, 201);
    assert.equal(created.body.activity.title, '周末聚餐');
    const { id, code } = created.body.activity;
    assert.match(created.body.token, /^[A-Za-z0-9_-]{43}$/);
    const joined = await request('/api/activities/join', 'POST', { code, nickname: '小陈' });
    assert.equal(joined.status, 201);
    assert.equal(joined.body.activity.members.length, 2);
    const saved = await request(`/api/activities/${id}/requirements`, 'PUT', { origin: amapOrigin(2), modes: ['公共交通', '骑行'], preferences: ['火锅'], budget: 100, shared: false }, joined.body.token);
    assert.equal(saved.status, 200);
    assert.equal(saved.body.activity.members[1].origin.name, '人民广场');
    assert.deepEqual(saved.body.activity.members[1].modes, ['公共交通', '骑行']);
    const customPreference = await request(`/api/activities/${id}/requirements`, 'PUT', { origin: amapOrigin(2), modes: ['公共交通', '骑行'], preferences: ['火锅', '其他'], preferenceDetail: '清真餐厅', budget: 100, shared: false }, joined.body.token);
    assert.equal(customPreference.status, 200);
    assert.deepEqual(customPreference.body.activity.members[1].preferences, ['火锅', '清真餐厅']);
    const searched = await fetch(`${base}/api/locations/search?keyword=${encodeURIComponent('人民广场')}`, { headers: { Authorization: `Bearer ${joined.body.token}` } });
    const searchedBody = await searched.json();
    assert.equal(searchedBody.success, true);
    assert.ok(Array.isArray(searchedBody.data.items));
    const emptyCoordinates = await request('/api/locations/reverse?lng=&lat=', 'GET', null, joined.body.token);
    assert.equal(emptyCoordinates.status, 400);
    assert.equal(emptyCoordinates.body.error.code, 'INVALID_REQUEST');
    const invalidOrigin = await request(`/api/activities/${id}/requirements`, 'PUT', { origin: { ...amapOrigin(1), lng: 999999 }, mode: '步行', preference: '不限', budget: 0, shared: false }, joined.body.token);
    assert.equal(invalidOrigin.status, 400);
    const hostView = await request(`/api/activities/${id}`, 'GET', null, created.body.token);
    assert.equal(hostView.body.activity.members[1].ready, true);
    assert.equal(hostView.body.activity.members[1].origin, null, 'private origin is hidden from other members');
    assert.deepEqual(hostView.body.activity.members[1].preferences, ['火锅', '清真餐厅']);
    const hostReady = await request(`/api/activities/${id}/requirements`, 'PUT', { origin: amapOrigin(0), modes: ['步行', '公共交通'], preferences: ['不限'], budget: 150, shared: true }, created.body.token);
    assert.equal(hostReady.body.activity.requirementsReady, true);
    const recommended = await request(`/api/activities/${id}/actions`, 'POST', { action: 'recommend' }, created.body.token);
    assert.equal(recommended.body.activity.status, 'voting');
    assert.ok(recommended.body.activity.candidates.length > 0);
    assert.ok(recommended.body.activity.candidates.every(candidate => candidate.routes.find(route => route.memberId === recommended.body.activity.viewerId)?.mode === '公共交通'));
    assert.equal(Object.hasOwn(recommended.body.activity, 'resultId'), false);
    assert.equal(Object.hasOwn(recommended.body.activity, 'remaining'), false);
    assert.ok(recommended.body.activity.candidates.every(candidate => Object.hasOwn(candidate.dimensions, 'convenience')));
    assert.ok(recommended.body.activity.candidates.every(candidate => !Object.hasOwn(candidate.dimensions, 'transit')));
    const place = recommended.body.activity.candidates[0].id;
    const voted = await request(`/api/activities/${id}/actions`, 'POST', { action: 'vote', data: { round: 1, candidateId: place } }, joined.body.token);
    assert.equal(voted.body.activity.votes[joined.body.activity.viewerId], place);
    const afterVote = (await request('/api/activities/' + id, 'GET', null, created.body.token)).body.activity;
    assert.deepEqual(afterVote.votes, {});
    assert.equal(afterVote.voteStatus.myVote, null);
    assert.equal(afterVote.voteStatus.voteCounts[place], 1);
    assert.ok(afterVote.candidates.every(p => p.routes.every(r => r.memberId !== joined.body.activity.viewerId)));
    const actionPath = '/api/activities/' + id + '/actions';
    const early = await request(actionPath, 'POST', { action: 'finish', data: { round: 1 } }, created.body.token);
    assert.equal(early.body.error.code, 'NOT_ALL_VOTED');
    const rerun = await request(actionPath, 'POST', { action: 'request', data: { round: 1, reason: '换个地方' } }, joined.body.token);
    const requestId = rerun.body.activity.requests[0].id;
    const search = provider.search;
    provider.search = async () => { throw Object.assign(new Error('地图超时'), { code: 'MAP_TIMEOUT', retryable: true }); };
    const approvalData = { action: 'review-request', data: { requestId, decision: 'approved' } };
    const failedApproval = await request(actionPath, 'POST', approvalData, created.body.token);
    assert.equal(failedApproval.status, 504);
    const unchanged = store.get(id, created.body.token).activity;
    assert.equal(unchanged.round, 1);
    assert.equal(unchanged.requests[0].status, 'pending');
    assert.equal(unchanged.voteStatus.voteCounts[place], 1);
    provider.search = search;
    const approved = await request(actionPath, 'POST', { action: 'review-request', data: { requestId, decision: 'approved' } }, created.body.token);
    assert.equal(approved.body.activity.voteStatus.votedMembers, 0);
    assert.ok(approved.body.activity.candidates.every(p => p.id.startsWith('c_2_food-')));
    const stale = await request(actionPath, 'POST', { action: 'vote', data: { round: 1, candidateId: place } }, joined.body.token);
    assert.equal(stale.status, 409);
    assert.equal(stale.body.error.code, 'ROUND_STALE');
    const historyPath = '/api/activities/' + id + '/vote-history';
    assert.equal((await request(historyPath)).status, 401);
    const history = (await request(historyPath, 'GET', null, joined.body.token)).body.items;
    assert.equal(history[0].voteCounts[place], 1);
    assert.equal(Object.hasOwn(history[0], 'votes'), false);
    const feeling = await request(`/api/activities/${id}/actions`, 'POST', { action: 'feeling', data: { text: '很期待见面' } }, joined.body.token);
    assert.equal(feeling.body.activity.journal.feelings[0].text, '很期待见面');
    const photoId = crypto.randomUUID();
    const uploaded = await request(`/api/activities/${id}/photos`, 'POST', { id: photoId, name: '一起.png', mime: 'image/png', base64: fs.readFileSync(path.join(__dirname, '..', 'assets', 'workspace-graduate.png')).toString('base64') }, joined.body.token);
    assert.equal(uploaded.status, 201);
    assert.equal(uploaded.body.activity.journal.photos[0].id, photoId);
    const fakePhoto = await request(`/api/activities/${id}/photos`, 'POST', { id: crypto.randomUUID(), name: '伪装.png', mime: 'image/png', base64: Buffer.from('not an image').toString('base64') }, joined.body.token);
    assert.equal(fakePhoto.status, 400);
    const photo = await fetch(`${base}/api/activities/${id}/photos/${photoId}`, { headers: { Authorization: `Bearer ${created.body.token}` } });
    assert.equal(photo.status, 200);
    assert.equal(photo.headers.get('content-type'), 'image/png');
    assert.equal((await request(`/api/activities/${id}/actions`, 'POST', { action: 'delete-photo', data: { id: photoId } }, created.body.token)).status, 400);
    assert.equal((await request(`/api/activities/${id}`, 'GET')).status, 401);
    assert.equal((await request(`/api/activities/${id}/requirements`, 'PUT', { origin: M.ORIGINS[0], mode: '步行', preference: '不限', budget: 0 }, 'invalid')).status, 401);
    const repeat = await request('/api/activities/join', 'POST', { code, nickname: '小陈' });
    assert.equal(repeat.status, 400, 'voting still prevents joining');
    const deadline = approved.body.activity.deadline;
    store.settleExpiredRounds(deadline);
    const expired = (await request(historyPath, 'GET', null, joined.body.token)).body.items;
    assert.equal(expired[1].status, 'no-votes');
    assert.equal(expired[1].endedAt, deadline);
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
    assert.equal(simultaneous.find(result => result.status === 400).body.error.code, 'ACTIVITY_FULL');
    assert.equal((await request(`/api/activities/${capActivity.body.activity.id}`, 'GET', null, capActivity.body.token)).body.activity.members.length, 10);
    await new Promise(resolve => server.close(resolve)); store.close();
    store = openStore(filename); server = createServer(store,testMapProvider());
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
    const payload = await response.json();
    return { status: response.status, body: payload.success ? payload.data : payload };
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
    const guest = { body: legacyGuest(path.join(directory, 'test.sqlite'), { title: '游客活动', nickname: '游客昵称' }) };
    assert.equal((await request('/api/account/activities', 'GET', null, accountToken)).body.activities.length, 2);
    const claimed = await request(`/api/activities/${guest.body.activity.id}/claim`, 'POST', { guestToken: guest.body.token }, accountToken);
    assert.equal(claimed.status, 200);
    const retried = await request(`/api/activities/${guest.body.activity.id}/claim`, 'POST', { guestToken: guest.body.token }, accountToken);
    assert.equal(retried.status, 200);
    assert.equal(retried.body.activity.viewerId, claimed.body.activity.viewerId);
    assert.equal(claimed.body.activity.members[0].identityType, 'account');
    assert.equal((await request('/api/account/activities', 'GET', null, accountToken)).body.activities.length, 3);
    assert.equal((await request(`/api/activities/${guest.body.activity.id}`, 'GET', null, guest.body.token)).status, 401);
    assert.equal((await request(`/api/activities/${guest.body.activity.id}`, 'GET', null, accountToken)).status, 200);
    const { randomBytes, createHash } = require('node:crypto');
    const conflictingToken = randomBytes(32).toString('base64url');
    const db = new DatabaseSync(path.join(directory, 'test.sqlite'));
    try {
      const joined = M.act(first.body.activity, null, 'join', { name: '原游客', identityType: 'guest' });
      db.prepare('UPDATE activities SET payload = ? WHERE id = ?').run(JSON.stringify(joined), first.body.activity.id);
      db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(createHash('sha256').update(conflictingToken).digest('hex'), first.body.activity.id, joined.members.at(-1).id);
    } finally { db.close(); }
    assert.equal((await request(`/api/activities/${first.body.activity.id}/claim`, 'POST', { guestToken: conflictingToken }, accountToken)).status, 409);
    assert.equal((await request(`/api/activities/${first.body.activity.id}`, 'GET', null, conflictingToken)).status, 200);
    assert.equal((await request(`/api/activities/${first.body.activity.id}`, 'GET', null, accountToken)).status, 200);
    assert.equal((await request('/api/account/activities', 'GET', null, accountToken)).body.activities.length, 3);
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

test('expired solo guest activity is deleted', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meetpoint-expiry-'));
  const filename = path.join(directory, 'test.sqlite');
  const store = openStore(filename);
  try {
    const result = legacyGuest(filename, { title: '过期测试', nickname: '游客' });
    const db = new DatabaseSync(filename);
    try {
      const activity = JSON.parse(db.prepare('SELECT payload FROM activities WHERE id = ?').get(result.activity.id).payload);
      activity.members[0].lastActiveAt = Date.now() - 2 * 24 * 60 * 60 * 1000;
      db.prepare('UPDATE activities SET payload = ? WHERE id = ?').run(JSON.stringify(activity), activity.id);
      store.pruneExpiredGuests();
      assert.equal(db.prepare('SELECT COUNT(*) AS count FROM sessions WHERE activity_id = ?').get(activity.id).count, 0);
      assert.equal(db.prepare('SELECT id FROM activities WHERE id = ?').get(activity.id), undefined);
      assert.throws(() => store.get(activity.id, result.token), /无效或已过期/);
    } finally { db.close(); }
  } finally { store.close(); fs.rmSync(directory, { recursive: true, force: true }); }
});

test('guests can create, join, restore and claim activities and exercise activity permissions without login', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meetpoint-readonly-'));
  const filename = path.join(directory, 'test.sqlite');
  const store = openStore(filename);
  const guest = legacyGuest(filename, { title: '旧游客活动', nickname: '游客' });
  const id = guest.activity.id;
  const server = createServer(store, testMapProvider());
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const post = (route, body, token, guestToken) => fetch(base + route, {
    method: 'POST', headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
      ...(guestToken ? { 'X-Guest-Identity': guestToken } : {})
    },
    body: JSON.stringify(body)
  });
  try {
    assert.equal(store.get(id, guest.token).activity.title, '旧游客活动');
    assert.deepEqual(store.history(id, guest.token).items, []);
    const createdGuest = await post('/api/activities', { title: '游客聚会', nickname: '发起人' });
    assert.equal(createdGuest.status, 201);
    const host = await createdGuest.json();
    const invitation = { code: host.activity.code, nickname: '伙伴' };
    assert.equal((await post('/api/activities/join', invitation)).status, 401);
    const guestIdentity = await (await post('/api/guest/presence', {})).json();
    const join = () => post('/api/activities/join', invitation, undefined, guestIdentity.token);
    const responses = await Promise.all([join(), join()]);
    assert.deepEqual(responses.map(response => response.status).sort(), [200, 201]);
    const [partner, duplicate] = await Promise.all(responses.map(response => response.json()));
    assert.equal(partner.activity.viewerId, duplicate.activity.viewerId);
    assert.equal(partner.token, duplicate.token);
    assert.equal(duplicate.activity.members.length, 2);
    const sameNameIdentity = await (await post('/api/guest/presence', {})).json();
    const sameName = await post('/api/activities/join', invitation, undefined, sameNameIdentity.token);
    assert.equal(sameName.status, 201);
    const third = await sameName.json();
    assert.notEqual(third.activity.viewerId, partner.activity.viewerId);
    store.act(host.activity.id, host.token, { action: 'remove', data: { id: third.activity.viewerId } });
    assert.notEqual(host.token, partner.token);
    assert.equal(store.get(host.activity.id, host.token).activity.viewerId, host.activity.hostId);
    assert.notEqual(store.get(host.activity.id, partner.token).activity.viewerId, host.activity.hostId);
    assert.ok(partner.activity.members.every(m => m.identityType === 'guest'));
    const activityId = host.activity.id;
    const actions = '/api/activities/' + activityId + '/actions';
    const act = (token, action, data = {}) => post(actions, { action, data }, token);
    for (const [index, token] of [host.token, partner.token].entries()) {
      const response = await fetch(base + '/api/activities/' + activityId + '/requirements', {
        method: 'PUT', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify({ origin: amapOrigin(index), modes: ['步行'], preferences: ['不限'], budget: 100 })
      });
      assert.equal(response.status, 200);
    }
    assert.equal((await act(partner.token, 'rename', { name: '新昵称' })).status, 403);
    assert.equal((await act(partner.token, 'recommend')).status, 403);
    const recommended = await act(host.token, 'recommend');
    assert.equal(recommended.status, 200);
    const ballot = { round: 1, candidateId: (await recommended.json()).data.activity.candidates[0].id };
    const duringVote = await join();
    assert.equal(duringVote.status, 200);
    assert.equal((await duringVote.json()).token, partner.token);
    assert.equal((await act(partner.token, 'vote', ballot)).status, 200);
    const early = await act(host.token, 'finish', { round: 1 });
    assert.equal((await early.json()).error.code, 'NOT_ALL_VOTED');
    assert.equal((await act(host.token, 'vote', ballot)).status, 200);
    assert.ok((await act(partner.token, 'finish', { round: 1 })).status >= 400);
    assert.equal((await (await act(host.token, 'finish', { round: 1 })).json()).data.activity.status, 'completed');
    assert.throws(() => store.requirements(id, partner.token, {}), { status: 401 });
    assert.throws(() => store.uploadPhoto(id, undefined, {}), { status: 401 });
    assert.throws(() => store.authorizeLocation(undefined), { status: 401 });
    store.authorizeLocation(partner.token);
    assert.throws(() => store.listMyFeedback(partner.token), { status: 401 });
    const claimant = store.register({ username: 'guest_claim', password: 'test-password-123' });
    assert.equal(store.claim(activityId, claimant.token, partner.token).activity.viewerId, partner.activity.viewerId);
    const account = store.register({ username: 'readonly_test', password: 'test-password-123' });
    store.claim(id, account.token, guest.token);
    assert.equal(store.act(id, account.token, { action: 'rename', data: { name: '已登录成员' } }).activity.members[0].name, '已登录成员');
    const created = store.create({ title: '账号活动', nickname: '成员' }, account.token);
    assert.equal(created.activity.members[0].identityType, 'account');
  } finally {
    await new Promise(resolve => server.close(resolve));
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('guest reads and presence checks preserve the activity deadline and shared history', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meetpoint-presence-'));
  const filename = path.join(directory, 'test.sqlite');
  const store = openStore(filename);
  const db = new DatabaseSync(filename);
  try {
    const host = store.create({ title: '共享活动', nickname: '原发起人' });
    const partner = store.join({ code: host.activity.code, nickname: '伙伴' });
    const id = host.activity.id;
    const activity = JSON.parse(db.prepare('SELECT payload FROM activities WHERE id = ?').get(id).payload);
    activity.members[0].lastActiveAt = Date.now() - M.DAY;
    activity.members[1].lastActiveAt = Date.now() - M.DAY / 2;
    activity.journal.comments.push({ memberId: activity.hostId, text: '保留的留言' });
    const photoId = crypto.randomUUID();
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aRZkAAAAASUVORK5CYII=', 'base64');
    activity.journal.photos.push({ id: photoId, memberId: activity.hostId, name: '合照.png' });
    db.prepare('INSERT INTO photos VALUES (?, ?, ?, ?, ?)').run(photoId, id, activity.hostId, 'image/png', png);
    activity.candidates = [{ id: 'meeting-place', routes: [] }];
    activity.votes = { [activity.hostId]: 'meeting-place', [partner.activity.viewerId]: 'meeting-place' };
    db.prepare('UPDATE activities SET payload = ? WHERE id = ?').run(JSON.stringify(activity), id);
    assert.throws(() => store.guestActivityStatus(id, host.token));
    const status = store.guestActivityStatus(id, partner.token);
    assert.equal(status.lastActiveAt, activity.members[1].lastActiveAt);
    store.pruneExpiredGuests(status.lastActiveAt + M.DAY - 1);
    const after = store.get(id, partner.token).activity;
    assert.equal(after.hostId, partner.activity.viewerId);
    assert.equal(after.formerMembers[activity.hostId], '原发起人');
    assert.deepEqual(after.journal.comments, activity.journal.comments);
    assert.equal(after.voteStatus.voteCounts['meeting-place'], 2);
    assert.equal(after.voteStatus.currentVoters, 1);
    assert.equal(after.voteStatus.totalMembers, 1);
    assert.equal(after.journal.photos[0].memberId, activity.hostId);
    assert.deepEqual(Buffer.from(store.photo(id, partner.token, photoId).data), png);
    store.pruneExpiredGuests(status.lastActiveAt + M.DAY);
    const archived = JSON.parse(db.prepare('SELECT payload FROM activities WHERE id = ?').get(id).payload);
    assert.equal(archived.status, 'cancelled');
    assert.equal(archived.hostId, null);
  } finally {
    db.close();
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('guest host expiry skips disabled accounts and archives if nobody can take over', () => {
  const store = openStore(':memory:');
  try {
    const admin = store.register({ username: 'admin_expiry', password: 'password123' });
    store.grantAdmin('admin_expiry');
    const member = store.register({ username: 'member_expiry', password: 'password123' });
    const hosts = [0, 1].map(() => store.create({ title: '接任检查', nickname: '游客甲' }));
    for (const host of hosts) store.join({ code: host.activity.code, nickname: '暂时停用' }, member.token);
    const enabled = store.join({ code: hosts[0].activity.code, nickname: '可接任' }, admin.token);
    store.setAccountDisabled(admin.token, 'member_expiry', true);
    store.pruneExpiredGuests(Date.now() + M.DAY + 1);
    assert.equal(store.get(hosts[0].activity.id, admin.token).activity.hostId, enabled.activity.viewerId);
    store.setAccountDisabled(admin.token, 'member_expiry', false);
    const restored = store.login({ username: 'member_expiry', password: 'password123' });
    const archived = store.get(hosts[1].activity.id, restored.token).activity;
    assert.equal(archived.hostId, null);
    assert.equal(archived.status, 'cancelled');
  } finally { store.close(); }
});

test('manual transfer rejects expired or disabled members and keeps the original host', () => {
  const store = openStore(':memory:');
  const realNow = Date.now;
  try {
    const host = store.register({ username: 'host_transfer', password: 'password123' });
    const target = store.register({ username: 'target_transfer', password: 'password123' });
    store.grantAdmin('host_transfer');
    const { activity } = store.create({ title: '权限移交', nickname: '甲' }, host.token);
    const joined = store.join({ code: activity.code, nickname: '乙' }, target.token).activity;
    const transfer = token => store.act(activity.id, token, { action: 'transfer', data: { id: joined.viewerId } });
    store.setAccountDisabled(host.token, 'target_transfer', true);
    assert.deepEqual(store.get(activity.id, host.token).activity.successorIds, []);
    assert.throws(() => transfer(host.token), { status: 409 });
    store.setAccountDisabled(host.token, 'target_transfer', false);
    const start = realNow();
    Date.now = () => start + 6 * M.DAY;
    store.act(activity.id, host.token, { action: 'pause' });
    Date.now = () => start + 8 * M.DAY;
    const login = store.login({ username: 'host_transfer', password: 'password123' });
    assert.throws(() => transfer(login.token), { status: 409 });
    assert.equal(store.get(activity.id, login.token).activity.hostId, activity.hostId);
  } finally { Date.now = realNow; store.close(); }
});

test('guest identity visits do not extend activity deadlines, even across two activities', () => {
  const store = openStore(':memory:'), realNow = Date.now;
  try {
    let now = realNow(); Date.now = () => now;
    const identity = store.visitGuestIdentity();
    assert.equal(identity.expiresAt, now + 7 * M.DAY);
    const a = store.create({ title: '活动甲', nickname: '甲' });
    const b = store.create({ title: '活动乙', nickname: '甲' });
    now += M.DAY - 1000;
    store.get(b.activity.id, b.token);
    store.act(a.activity.id, a.token, { action: 'pause' });
    const visit = store.visitGuestIdentity(identity.token);
    assert.equal(visit.expiresAt, now + 7 * M.DAY);
    now += 1001;
    store.pruneExpiredGuests();
    assert.ok(store.get(a.activity.id, a.token).activity.paused);
    assert.throws(() => store.get(b.activity.id, b.token), { status: 401 });
    assert.ok(visit.expiresAt > now);
    now = visit.expiresAt;
    assert.throws(() => store.visitGuestIdentity(identity.token), { status: 410 });
  } finally { Date.now = realNow; store.close(); }
});

test('disabled accounts do not block recommendation or early finish and recovery restores eligibility', async () => {
  const store = openStore(':memory:');
  try {
    const admin = store.register({ username: 'admin_test', password: 'password123' });
    store.grantAdmin('admin_test');
    const account = store.register({ username: 'member_test', password: 'password123' });
    const host = store.create({ title: '聚餐', nickname: '甲' });
    const id = host.activity.id;
    const partner = store.join({ code: host.activity.code, nickname: '乙' });
    store.join({ code: host.activity.code, nickname: '丙' }, account.token);
    for (const [index, member] of [host, partner].entries())
      store.requirements(id, member.token, { origin: amapOrigin(index), mode: '步行', preference: '不限', budget: 100 });
    store.setAccountDisabled(admin.token, 'member_test', true);
    const { activity } = await store.recommendLive(id, host.token, testMapProvider());
    assert.equal(activity.members.length, 3);
    assert.equal(activity.recommendationProgress.total, 2);
    const data = { round: 1, candidateId: activity.candidates[0].id };
    for (const member of [host, partner]) store.act(id, member.token, { action: 'vote', data });
    store.setAccountDisabled(admin.token, 'member_test', false);
    const finish = () => store.act(id, host.token, { action: 'finish', data: { round: 1 } });
    assert.throws(finish, { code: 'NOT_ALL_VOTED' });
    store.setAccountDisabled(admin.token, 'member_test', true);
    assert.equal(finish().activity.winningCandidateId, data.candidateId);
  } finally { store.close(); }
});

test('a surviving guest can finish the existing round after inheriting it', async () => {
  const store = openStore(':memory:'), realNow = Date.now;
  try {
    let now = realNow(); Date.now = () => now;
    const host = store.create({ title: '聚餐', nickname: '甲' });
    const partner = store.join({ code: host.activity.code, nickname: '乙' });
    const id = host.activity.id;
    for (const [index, member] of [host, partner].entries())
      store.requirements(id, member.token, { origin: amapOrigin(index), mode: '步行', preference: '不限', budget: 100 });
    const { activity } = await store.recommendLive(id, host.token, testMapProvider());
    store.act(id, host.token, { action: 'pause' });
    now += M.DAY / 2;
    store.act(id, partner.token, { action: 'comment', data: { text: '明天见' } });
    now += M.DAY / 2;
    store.pruneExpiredGuests(now);
    store.act(id, partner.token, { action: 'resume' });
    const finish = () => store.act(id, partner.token, { action: 'finish', data: { round: 1 } });
    assert.throws(finish, { code: 'NOT_ALL_VOTED' });
    const candidateId = activity.candidates[0].id;
    store.act(id, partner.token, { action: 'vote', data: { round: 1, candidateId } });
    assert.equal(finish().activity.winningCandidateId, candidateId);
  } finally { Date.now = realNow; store.close(); }
});

test('cleanup preserves a vote that reached its deadline before the last guest expired', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meetpoint-deadline-'));
  const filename = path.join(directory, 'test.sqlite');
  const store = openStore(filename), db = new DatabaseSync(filename), realNow = Date.now;
  try {
    let now = realNow(); Date.now = () => now;
    const host = store.create({ title: '聚餐', nickname: '甲' });
    const partner = store.join({ code: host.activity.code, nickname: '乙' });
    const id = host.activity.id;
    for (const [index, member] of [host, partner].entries())
      store.requirements(id, member.token, { origin: amapOrigin(index), mode: '步行', preference: '不限', budget: 100 });
    const { activity } = await store.recommendLive(id, host.token, testMapProvider());
    now += 1000;
    const candidateId = activity.candidates[0].id;
    store.act(id, partner.token, { action: 'vote', data: { round: 1, candidateId } });
    now += M.DAY;
    store.pruneExpiredGuests(now);
    const after = JSON.parse(db.prepare('SELECT payload FROM activities WHERE id = ?').get(id).payload);
    assert.equal(after.winningCandidateId, candidateId);
    assert.equal(after.status, 'completed');
    assert.equal(after.roundHistory[0].endedAt, activity.deadline);
  } finally {
    Date.now = realNow; db.close(); store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('an active guest inherits management from an expired account host', () => {
  const store = openStore(':memory:'), realNow = Date.now;
  try {
    let now = realNow(); Date.now = () => now;
    const host = store.register({ username: 'old_host', password: 'password123' });
    const { activity } = store.create({ title: '混合活动', nickname: '发起者' }, host.token);
    now += 6.5 * M.DAY;
    const guest = store.join({ code: activity.code, nickname: '游客' });
    now += 0.5 * M.DAY;
    const view = store.get(activity.id, guest.token).activity;
    assert.equal(view.hostId, guest.activity.viewerId);
    assert.equal(view.members.length, 2);
    assert.equal(store.act(activity.id, guest.token, { action: 'pause' }).activity.paused, true);
  } finally { Date.now = realNow; store.close(); }
});

test('a disabled member frees a seat and restoration requires available capacity', () => {
  const store = openStore(':memory:');
  try {
    const admin = store.register({ username: 'capacity_admin', password: 'password123' });
    store.grantAdmin('capacity_admin');
    const account = store.register({ username: 'capacity_member', password: 'password123' });
    const host = store.create({ title: '人数上限', nickname: '发起者' });
    const { id, code } = host.activity;
    store.join({ code, nickname: '账号成员' }, account.token);
    for (let i = 0; i < 8; i++) store.join({ code, nickname: '游客' + i });
    store.setAccountDisabled(admin.token, 'capacity_member', true);
    const entrant = store.join({ code, nickname: '新成员' });
    assert.equal(entrant.activity.voteStatus.totalMembers, 10);
    assert.throws(() => store.setAccountDisabled(admin.token, 'capacity_member', false), { status: 409 });
    store.act(id, entrant.token, { action: 'leave' });
    assert.equal(store.setAccountDisabled(admin.token, 'capacity_member', false).disabled, false);
    assert.equal(store.get(id, host.token).activity.voteStatus.totalMembers, 10);
  } finally { store.close(); }
});

test('a guest can recover a creation response with the same request ID', () => {
  const store = openStore(':memory:');
  try {
    const identity = store.visitGuestIdentity().token;
    const input = { title: '同名活动', nickname: '甲', requestId: crypto.randomUUID() };
    const first = store.create(input, undefined, identity);
    const retry = store.create(input, undefined, identity);
    assert.equal(retry.activity.id, first.activity.id);
    assert.equal(retry.token, first.token);
    assert.throws(() => store.create({ ...input, title: '不同内容' }, undefined, identity), { status: 409 });
    const second = store.create({ ...input, requestId: crypto.randomUUID() }, undefined, identity);
    assert.notEqual(second.activity.id, first.activity.id);
  } finally { store.close(); }
});

test('a solo guest invitation stops accepting members at expiry before scheduled cleanup', () => {
  const store = openStore(':memory:'), realNow = Date.now;
  try {
    let now = realNow();
    Date.now = () => now;
    const hostIdentity = store.visitGuestIdentity().token;
    const guestIdentity = store.visitGuestIdentity().token;
    const account = store.register({ username: 'expiry_join', password: 'password123' });
    const create = title => store.create({ title, nickname: '甲' }, undefined, hostIdentity).activity;
    const expired = create('到期活动');
    const shared = create('已有人加入的活动');
    now += M.DAY - 1;
    const joined = store.join({ code: shared.code, nickname: '乙' }, undefined, guestIdentity);
    now += 1;
    const invitation = { code: expired.code, nickname: '乙' };
    assert.throws(() => store.join(invitation, undefined, guestIdentity), { status: 410 });
    assert.throws(() => store.join(invitation, account.token), { status: 410 });
    store.pruneExpiredGuests();
    assert.throws(() => store.join(invitation, undefined, guestIdentity), { status: 404 });
    assert.equal(store.get(shared.id, joined.token).activity.hostId, joined.activity.viewerId);
  } finally { Date.now = realNow; store.close(); }
});
