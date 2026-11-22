'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
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
    store.uploadPhoto(activity.id, token, { id, name, mime: 'image/png', base64: 'iVBORw0KGgo=' });
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

test('反馈由服务端保存且只对提交账号可见', t => {
  const store = openStore(':memory:');
  t.after(() => store.close());
  const password = 'password123';
  const admin = store.register({ username: 'admin', password });
  const member = store.register({ username: 'member', password });
  const other = store.register({ username: 'other', password });
  const submitted = store.submitFeedback(member.token, { category: '功能建议', content: '希望增加提醒' });
  assert.equal(submitted.status, '待处理');
  assert.equal(store.listMyFeedback(store.login({ username: 'member', password }).token).items[0].id, submitted.id);
  assert.deepEqual(store.listMyFeedback(other.token).items, []);
  assert.throws(() => store.submitFeedback(member.token, { category: '功能建议', content: 'x'.repeat(1001) }), { status: 400 });
});
