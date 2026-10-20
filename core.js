/* Business rules are independent of the DOM and map provider. All travel data is simulated. */
(function (root) {
  'use strict';
  const DAY = 24 * 60 * 60 * 1000;
  const ORIGINS = [
    { name: '徐家汇', lng: 121.4365, lat: 31.1956 },
    { name: '静安寺', lng: 121.4453, lat: 31.2232 },
    { name: '人民广场', lng: 121.4752, lat: 31.2328 },
    { name: '陆家嘴', lng: 121.5025, lat: 31.2385 },
    { name: '上海交通大学（徐汇）', lng: 121.4358, lat: 31.2014 },
    { name: '中山公园', lng: 121.4172, lat: 31.2187 },
    { name: '五角场', lng: 121.5148, lat: 31.3013 }
  ];
  const POIS = [
    { id: 'p1', name: '新天地', subtitle: '街区漫步，也适合坐下来好好聊聊', area: '黄浦区 · 太仓路', lng: 121.4752, lat: 31.2194, tags: ['聚餐', '线下会面'], preference: ['本帮菜', '不限', '朋友会面'], budget: 100, transit: 9.2, illustration: 'town', line: '地铁 10 / 13 号线', x: 57, y: 67 },
    { id: 'p2', name: '静安嘉里中心', subtitle: '丰富餐饮选择，地铁出站轻松抵达', area: '静安区 · 南京西路', lng: 121.4505, lat: 31.2237, tags: ['聚餐', '线下会面'], preference: ['西餐', '不限', '工作交流'], budget: 130, transit: 9.7, illustration: 'building', line: '地铁 2 / 7 / 14 号线', x: 32, y: 43 },
    { id: 'p3', name: '上海来福士广场', subtitle: '城市中心的相聚日常', area: '黄浦区 · 西藏中路', lng: 121.4753, lat: 31.2322, tags: ['聚餐', '休闲娱乐', '线下会面'], preference: ['火锅', '不限', '朋友会面', '逛街'], budget: 90, transit: 9.6, illustration: 'mall', line: '地铁 1 / 2 / 8 号线', x: 58, y: 33 },
    { id: 'p4', name: '上海环球港', subtitle: '把吃饭、逛街和休闲安排在一起', area: '普陀区 · 中山北路', lng: 121.4127, lat: 31.2328, tags: ['休闲娱乐', '聚餐'], preference: ['逛街', '不限', '西餐'], budget: 100, transit: 8.8, illustration: 'mall', line: '地铁 3 / 4 / 13 号线', x: 16, y: 27 },
    { id: 'p5', name: '上海图书馆（淮海路馆）', subtitle: '留一段安静的时间给阅读与思考', area: '徐汇区 · 淮海中路', lng: 121.4431, lat: 31.2074, tags: ['线下会面'], preference: ['学习讨论', '不限'], budget: 0, transit: 8.9, illustration: 'building', line: '地铁 10 号线', x: 25, y: 73 },
    { id: 'p6', name: '世纪公园', subtitle: '在开阔的绿意里，开启一场轻松会面', area: '浦东新区 · 锦绣路', lng: 121.5501, lat: 31.2157, tags: ['休闲娱乐'], preference: ['户外散步', '不限'], budget: 0, transit: 8.6, illustration: 'park', line: '地铁 2 / 18 号线', x: 85, y: 65 }
  ];
  const OPTIONS = {
    '聚餐': ['不限', '本帮菜', '火锅', '西餐'],
    '休闲娱乐': ['不限', '逛街', '户外散步'],
    '线下会面': ['不限', '学习讨论', '工作交流', '朋友会面']
  };
  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const round = n => Math.round(n * 10) / 10;
  const clamp = n => Math.max(0, Math.min(10, n));
  function assert(condition, message) { if (!condition) throw new Error(message); }
  function member(name, originIndex = null, mode = '公共交通', preference = '不限', budget = 150, shared = false) {
    return { id: uid(), name, origin: originIndex === null ? null : clone(ORIGINS[originIndex]), mode, preference, budget, shared };
  }
  function createActivity(title, nickname, type = '聚餐', now = Date.now()) {
    assert(title.trim() && nickname.trim(), '请填写活动名称和昵称');
    assert(OPTIONS[type], '请选择有效的活动类型');
    const host = member(nickname.trim());
    return {
      id: uid(), code: uid().replace(/-/g, '').slice(-6).toUpperCase(),
      title: title.trim().slice(0, 40), type, hostId: host.id, members: [host],
      status: 'collecting', paused: false, candidates: [], votes: {}, round: 0,
      deadline: null, remaining: null, resultId: null, requests: [], createdAt: now, updatedAt: now
    };
  }
  function ready(a) {
    return a.members.length >= 2 && a.members.length <= 10 && a.members.every(m =>
      m.origin && Number.isFinite(m.origin.lng) && Number.isFinite(m.origin.lat) &&
      ['公共交通', '驾车', '步行', '骑行'].includes(m.mode) &&
      m.preference && Number.isFinite(m.budget) && m.budget >= 0);
  }
  function recommend(a) {
    assert(ready(a), '需要 2—10 名成员，且每个人都已填写出行需求');
    return POIS.filter(p => p.tags.includes(a.type)).map(p => {
      const routes = a.members.map(m => {
        const distance = Math.hypot((m.origin.lng - p.lng) * 95, (m.origin.lat - p.lat) * 111);
        const speed = { '公共交通': 0.42, '驾车': 0.52, '步行': 0.075, '骑行': 0.2 }[m.mode];
        const minutes = Math.max(3, Math.round(distance / speed + (m.mode === '公共交通' ? 12 : 4)));
        return { memberId: m.id, minutes, cost: null };
      });
      const times = routes.map(r => r.minutes);
      const average = Math.round(times.reduce((s, t) => s + t, 0) / times.length);
      const gap = Math.max(...times) - Math.min(...times);
      const match = a.members.reduce((sum, m) => sum + (
        (p.preference.includes(m.preference) ? 10 : 6) * 0.6 +
        (m.budget >= p.budget ? 10 : Math.max(2, 10 - (p.budget - m.budget) / 20)) * 0.4
      ), 0) / a.members.length;
      const dimensions = {
        fairness: round(clamp(10 - gap / 8)),
        time: round(clamp(10 - average / 12)),
        preference: round(match),
        transit: p.transit
      };
      const score = round(dimensions.fairness * 0.35 + dimensions.time * 0.3 + dimensions.preference * 0.2 + dimensions.transit * 0.15);
      return { ...clone(p), routes, average, gap, dimensions, score };
    }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id)).slice(0, 3);
  }
  function tally(a) {
    const validIds = new Set(a.members.map(m => m.id));
    const counts = Object.fromEntries(a.candidates.map(p => [p.id, 0]));
    for (const [id, vote] of Object.entries(a.votes)) if (validIds.has(id) && vote in counts) counts[vote]++;
    return counts;
  }
  function settle(a) {
    const counts = tally(a);
    const total = Object.values(counts).reduce((s, n) => s + n, 0);
    if (!total) { a.status = 'no-votes'; a.deadline = null; return; }
    const winner = a.candidates.reduce((best, p) => counts[p.id] > counts[best.id] ? p : best, a.candidates[0]);
    a.resultId = winner.id;
    a.status = 'completed';
    a.deadline = null;
  }
  function tick(activity, now = Date.now()) {
    const a = clone(activity);
    if (a.status === 'voting' && !a.paused && now >= a.deadline) { settle(a); a.updatedAt = now; }
    return a;
  }
  function startRound(a, now) {
    a.round++;
    a.status = 'voting';
    a.votes = {};
    a.requests = [];
    a.deadline = now + DAY;
    a.remaining = null;
  }
  function act(activity, actorId, action, data = {}, now = Date.now()) {
    const a = tick(activity, now);
    assert(!['completed', 'cancelled'].includes(a.status), '活动已结束，不能再修改');
    const actor = a.members.find(m => m.id === actorId);
    if (action !== 'join') assert(actor, '当前身份不在活动中');
    const host = () => assert(actorId === a.hostId, '只有发起者可以执行此操作');
    if (action === 'resume') {
      host(); assert(a.paused, '活动没有暂停');
      if (a.status === 'voting') a.deadline = now + a.remaining;
      a.paused = false; a.remaining = null;
    } else if (action === 'pause') {
      host(); assert(!a.paused, '活动已经暂停');
      a.remaining = a.status === 'voting' ? Math.max(0, a.deadline - now) : null;
      a.paused = true;
    } else if (action === 'cancel') {
      host(); a.status = 'cancelled'; a.paused = false; a.deadline = null;
    } else if (action === 'transfer') {
      host(); assert(a.members.some(m => m.id === data.id && m.id !== actorId), '请选择其他有效成员');
      a.hostId = data.id;
    } else {
      assert(!a.paused, '活动已暂停，请发起者恢复后继续');
      switch (action) {
        case 'join': {
          assert(a.status !== 'voting', '投票期间不能加入成员');
          assert(a.members.length < 10, '活动最多支持 10 人');
          assert(data.name?.trim(), '请输入昵称');
          assert(!a.members.some(m => m.name === data.name.trim()), '昵称已被使用，请换一个昵称');
          a.members.push(member(data.name.trim().slice(0, 16)));
          break;
        }
        case 'remove':
        case 'leave': {
          assert(a.status !== 'voting', '投票期间不能退出或移除成员');
          const target = action === 'leave' ? actorId : data.id;
          if (action === 'remove') host();
          assert(target !== a.hostId, '发起者需要先移交权限才能退出');
          assert(a.members.some(m => m.id === target), '成员不存在');
          a.members = a.members.filter(m => m.id !== target);
          delete a.votes[target];
          a.requests = a.requests.filter(id => id !== target);
          break;
        }
        case 'requirements': {
          const origin = ORIGINS[data.originIndex];
          assert(origin, '请选择示例出发地');
          assert(['公共交通', '驾车', '步行', '骑行'].includes(data.mode), '请选择交通方式');
          assert(OPTIONS[a.type].includes(data.preference), '请选择适用的活动偏好');
          assert(Number.isFinite(data.budget) && data.budget >= 0 && data.budget <= 5000, '预算应在 0—5000 元之间');
          Object.assign(actor, { origin: clone(origin), mode: data.mode, preference: data.preference, budget: data.budget, shared: !!data.shared });
          break;
        }
        case 'recommend':
          host();
          a.candidates = recommend(a);
          assert(a.candidates.length, '没有适合的候选，请调整活动需求');
          startRound(a, now);
          break;
        case 'request':
          assert(a.candidates.length, '请先生成推荐');
          if (!a.requests.includes(actorId)) a.requests.push(actorId);
          break;
        case 'vote':
          assert(a.status === 'voting', '当前轮次未开放投票');
          assert(a.candidates.some(p => p.id === data.id), '请选择本轮有效候选');
          a.votes[actorId] = data.id;
          break;
        case 'finish':
          host(); assert(a.status === 'voting', '当前没有正在进行的投票');
          assert(Object.values(tally(a)).reduce((s, n) => s + n, 0) === a.members.length, '全员投票后才能提前结束');
          settle(a);
          break;
        case 'revote':
          host(); assert(a.status === 'no-votes', '仅零票截止后可以沿用候选重投');
          assert(ready(a), '需要 2—10 名成员，且需求完整');
          // Keep the previous candidate snapshot; only votes and the deadline are reset.
          startRound(a, now);
          break;
        default: throw new Error('暂不支持该操作');
      }
    }
    a.updatedAt = now;
    return a;
  }
  function visibleMembers(a, viewerId) {
    return a.members.map(m => ({ ...clone(m), origin: m.shared || m.id === viewerId ? clone(m.origin) : null }));
  }
  function seed(now = Date.now()) {
    let a = createActivity('周末见面，一起吃顿好的', '小林', '聚餐', now);
    const host = a.members[0];
    Object.assign(host, member('小林', 0, '公共交通', '本帮菜', 150, true), { id: host.id });
    a.members.push(member('阿泽', 1, '骑行', '不限', 150, true));
    a.members.push(member('可可', 2, '公共交通', '西餐', 120, false));
    a.members.push(member('一诺', 3, '公共交通', '不限', 120, false));
    a = act(a, a.hostId, 'recommend', {}, now);
    a = act(a, a.members[1].id, 'vote', { id: a.candidates[0].id }, now);
    a = act(a, a.members[2].id, 'vote', { id: a.candidates[1].id }, now);
    return a;
  }
  const api = { DAY, ORIGINS, POIS, OPTIONS, createActivity, ready, recommend, tally, tick, act, visibleMembers, seed, uid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MeetPoint = api;
})(typeof window !== 'undefined' ? window : globalThis);
