'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { createServer } = require('../server');
const { openStore } = require('../shared-store');

test('管理员精确查询、停用和恢复账号，原活动保留且所有旧会话失效', t => {
  const store = openStore(':memory:');
  t.after(() => store.close());
  const password = 'password123';
  const owner = store.register({ username: 'admin', password });
  const user = { username: 'member', password };
  const first = store.register(user).token;
  const second = store.login(user).token;
  const { activity } = store.create({ title: '聚会', nickname: '小陈' }, first);
  store.grantAdmin(owner.account.username);
  const admin = store.login({ username: 'admin', password }).token;
  assert.throws(() => store.lookupAccount(first, user.username), { status: 403 });
  assert.throws(() => store.lookupAccount(admin, 'mem'), { status: 404 });
  assert.equal(store.lookupAccount(admin, user.username).disabled, false);
  for (const disabled of [true, false])
    assert.throws(() => store.setAccountDisabled(first, user.username, disabled), { status: 403 });
  assert.throws(() => store.setAccountDisabled(admin, 'admin', true), { status: 403 });
  store.setAccountDisabled(admin, user.username, true);
  assert.equal(store.lookupAccount(admin, user.username).disabled, true);
  assert.throws(() => store.login(user), { status: 403 });
  assert.throws(() => store.get(activity.id, first), { status: 401 });
  store.setAccountDisabled(admin, user.username, false);
  for (const token of [first, second])
    assert.throws(() => store.account(token), { status: 401 });
  assert.equal(store.listAccountActivities(store.login(user).token).activities[0].id, activity.id);
});

test('管理员只能巡查目标账号参与的活动及目标账号发布的手账内容', t => {
  const store = openStore(':memory:');
  t.after(() => store.close());
  const password = 'password123';
  const { token: admin } = store.register({ username: 'admin', password });
  store.grantAdmin('admin');
  const { token: target } = store.register({ username: 'target', password });
  const { token: partner } = store.register({ username: 'partner', password });
  const { activity } = store.create({ title: '聚会', nickname: '同行人' }, partner);
  store.join({ code: activity.code, nickname: '目标成员' }, target);
  store.act(activity.id, target, { action: 'feeling', data: { text: '我的感想' } });
  store.act(activity.id, partner, { action: 'comment', data: { text: '其他成员留言' } });
  const upload = (token, name) => {
    const id = randomUUID();
    const base64 = fs.readFileSync(path.join(__dirname, '..', 'assets', 'workspace-graduate.png')).toString('base64');
    store.uploadPhoto(activity.id, token, { id, name, mime: 'image/png', base64 });
    return id;
  };
  const targetPhoto = upload(target, '目标照片');
  const otherPhoto = upload(partner, '其他成员照片');
  store.setAccountDisabled(admin, 'target', true);

  assert.throws(() => store.reviewAccountActivities(partner, 'target'), { status: 403 });
  assert.throws(() => store.reviewAccountPhoto(partner, 'target', activity.id, targetPhoto), { status: 403 });
  const [review] = store.reviewAccountActivities(admin, 'target').activities;
  assert.equal(review.title, '聚会');
  assert.equal(review.nickname, '目标成员');
  assert.deepEqual(review.feelings, [{ text: '我的感想' }]);
  assert.deepEqual(review.comments, []);
  assert.deepEqual(review.photos, [{ id: targetPhoto, name: '目标照片' }]);
  assert.equal(Object.hasOwn(review, 'members'), false);
  assert.equal(Object.hasOwn(review, 'code'), false);
  assert.equal(store.reviewAccountPhoto(admin, 'target', activity.id, targetPhoto).mime, 'image/png');
  assert.throws(() => store.reviewAccountPhoto(admin, 'target', activity.id, otherPhoto), { status: 404 });
});

test('反馈由服务端保存，只有管理员可查看全部用户的反馈', t => {
  const store = openStore(':memory:');
  t.after(() => store.close());
  const password = 'password123';
  const admin = store.register({ username: 'admin', password });
  const member = store.register({ username: 'member', password });
  const other = store.register({ username: 'other', password });
  store.grantAdmin('admin');
  const submitted = store.submitFeedback(member.token, { category: '功能建议', content: '希望增加提醒' });
  assert.equal(submitted.status, '待处理');
  assert.equal(store.listMyFeedback(store.login({ username: 'member', password }).token).items[0].id, submitted.id);
  assert.deepEqual(store.listMyFeedback(other.token).items, []);
  assert.throws(() => store.listAdminFeedback(member.token), { status: 403 });
  assert.deepEqual(store.listAdminFeedback(admin.token).items.map(item => item.username), ['member']);
  assert.throws(() => store.submitFeedback(member.token, { category: '功能建议', content: 'x'.repeat(1001) }), { status: 400 });
});

test('管理员更新反馈后，只有对应提交人能在我的反馈看到新状态', async t => {
  const store = openStore(':memory:');
  const server = createServer(store, {});
  t.after(async () => {
    await new Promise(resolve => server.close(resolve));
    store.close();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const request = (path, token, method = 'GET', body) => fetch(base + path, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { 'Content-Type': 'application/json' } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const password = 'password123';
  const admin = store.register({ username: 'admin', password }).token;
  const author = store.register({ username: 'author', password }).token;
  const other = store.register({ username: 'other', password }).token;
  store.grantAdmin('admin');
  store.create({ title: '聚会', nickname: '发起人' }, author);

  const submitted = await request('/api/feedback', author, 'POST', { category: '功能建议', content: '希望增加提醒' });
  assert.equal(submitted.status, 201);
  const { id } = await submitted.json();
  const url = `/api/admin/feedback/${id}`;
  const resolved = { status: '已处理' };

  assert.equal((await request(url, null, 'PATCH', resolved)).status, 401);
  assert.equal((await request(url, author, 'PATCH', resolved)).status, 403);
  assert.equal((await request(url, admin, 'PATCH', { status: '未知状态' })).status, 400);
  assert.equal((await request(`/api/admin/feedback/${randomUUID()}`, admin, 'PATCH', resolved)).status, 404);
  assert.equal((await (await request('/api/feedback', author)).json()).items[0].status, '待处理');

  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await request(url, admin, 'PATCH', resolved);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { id, ...resolved });
  }
  assert.equal((await (await request('/api/admin/feedback', admin)).json()).items[0].status, '已处理');
  assert.equal((await (await request('/api/feedback', author)).json()).items[0].status, '已处理');
  assert.deepEqual((await (await request('/api/feedback', other)).json()).items, []);
});
