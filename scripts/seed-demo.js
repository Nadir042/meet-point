'use strict';
if (process.env.NODE_ENV === 'production') {
  console.error('拒绝在生产环境生成演示账号');
  process.exit(1);
}
const { openStore } = require('../shared-store');
const { DEMO_MARKER, DEMO_USERNAME, DEMO_PASSWORD, buildDemoActivities } = require('../demo-data');

const store = openStore();
try {
  const entries = buildDemoActivities();
  const result = store.replaceDemoAccount({
    marker: DEMO_MARKER,
    username: DEMO_USERNAME,
    password: DEMO_PASSWORD,
    entries
  });
  console.log(`演示账号已生成：${result.username}，${result.activities} 场活动`);
  console.log('登录密码：MeetPointDemo2026!（仅限本地演示）');
} finally {
  store.close();
}
