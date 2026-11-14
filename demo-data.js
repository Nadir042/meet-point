'use strict';
const M = require('./core');

const DEMO_MARKER = 'meetpoint-full-demo-v1';
const DEMO_USERNAME = 'meetpoint_demo';
const DEMO_PASSWORD = 'MeetPointDemo2026!';

const modeAt = index => ['公共交通', '驾车', '步行', '骑行'][index % 4];
const dateAt = (now, days) => M.dateKey(now + days * M.DAY);

function preparedActivity({ title, type = '聚餐', date, time = '18:30', names, readyCount = names.length, now }) {
  let activity = M.createActivity(title, names[0], type, now, { date, time, identityType: 'account' });
  const viewerId = activity.hostId;
  for (const name of names.slice(1)) activity = M.act(activity, null, 'join', { name }, now);
  for (let index = 0; index < Math.min(readyCount, activity.members.length); index++) {
    activity = M.act(activity, activity.members[index].id, 'requirements', {
      origin: M.ORIGINS[index % M.ORIGINS.length],
      mode: modeAt(index),
      preference: index % 3 || type !== '聚餐' ? '不限' : '聚餐',
      budget: 90 + index * 20,
      shared: index % 3 === 0
    }, now);
  }
  activity.demoSeed = DEMO_MARKER;
  return { activity, viewerId };
}

function buildDemoActivities(now = Date.now()) {
  const entries = [];

  entries.push(preparedActivity({
    title: '等你一起出发', date: dateAt(now, 6), time: '18:30', names: ['小林'], readyCount: 1, now
  }));

  entries.push(preparedActivity({
    title: '周五晚饭，还差一位伙伴的路线', date: dateAt(now, 4), time: '19:00',
    names: ['小林', '阿泽', '可可', '一诺'], readyCount: 3, now
  }));

  entries.push(preparedActivity({
    title: '路线已齐，准备看看去哪儿', type: '线下会面', date: dateAt(now, 3), time: '14:00',
    names: ['小林', '思远', '雨桐'], now
  }));

  let voting = preparedActivity({
    title: '城市中间见 · 完整地图演示', date: dateAt(now, 2), time: '18:30',
    names: ['小林', '阿泽', '可可', '一诺', '小陈', '小陈'], now
  });
  voting.activity = M.act(voting.activity, voting.activity.hostId, 'recommend', {}, now);
  voting.activity = M.act(voting.activity, voting.activity.members[1].id, 'vote', { id: voting.activity.groups.fairness[0] }, now);
  voting.activity = M.act(voting.activity, voting.activity.members[2].id, 'vote', { id: voting.activity.groups.preference[0] }, now);
  entries.push(voting);

  let paused = preparedActivity({
    title: '秋日散步计划 · 暂停中', type: '休闲娱乐', date: dateAt(now, 8), time: '15:00',
    names: ['小林', '安安', '小北', '知夏', '闻舟'], now
  });
  paused.activity = M.act(paused.activity, paused.activity.hostId, 'recommend', {}, now);
  paused.activity = M.act(paused.activity, paused.activity.members[3].id, 'vote', { id: paused.activity.groups.convenience[0] }, now);
  paused.activity = M.act(paused.activity, paused.activity.hostId, 'pause', {}, now);
  entries.push(paused);

  let completed = preparedActivity({
    title: '一顿饭，聊到天黑', date: dateAt(now, -5), time: '18:30',
    names: ['小林', '阿泽', '可可', '一诺'], now
  });
  completed.activity = M.act(completed.activity, completed.activity.hostId, 'recommend', {}, now - 2 * M.DAY);
  const winner = completed.activity.groups.preference[0];
  for (const member of completed.activity.members)
    completed.activity = M.act(completed.activity, member.id, 'vote', { id: winner }, now - 2 * M.DAY);
  completed.activity = M.act(completed.activity, completed.activity.hostId, 'finish', {}, now - 2 * M.DAY);
  completed.activity = M.act(completed.activity, completed.activity.hostId, 'feeling', { text: '从最近的忙碌聊到明年的旅行，热菜慢慢凉了，话题却一直没停。' }, now - M.DAY);
  completed.activity = M.act(completed.activity, completed.activity.members[1].id, 'feeling', { text: '不用赶时间的一顿饭，就是很好的见面。' }, now - M.DAY);
  completed.activity = M.act(completed.activity, completed.activity.members[2].id, 'comment', { text: '下次还要坐在窗边！' }, now - M.DAY);
  completed.activity.journal.cover = 'cafe';
  entries.push(completed);

  let noVotes = preparedActivity({
    title: '旧书店碰面 · 等待重新投票', type: '线下会面', date: dateAt(now, 1), time: '13:30',
    names: ['小林', '书言', '木木'], now: now - M.DAY - 5000
  });
  noVotes.activity = M.act(noVotes.activity, noVotes.activity.hostId, 'recommend', {}, now - M.DAY - 5000);
  noVotes.activity = M.tick(noVotes.activity, now);
  noVotes.activity.demoSeed = DEMO_MARKER;
  entries.push(noVotes);

  let cancelled = preparedActivity({
    title: '临时改期的周末见面', date: dateAt(now, -2), time: '10:30',
    names: ['小林', '星河', '南风'], readyCount: 2, now
  });
  cancelled.activity = M.act(cancelled.activity, cancelled.activity.hostId, 'transfer', { id: cancelled.activity.members[1].id }, now);
  cancelled.activity = M.act(cancelled.activity, cancelled.activity.hostId, 'cancel', {}, now);
  entries.push(cancelled);

  return entries;
}

module.exports = { DEMO_MARKER, DEMO_USERNAME, DEMO_PASSWORD, buildDemoActivities };
