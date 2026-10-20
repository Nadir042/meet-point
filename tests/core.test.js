'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../core.js');
const NOW = 1800000000000;
const seeded = () => M.seed(NOW);
function prepared() {
  let a = M.createActivity('测试活动', '发起人', '聚餐', NOW);
  a = M.act(a, null, 'join', { name: '参与者' }, NOW);
  for (const [i, m] of a.members.entries()) a = M.act(a, m.id, 'requirements', { originIndex: i, mode: '公共交通', preference: '不限', budget: 100, shared: i === 0 }, NOW);
  return a;
}
test('create, join, complete requirements and open a 24-hour round', () => {
  let a = prepared();
  assert.equal(M.ready(a), true);
  a = M.act(a, a.hostId, 'recommend', {}, NOW);
  assert.equal(a.status, 'voting');
  assert.equal(a.deadline, NOW + M.DAY);
  assert.equal(a.candidates.length, 3);
  assert.equal(new Set(a.candidates.map(p => p.id)).size, 3);
  for (const p of a.candidates) {
    assert.ok(p.score >= 0 && p.score <= 10);
    assert.equal(p.routes.length, 2);
    assert.ok(p.routes.every(r => r.cost === null));
  }
});
test('a single member or incomplete requirements blocks recommendations', () => {
  let a = M.createActivity('活动', '发起人', '聚餐', NOW);
  assert.throws(() => M.act(a, a.hostId, 'recommend', {}, NOW), /2—10/);
  a = M.act(a, null, 'join', { name: '伙伴' }, NOW);
  assert.throws(() => M.act(a, a.hostId, 'recommend', {}, NOW), /需求/);
});
test('activity is capped at ten members and duplicate names are rejected', () => {
  let a = prepared();
  assert.throws(() => M.act(a, null, 'join', { name: '参与者' }, NOW), /昵称/);
  for (let i = 2; i < 10; i++) a = M.act(a, null, 'join', { name: `成员${i}` }, NOW);
  assert.equal(a.members.length, 10);
  assert.throws(() => M.act(a, null, 'join', { name: '第十一人' }, NOW), /10/);
});
test('changing a vote replaces the previous vote, it does not add one', () => {
  let a = seeded();
  a = M.act(a, a.hostId, 'vote', { id: a.candidates[0].id }, NOW);
  a = M.act(a, a.hostId, 'vote', { id: a.candidates[1].id }, NOW + 1);
  assert.equal(Object.keys(a.votes).length, 3);
  assert.equal(M.tally(a)[a.candidates[0].id], 1);
  assert.equal(M.tally(a)[a.candidates[1].id], 2);
});
test('invalid voters, candidates and non-host management are rejected', () => {
  const a = seeded(), other = a.members[1].id;
  assert.throws(() => M.act(a, 'stranger', 'vote', { id: a.candidates[0].id }, NOW), /身份/);
  assert.throws(() => M.act(a, other, 'vote', { id: 'old-round-poi' }, NOW), /本轮/);
  for (const action of ['pause', 'cancel', 'recommend', 'finish', 'transfer']) assert.throws(() => M.act(a, other, action, {}, NOW), /发起者/);
});
test('membership is frozen throughout voting, including paused voting', () => {
  const a = seeded();
  assert.throws(() => M.act(a, null, 'join', { name: '新伙伴' }, NOW), /投票期间/);
  assert.throws(() => M.act(a, a.members[1].id, 'leave', {}, NOW), /投票期间/);
  assert.throws(() => M.act(a, a.hostId, 'remove', { id: a.members[1].id }, NOW), /投票期间/);
  const paused = M.act(a, a.hostId, 'pause', {}, NOW);
  assert.throws(() => M.act(paused, null, 'join', { name: '新伙伴' }, NOW), /暂停/);
});
test('pause freezes the deadline; resume preserves exactly the remaining time', () => {
  const a = seeded();
  const paused = M.act(a, a.hostId, 'pause', {}, NOW + 3000);
  assert.equal(paused.remaining, M.DAY - 3000);
  const muchLater = M.tick(paused, NOW + M.DAY * 3);
  assert.equal(muchLater.status, 'voting');
  assert.throws(() => M.act(paused, a.hostId, 'vote', { id: a.candidates[0].id }, NOW + 5000), /暂停/);
  assert.throws(() => M.act(paused, a.hostId, 'recommend', {}, NOW + 5000), /暂停/);
  const resumed = M.act(muchLater, a.hostId, 'resume', {}, NOW + M.DAY * 3);
  assert.equal(resumed.deadline, NOW + M.DAY * 4 - 3000);
  assert.deepEqual(resumed.votes, a.votes);
});
test('early finish requires all votes; a tie uses original ranking', () => {
  let a = seeded();
  assert.throws(() => M.act(a, a.hostId, 'finish', {}, NOW), /全员/);
  a = M.act(a, a.hostId, 'vote', { id: a.candidates[0].id }, NOW);
  a = M.act(a, a.members[3].id, 'vote', { id: a.candidates[1].id }, NOW);
  a = M.act(a, a.hostId, 'finish', {}, NOW);
  assert.equal(a.resultId, a.candidates[0].id);
  assert.equal(a.status, 'completed');
});
test('deadline automatically counts votes; no final change is allowed', () => {
  const a = seeded(), done = M.tick(a, a.deadline);
  assert.equal(done.status, 'completed');
  assert.equal(done.resultId, a.candidates[0].id);
  assert.throws(() => M.act(a, a.hostId, 'vote', { id: a.candidates[2].id }, a.deadline), /结束/);
  for (const action of ['recommend', 'cancel', 'requirements', 'transfer']) assert.throws(() => M.act(done, done.hostId, action, {}, a.deadline), /结束/);
});
test('zero votes at deadline produces no result; revote starts a fresh 24 hours', () => {
  let a = prepared();
  a = M.act(a, a.hostId, 'recommend', {}, NOW);
  a = M.tick(a, NOW + M.DAY);
  assert.equal(a.status, 'no-votes');
  assert.equal(a.resultId, null);
  const candidates = JSON.stringify(a.candidates);
  a = M.act(a, a.hostId, 'revote', {}, NOW + M.DAY + 5000);
  assert.equal(a.round, 2);
  assert.equal(a.deadline, NOW + M.DAY * 2 + 5000);
  assert.deepEqual(a.votes, {});
  assert.equal(JSON.stringify(a.candidates), candidates);
});
test('requirements never mutate a voting snapshot; approved refresh clears all old votes', () => {
  let a = seeded();
  const original = JSON.stringify(a.candidates);
  a = M.act(a, a.members[1].id, 'requirements', { originIndex: 6, mode: '步行', preference: '火锅', budget: 80, shared: false }, NOW);
  assert.equal(JSON.stringify(a.candidates), original);
  a = M.act(a, a.members[1].id, 'request', {}, NOW);
  assert.equal(a.requests.length, 1);
  a = M.act(a, a.hostId, 'recommend', {}, NOW + 5000);
  assert.equal(a.round, 2);
  assert.deepEqual(a.votes, {});
  assert.deepEqual(a.requests, []);
  assert.notEqual(JSON.stringify(a.candidates), original);
});
test('transfer preserves membership and votes and immediately changes management rights', () => {
  const a = seeded(), next = a.members[1].id;
  const transferred = M.act(a, a.hostId, 'transfer', { id: next }, NOW);
  assert.equal(transferred.hostId, next);
  assert.deepEqual(transferred.members, a.members);
  assert.deepEqual(transferred.votes, a.votes);
  assert.throws(() => M.act(transferred, a.hostId, 'pause', {}, NOW), /发起者/);
  assert.equal(M.act(transferred, next, 'pause', {}, NOW).paused, true);
});
test('private origin is absent from another member projection but visible to its owner', () => {
  const a = seeded(), privateMember = a.members[2];
  const projected = M.visibleMembers(a, a.hostId);
  assert.equal(projected[2].origin, null);
  assert.ok(projected[0].origin);
  assert.deepEqual(M.visibleMembers(a, privateMember.id)[2].origin, privateMember.origin);
  assert.ok(a.members[2].origin, 'projection must not mutate original data');
});
test('cancelled activity is terminal and does not settle later', () => {
  const a = seeded(), cancelled = M.act(a, a.hostId, 'cancel', {}, NOW);
  assert.equal(M.tick(cancelled, NOW + M.DAY * 2).status, 'cancelled');
  assert.throws(() => M.act(cancelled, a.hostId, 'recommend', {}, NOW), /结束/);
});
test('activity types filter available candidates', () => {
  let a = prepared(); a.type = '休闲娱乐';
  a = M.act(a, a.hostId, 'recommend', {}, NOW);
  assert.ok(a.candidates.every(p => p.tags.includes('休闲娱乐')));
  a = prepared(); a.type = '线下会面';
  a = M.act(a, a.hostId, 'recommend', {}, NOW);
  assert.ok(a.candidates.every(p => p.tags.includes('线下会面')));
});
