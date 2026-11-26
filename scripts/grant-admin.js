'use strict';
const { openStore } = require('../shared-store');
const store = openStore();
try {
  store.grantAdmin(process.argv[2]);
  console.log('管理员已设置，重新登录后可进入账号管理。');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  store.close();
}
