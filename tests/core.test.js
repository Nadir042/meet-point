'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../core.js');
const NOW = 1800000000000;
const seeded = () => M.seed(NOW);
function prepared() {
  let a = M.createActivity('测试活动', '发起人', '聚餐', NOW);
  a = M.act(a, null, 'join', { name: '参与者' }, NOW);
  for (const [i, m] of a.members.entries()) a = M.act(a, m.id, 'requirements', { origin: M.ORIGINS[i], mode: '公共交通', preference: '不限', budget: 100, shared: i === 0 }, NOW);
  return a;
}
test('navigation URLs preserve endpoints and translate every supported travel mode', () => {
  const origin={name:'徐家汇',lng:121.4365,lat:31.1956};
  const destination={name:'新天地',lng:121.4752,lat:31.2194};
  for (const [mode,expected] of [['公共交通','bus'],['驾车','car'],['步行','walk'],['骑行','ride']]) {
    const url=new URL(M.navigationUrl(origin,destination,mode));
    assert.equal(url.origin,'https://uri.amap.com');
    assert.equal(url.pathname,'/navigation');
    assert.equal(url.searchParams.get('from'),'121.4365,31.1956,徐家汇');
    assert.equal(url.searchParams.get('to'),'121.4752,31.2194,新天地');
    assert.equal(url.searchParams.get('mode'),expected);
    assert.equal(url.searchParams.get('coordinate'),'gaode');
    assert.equal(url.searchParams.get('src'),'MeetPoint');
  }
  assert.throws(()=>M.navigationUrl(origin,destination,'飞行'),/交通方式/);
});
test('create, join, complete requirements and open a 24-hour round', () => {
  let a = prepared();
  assert.equal(M.ready(a), true);
  a = M.act(a, a.hostId, 'recommend', {}, NOW);
  assert.equal(a.status, 'voting');
  assert.equal(a.deadline, NOW + M.DAY);
  assert.ok(a.candidates.length >= 3 && a.candidates.length <= 9);
  assert.equal(new Set(a.candidates.map(p => p.id)).size, a.candidates.length);
  for (const group of M.GROUPS) {
    assert.equal(a.groups[group.id].length, 3);
    assert.equal(new Set(a.groups[group.id]).size, 3);
  }
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
test('activity preferences use the confirmed lists and validate custom details', () => {
  assert.deepEqual(M.OPTIONS['聚餐'], ['不限', '火锅', '烧烤', '中餐', '西餐', '咖啡甜品', '其他']);
  assert.deepEqual(M.OPTIONS['休闲娱乐'], ['不限', 'KTV', '桌游', '电影院', '公园', '商场', '剧本杀', '密室逃脱', '美甲', '手工', '写真', '其他']);
  assert.deepEqual(M.OPTIONS['线下会面'], ['不限', '学习讨论', '工作交流', '朋友会面', '逛街', '其他']);

  let activity = M.createActivity('自定义偏好', '发起人', '聚餐', NOW);
  const input = { origin: M.ORIGINS[0], mode: '公共交通', preference: '其他', preferenceDetail: '清真餐厅', budget: 100, shared: false };
  activity = M.act(activity, activity.hostId, 'requirements', input, NOW);
  assert.equal(activity.members[0].preference, '清真餐厅');
  assert.throws(() => M.act(activity, activity.hostId, 'requirements', { ...input, preferenceDetail: '' }, NOW), /其他偏好/);
  assert.throws(() => M.act(activity, activity.hostId, 'requirements', { ...input, preferenceDetail: '超'.repeat(21) }, NOW), /20/);
  assert.throws(() => M.act(activity, activity.hostId, 'requirements', { ...input, preference: 'KTV' }, NOW), /活动偏好/);
});
test('activity is capped at ten members and repeated names get local suffixes', () => {
  let a = prepared();
  a = M.act(a, null, 'join', { name: '参与者' }, NOW);
  assert.equal(a.members.at(-1).name, '参与者（2）');
  a = M.act(a, null, 'join', { name: '参与者' }, NOW);
  assert.equal(a.members.at(-1).name, '参与者（3）');
  for (let i = 4; i < 10; i++) a = M.act(a, null, 'join', { name: `成员${i}` }, NOW);
  assert.equal(a.members.length, 10);
  assert.throws(() => M.act(a, null, 'join', { name: '第十一人' }, NOW), /10/);
});
test('members can rename themselves without changing identity or taking another name', () => {
  let a = prepared();
  const memberId = a.members[1].id;
  a = M.act(a, memberId, 'rename', { name: '发起人' }, NOW);
  assert.equal(a.members[1].name, '发起人（2）');
  assert.equal(a.members[1].id, memberId);
  assert.equal(a.hostId, a.members[0].id);
  assert.throws(() => M.act(a, memberId, 'rename', { name: '' }, NOW), /昵称/);
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
  assert.equal(paused.remainingMs, M.DAY - 3000);
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
  assert.equal(a.winningCandidateId, a.candidates[0].id);
  assert.equal(a.status, 'completed');
});
test('deadline automatically counts votes; no final change is allowed', () => {
  const a = seeded(), done = M.tick(a, a.deadline);
  assert.equal(done.status, 'completed');
  assert.equal(done.winningCandidateId, a.candidates[0].id);
  assert.throws(() => M.act(a, a.hostId, 'vote', { id: a.candidates[2].id }, a.deadline), /结束/);
  for (const action of ['recommend', 'cancel', 'requirements', 'transfer']) assert.throws(() => M.act(done, done.hostId, action, {}, a.deadline), /结束/);
});
test('zero votes at deadline produces no result; revote starts a fresh 24 hours', () => {
  let a = prepared();
  a = M.act(a, a.hostId, 'identity-type', { identityType: 'account' }, NOW);
  a = M.act(a, a.hostId, 'recommend', {}, NOW);
  a = M.tick(a, NOW + M.DAY);
  assert.equal(a.status, 'no-votes');
  assert.equal(a.winningCandidateId, null);
  const candidates = a.candidates;
  a = M.act(a, a.hostId, 'revote', {}, NOW + M.DAY + 5000);
  assert.equal(a.round, 2);
  assert.equal(a.deadline, NOW + M.DAY * 2 + 5000);
  assert.deepEqual(a.votes, {});
  assert.deepEqual(a.candidates, candidates.map(p => ({ ...p, id: 'c_2_' + p.placeId, round: 2 })));
  assert.deepEqual(a.roundHistory.map(h => h.status), ['no-votes']);
  assert.throws(() => M.act(a, a.hostId, 'vote', { round: 1, candidateId: candidates[0].id }, NOW + M.DAY + 5000), { code: 'ROUND_STALE' });
});
test('requirements never mutate a voting snapshot; approved refresh clears all old votes', () => {
  let a = seeded();
  const original = JSON.stringify(a.candidates);
  a = M.act(a, a.members[1].id, 'requirements', { origin: M.ORIGINS[6], mode: '步行', preference: '火锅', budget: 80, shared: false }, NOW);
  assert.equal(JSON.stringify(a.candidates), original);
  a = M.act(a, a.members[1].id, 'request', {}, NOW);
  assert.equal(a.requests.length, 1);
  const data = { requestId: a.requests[0].id, decision: 'approved' };
  const incomplete = structuredClone(a);
  incomplete.members[1].origin = null;
  assert.throws(() => M.act(incomplete, a.hostId, 'review-request', data, NOW + 5000), /需求/);
  assert.equal(incomplete.requests[0].status, 'pending');
  assert.deepEqual(incomplete.votes, a.votes);
  const oldCounts = M.tally(a);
  a = M.act(a, a.hostId, 'review-request', data, NOW + 5000);
  assert.equal(a.roundHistory[0].status, 'superseded');
  assert.deepEqual(a.roundHistory[0].voteCounts, oldCounts);
  assert.equal(Object.hasOwn(a.roundHistory[0], 'votes'), false);
  assert.equal(a.round, 2);
  assert.deepEqual(a.votes, {});
  assert.equal(a.requests[0].status, 'approved');
  assert.equal(a.requests[0].round, 1);
  assert.equal(a.requests[0].handledAt, NOW + 5000);
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

test('three groups have distinct priority order and share a single vote pool', () => {
  const a = seeded(), byId = id => a.candidates.find(p => p.id === id);
  for (const [id, dimension] of [['fairness', 'fairness'], ['preference', 'preference'], ['convenience', 'convenience']]) {
    const scores = a.groups[id].map(pid => byId(pid).dimensions[dimension]);
    assert.deepEqual(scores, [...scores].sort((x, y) => y - x));
  }
  const shared = a.groups.fairness.find(id => a.groups.preference.includes(id));
  assert.ok(shared);
  const voted = M.act(a, a.hostId, 'vote', { id: shared }, NOW);
  assert.equal(Object.keys(voted.votes).length, 3);
  assert.ok(M.tally(voted)[shared] >= 1);
  assert.equal(voted.candidates.filter(p => p.id === shared).length, 1);
});
test('request rejection requires a reason, stays public and does not change round or votes', () => {
  let a = seeded();
  a = M.act(a, a.members[1].id, 'request', { reason: '出发地变了' }, NOW);
  const requestId = a.requests[0].id, oldVotes = { ...a.votes };
  assert.throws(() => M.act(a, a.hostId, 'reject-request', { id: requestId, reason: ' ' }, NOW), /拒绝原因/);
  assert.throws(() => M.act(a, a.members[1].id, 'reject-request', { id: requestId, reason: '不需要' }, NOW), /发起者/);
  a = M.act(a, a.hostId, 'reject-request', { id: requestId, reason: '大家已确认当前安排' }, NOW);
  assert.equal(a.requests[0].status, 'rejected');
  assert.equal(a.requests[0].response, '大家已确认当前安排');
  assert.equal(a.round, 1);
  assert.deepEqual(a.votes, oldVotes);
  a = M.act(a, a.members[1].id, 'request', { reason: '新需求' }, NOW);
  assert.equal(a.requests.length, 2);
  assert.deepEqual(M.act(a, a.members[1].id, 'request', {}, NOW).requests, a.requests);
});
test('guest and account recovery use individual last valid operation, not shared activity time', () => {
  let a = prepared();
  const host = a.hostId, other = a.members[1].id;
  a = M.act(a, other, 'identity-type', { identityType: 'account' }, NOW);
  a = M.act(a, other, 'requirements', { origin: M.ORIGINS[3], mode: '步行', preference: '不限', budget: 100, shared: false }, NOW + M.DAY * 2);
  assert.equal(M.access(a, host, NOW + M.DAY).allowed, false);
  assert.equal(M.access(a, other, NOW + M.DAY * 8).allowed, true);
  assert.equal(M.access(a, other, NOW + M.DAY * 9).allowed, false);
  assert.throws(() => M.act(a, host, 'identity-type', { identityType: 'account' }, NOW + M.DAY * 2), /恢复期限/);
  assert.equal(a.members.length, 2, 'expired membership must not erase shared records');
});
test('a valid operation renews only its member; reads and automatic counting do not renew', () => {
  let a = prepared();
  const start = M.access(a, a.hostId, NOW).expiresAt;
  a = M.act(a, a.hostId, 'schedule', { date: '2026-10-25', time: '17:00' }, NOW + 1000);
  assert.equal(M.access(a, a.hostId, NOW).expiresAt, start + 1000);
  assert.equal(M.access(a, a.members[1].id, NOW).expiresAt, start);
  a = M.act(a, a.hostId, 'recommend', {}, NOW + 1000);
  const last = a.members[0].lastActiveAt;
  a = M.tick(a, NOW + M.DAY + 1000);
  assert.equal(a.members[0].lastActiveAt, last);
  assert.equal(a.status, 'no-votes');
});
test('dates are valid and schedule remains independent of the 24-hour vote deadline', () => {
  assert.equal(M.validDate('2026-02-30'), false);
  assert.equal(M.validDate('2028-02-29'), true);
  assert.equal(M.dateKey(Date.parse('2026-10-23T18:00:00Z')), '2026-10-24');
  let a = seeded(), deadline = a.deadline;
  a = M.act(a, a.hostId, 'schedule', { date: '2026-12-31', time: '23:00' }, NOW);
  assert.equal(a.date, '2026-12-31');
  assert.equal(a.deadline, deadline);
  assert.throws(() => M.act(a, a.hostId, 'schedule', { date: '2026-02-30', time: '23:00' }, NOW), /日期/);
});
test('completed memories accept per-member feelings and comments without altering confirmed results', () => {
  let a = M.seedMemories(NOW)[0], result = a.winningCandidateId, host = a.hostId, other = a.members[1].id;
  a = M.act(a, host, 'feeling', { text: '我的新感受' }, NOW + 8 * M.DAY);
  a = M.act(a, other, 'feeling', { text: '另一位伙伴的感受' }, NOW + 8 * M.DAY);
  assert.equal(a.journal.feelings.length, 2);
  assert.equal(a.journal.feelings.find(f => f.memberId === host).text, '我的新感受');
  a = M.act(a, host, 'comment', { text: '<script>文本不会作为 HTML 使用</script>' }, NOW);
  const comment = a.journal.comments.at(-1);
  assert.throws(() => M.act(a, other, 'delete-comment', { id: comment.id }, NOW), /自己/);
  a = M.act(a, host, 'delete-comment', { id: comment.id }, NOW);
  assert.equal(a.journal.comments.some(c => c.id === comment.id), false);
  assert.equal(a.winningCandidateId, result);
  assert.equal(a.status, 'completed');
  assert.throws(() => M.act(a, host, 'vote', { id: a.candidates[1].id }, NOW), /结束/);
  assert.throws(() => M.act(a, 'outsider', 'comment', { text: '越权' }, NOW), /身份/);
});
test('photo metadata is limited and only the author can remove a photo', () => {
  let a = M.seedMemories(NOW)[0], host = a.hostId;
  a = M.act(a, host, 'photos', { photos: Array.from({ length: 12 }, (_, i) => ({ id: `photo-${i}`, name: `${i}.jpg` })) }, NOW);
  assert.equal(a.journal.photos.length, 12);
  assert.throws(() => M.act(a, host, 'photos', { photos: [{ id: 'overflow' }] }, NOW), /12/);
  assert.throws(() => M.act(a, a.members[1].id, 'delete-photo', { id: 'photo-0' }, NOW), /自己/);
  a = M.act(a, host, 'delete-photo', { id: 'photo-0' }, NOW);
  assert.equal(a.journal.photos.length, 11);
  assert.throws(() => M.act(a, host, 'photos', { photos: [{ id: 'photo-1' }] }, NOW), /无效/);
});
test('legacy migration preserves candidates, votes and old requests while adding journal fields', () => {
  const a = seeded();
  delete a.date; delete a.journal; delete a.groups;
  a.remaining = 1234; delete a.remainingMs;
  a.resultId = a.candidates[0].id; delete a.winningCandidateId;
  for (const candidate of a.candidates) {
    candidate.dimensions.transit = candidate.dimensions.convenience;
    delete candidate.dimensions.convenience;
  }
  a.requests = [a.members[1].id];
  a.members.forEach(m => { delete m.identityType; delete m.lastActiveAt; });
  const migrated = M.migrate(a);
  assert.deepEqual(migrated.votes, a.votes);
  assert.equal(migrated.remainingMs, 1234);
  assert.equal(migrated.winningCandidateId, a.candidates[0].id);
  assert.equal(Object.hasOwn(migrated, 'remaining'), false);
  assert.equal(Object.hasOwn(migrated, 'resultId'), false);
  assert.ok(migrated.candidates.every(candidate => Object.hasOwn(candidate.dimensions, 'convenience')));
  assert.ok(migrated.candidates.every(candidate => !Object.hasOwn(candidate.dimensions, 'transit')));
  assert.equal(migrated.requests[0].status, 'pending');
  assert.equal(migrated.members[0].lastActiveAt, a.updatedAt);
  assert.ok(M.validDate(migrated.date));
  assert.deepEqual(migrated.journal.photos, []);
});
