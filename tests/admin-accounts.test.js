'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { openStore } = require('../shared-store');

test('只有管理员可以按完整账号名查询账号', t => {
  const store = openStore(':memory:');
  t.after(() => store.close());
  const password = 'password123';
  const adminAccount = store.register({ username: 'admin', password });
  const user = store.register({ username: 'member', password });
  store.grantAdmin('admin');
  const admin = store.login({ username: 'admin', password });
  assert.equal(admin.account.admin, true);
  assert.equal(store.account(admin.token).account.admin, true);
  assert.deepEqual(store.lookupAccount(admin.token, 'member'), { username: 'member', disabled: false, admin: false });
  assert.throws(() => store.lookupAccount(user.token, 'member'), { status: 403 });
  assert.throws(() => store.lookupAccount(admin.token, 'mem'), { status: 404 });
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
