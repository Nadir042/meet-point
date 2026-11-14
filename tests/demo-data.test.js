'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const M = require('../core');
const { openStore } = require('../shared-store');
const { DEMO_MARKER, DEMO_USERNAME, DEMO_PASSWORD, buildDemoActivities } = require('../demo-data');

const NOW = Date.parse('2026-11-13T12:00:00+08:00');

test('full demo data covers workflow states, recommendation groups and every built-in POI', () => {
  const entries = buildDemoActivities(NOW);
  assert.equal(entries.length, 8);
  assert.deepEqual(new Set(entries.map(entry => entry.activity.status)), new Set(['collecting', 'voting', 'completed', 'no-votes', 'cancelled']));
  assert.ok(entries.some(entry => entry.activity.paused));
  assert.deepEqual(
    [...new Set(entries.flatMap(entry => entry.activity.candidates.map(candidate => candidate.id)))].sort(),
    M.POIS.map(candidate => candidate.id).sort()
  );
  const mapped = entries.find(entry => entry.activity.title.includes('完整地图')).activity;
  for (const group of M.GROUPS) assert.equal(mapped.groups[group.id].length, 3);
  assert.ok(mapped.members.some(member => member.shared));
  assert.ok(mapped.members.some(member => !member.shared));
});

test('recommendation progress distinguishes missing members, incomplete requirements and ready data', () => {
  const entries = buildDemoActivities(NOW);
  assert.deepEqual(M.recommendationProgress(entries[0].activity), { total: 1, readyCount: 1, stage: 'members' });
  assert.deepEqual(M.recommendationProgress(entries[1].activity), { total: 4, readyCount: 3, stage: 'requirements' });
  assert.deepEqual(M.recommendationProgress(entries[2].activity), { total: 3, readyCount: 3, stage: 'ready' });
});

test('demo account replacement is idempotent and refuses to overwrite an ordinary account', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meetpoint-demo-data-'));
  const store = openStore(path.join(directory, 'test.sqlite'));
  try {
    const input = { marker: DEMO_MARKER, username: DEMO_USERNAME, password: DEMO_PASSWORD, entries: buildDemoActivities(NOW) };
    assert.equal(store.replaceDemoAccount(input).activities, 8);
    assert.equal(store.replaceDemoAccount(input).activities, 8);
    const session = store.login({ username: DEMO_USERNAME, password: DEMO_PASSWORD });
    const activities = store.listAccountActivities(session.token).activities;
    assert.equal(activities.length, 8);
    assert.ok(activities.every(activity => activity.demoSeed === DEMO_MARKER));

    store.register({ username: 'reserved_demo', password: 'ordinary-password' });
    assert.throws(() => store.replaceDemoAccount({ ...input, username: 'reserved_demo' }), /不是可替换的演示账号/);
  } finally {
    store.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
