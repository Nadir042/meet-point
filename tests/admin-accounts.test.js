'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
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
