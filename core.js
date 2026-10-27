/* Business rules are independent of the DOM and map provider. All travel data is simulated. */
(function (root) {
  'use strict';
  const DAY = 24 * 60 * 60 * 1000;
  const GROUPS = [
    { id: 'fairness', name: '最公平', description: '尽量缩小伙伴之间的出行时间差，让每个人都少一点奔波。' },
    { id: 'preference', name: '最合心意', description: '优先照顾活动类型、个人偏好与预算期待。' },
    { id: 'convenience', name: '最方便', description: '优先交通便利，再比较全员平均出行时间。' }
  ];
  const dateKey = (now = Date.now()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(now));
  function validDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return false;
    const d = new Date(value + 'T12:00:00+08:00');
    return Number.isFinite(d.getTime()) && dateKey(d.getTime()) === value;
  }
  const emptyJournal = () => ({ photos: [], feelings: [], comments: [] });
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
    { id: 'p1', name: '新天地', subtitle: '街区漫步，也适合坐下来好好聊聊', area: '黄浦区 · 太仓路', lng: 121.4752, lat: 31.2194, tags: ['聚餐', '线下会面'], preference: ['聚餐', '逛街', '不限'], budget: 100, transit: 9.2, illustration: 'town', line: '地铁 10 / 13 号线', x: 57, y: 67 },
    { id: 'p2', name: '静安嘉里中心', subtitle: '丰富餐饮选择，地铁出站轻松抵达', area: '静安区 · 南京西路', lng: 121.4505, lat: 31.2237, tags: ['聚餐', '线下会面'], preference: ['聚餐', '逛街', '不限'], budget: 130, transit: 9.7, illustration: 'building', line: '地铁 2 / 7 / 14 号线', x: 32, y: 43 },
    { id: 'p3', name: '上海来福士广场', subtitle: '城市中心的相聚日常', area: '黄浦区 · 西藏中路', lng: 121.4753, lat: 31.2322, tags: ['聚餐', '休闲娱乐', '线下会面'], preference: ['聚餐', '逛街', '不限'], budget: 90, transit: 9.6, illustration: 'mall', line: '地铁 1 / 2 / 8 号线', x: 58, y: 33 },
    { id: 'p4', name: '上海环球港', subtitle: '把吃饭、逛街和休闲安排在一起', area: '普陀区 · 中山北路', lng: 121.4127, lat: 31.2328, tags: ['休闲娱乐', '聚餐'], preference: ['聚餐', '逛街', '不限'], budget: 100, transit: 8.8, illustration: 'mall', line: '地铁 3 / 4 / 13 号线', x: 16, y: 27 },
    { id: 'p5', name: '上海图书馆（淮海路馆）', subtitle: '留一段安静的时间给阅读与思考', area: '徐汇区 · 淮海中路', lng: 121.4431, lat: 31.2074, tags: ['线下会面'], preference: ['不限'], budget: 0, transit: 8.9, illustration: 'building', line: '地铁 10 号线', x: 25, y: 73 },
    { id: 'p6', name: '世纪公园', subtitle: '在开阔的绿意里，开启一场轻松会面', area: '浦东新区 · 锦绣路', lng: 121.5501, lat: 31.2157, tags: ['休闲娱乐'], preference: ['赏风景', '不限'], budget: 0, transit: 8.6, illustration: 'park', line: '地铁 2 / 18 号线', x: 85, y: 65 }
  ];
  const PREFERENCES = ['不限', '聚餐', '逛街', '赏风景'];
  const OPTIONS = Object.fromEntries(['聚餐', '休闲娱乐', '线下会面'].map(type => [type, PREFERENCES]));
  const oldPreference = value => ({ '本帮菜': '聚餐', '火锅': '聚餐', '西餐': '聚餐', '户外散步': '赏风景', '学习讨论': '不限', '工作交流': '不限', '朋友会面': '不限' })[value] || value;
  const clone = value => JSON.parse(JSON.stringify(value));
  const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  const round = n => Math.round(n * 10) / 10;
  const clamp = n => Math.max(0, Math.min(10, n));
  function assert(condition, message) { if (!condition) throw new Error(message); }
  function availableName(a, requested, actorId = null) {
    assert(typeof requested === 'string', '请输入昵称');
    const base = requested.trim();
    assert(base && base.length <= 16, '昵称应为 1—16 个字');
    const names = new Set(a.members.filter(m => m.id !== actorId).map(m => m.name));
    if (!names.has(base)) return base;
    for (let number = 2; ; number++) {
      const suffix = `（${number}）`;
      const candidate = base.slice(0, 16 - suffix.length) + suffix;
      if (!names.has(candidate)) return candidate;
    }
  }
  function member(name, originIndex = null, mode = '公共交通', preference = '不限', budget = 150, shared = false) {
    return { id: uid(), name, origin: originIndex === null ? null : clone(ORIGINS[originIndex]), mode, preference, budget, shared };
  }
  function createActivity(title, nickname, type = '聚餐', now = Date.now(), options = {}) {
    assert(title.trim() && nickname.trim(), '请填写活动名称和昵称');
    assert(OPTIONS[type], '请选择有效的活动类型');
    const host = member(nickname.trim());
    host.identityType = options.identityType === 'account' ? 'account' : 'guest';
    host.lastActiveAt = now;
    assert(validDate(options.date || dateKey(now)), '请选择有效的聚会日期');
    assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(options.time || '18:30'), '请选择有效时间');
    return {
      id: uid(), code: uid().replace(/-/g, '').slice(-6).toUpperCase(),
      title: title.trim().slice(0, 40), type, hostId: host.id, members: [host],
      status: 'collecting', paused: false, candidates: [], votes: {}, round: 0,
      deadline: null, remaining: null, resultId: null, requests: [], createdAt: now, updatedAt: now,
      date: options.date || dateKey(now), time: options.time || '18:30', groups: {}, journal: emptyJournal()
    };
  }
  function ready(a) {
    return a.members.length >= 2 && a.members.length <= 10 && a.members.every(m =>
      m.origin && Number.isFinite(m.origin.lng) && Number.isFinite(m.origin.lat) &&
      ['公共交通', '驾车', '步行', '骑行'].includes(m.mode) &&
      m.preference && Number.isFinite(m.budget) && m.budget >= 0);
  }
  function rankedPlaces(a) {
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
      // No contractual weighting was agreed. An explicit demo-only equal mean provides a stable tie order.
      const score = round((dimensions.fairness + dimensions.time + dimensions.preference + dimensions.transit) / 4);
      return { ...clone(p), routes, average, gap, dimensions, score };
    }).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  }
  function groupCandidates(pool) {
    const compare = {
      fairness: (a, b) => b.dimensions.fairness - a.dimensions.fairness || a.average - b.average,
      preference: (a, b) => b.dimensions.preference - a.dimensions.preference || b.score - a.score,
      convenience: (a, b) => b.dimensions.transit - a.dimensions.transit || a.average - b.average
    };
    return Object.fromEntries(GROUPS.map(g => [g.id, [...pool].sort((a, b) => compare[g.id](a, b) || a.id.localeCompare(b.id)).slice(0, 3).map(p => p.id)]));
  }
  function recommend(a) {
    const pool = rankedPlaces(a), groups = groupCandidates(pool);
    const ids = new Set(Object.values(groups).flat());
    return pool.filter(p => ids.has(p.id));
  }
  function migrate(activity) {
    const a = clone(activity);
    a.members.forEach(m => { m.preference = oldPreference(m.preference); });
    a.date ||= dateKey(a.createdAt);
    a.time ||= '18:30';
    a.journal ||= emptyJournal();
    a.groups ||= groupCandidates(a.candidates);
    a.requests = (a.requests || []).map(r => typeof r === 'string' ? { id: uid(), memberId: r, status: 'pending', reason: '希望按最新需求重新推荐', createdAt: a.updatedAt, round: a.round } : r);
    a.members.forEach(m => { m.identityType ||= 'guest'; m.lastActiveAt ??= a.updatedAt; });
    return a;
  }
  function access(a, memberId, now = Date.now()) {
    const m = a.members.find(m => m.id === memberId);
    if (!m) return { allowed: false, expiresAt: null };
    const expiresAt = (m.lastActiveAt ?? a.updatedAt) + (m.identityType === 'account' ? 7 : 1) * DAY;
    return { allowed: ['completed', 'cancelled'].includes(a.status) || now < expiresAt, expiresAt };
  }
  function journalAct(a, actor, action, data, now) {
    assert(a.status !== 'cancelled', '活动已取消，手账仅可查看');
    const j = a.journal;
    if (action === 'feeling' || action === 'comment') {
      assert(typeof data.text === 'string' && data.text.trim(), '请先写下内容');
      assert(data.text.trim().length <= 1000, '内容不能超过 1000 字');
      if (action === 'feeling') {
        const entry = { memberId: actor.id, text: data.text.trim(), updatedAt: now };
        j.feelings = j.feelings.filter(f => f.memberId !== actor.id).concat(entry);
      } else {
        assert(j.comments.length < 200, '这场聚会的演示留言已达到 200 条上限');
        j.comments.push({ id: uid(), memberId: actor.id, text: data.text.trim(), createdAt: now });
      }
    } else if (action === 'photos') {
      assert(Array.isArray(data.photos) && data.photos.length > 0, '请选择照片');
      assert(j.photos.length + data.photos.length <= 12, '每场聚会最多保留 12 张照片');
      for (const p of data.photos) {
        assert(typeof p.id === 'string' && p.id && !j.photos.some(old => old.id === p.id), '照片记录无效');
        j.photos.push({ id: p.id, memberId: actor.id, name: String(p.name || '聚会照片').slice(0, 100), createdAt: now });
      }
    } else {
      const list = action === 'delete-photo' ? j.photos : j.comments;
      const entry = list.find(p => p.id === data.id);
      assert(entry && entry.memberId === actor.id, '只能删除自己发布的内容');
      if (action === 'delete-photo') j.photos = list.filter(p => p.id !== data.id);
      else j.comments = list.filter(p => p.id !== data.id);
    }
    actor.lastActiveAt = now;
    a.updatedAt = now;
    return a;
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
    a.deadline = now + DAY;
    a.remaining = null;
  }
  function act(activity, actorId, action, data = {}, now = Date.now()) {
    const a = migrate(tick(activity, now));
    const actor = a.members.find(m => m.id === actorId);
    if (action !== 'join') assert(actor, '当前身份不在活动中');
    if (actor) assert(access(a, actorId, now).allowed, '该身份的活动恢复期限已过，不能继续访问未完成活动');
    if (action === 'rename') {
      assert(a.status !== 'cancelled', '活动已取消，不能修改昵称');
      actor.name = availableName(a, data.name, actorId);
      actor.lastActiveAt = a.updatedAt = now;
      return a;
    }
    if (['feeling', 'comment', 'photos', 'delete-photo', 'delete-comment'].includes(action)) return journalAct(a, actor, action, data, now);
    assert(!['completed', 'cancelled'].includes(a.status), '活动已结束，不能再修改');
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
          assert(typeof data.name === 'string', '请输入昵称');
          a.members.push({ ...member(availableName(a, data.name)), identityType: data.identityType === 'account' ? 'account' : 'guest', lastActiveAt: now });
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
          a.groups = groupCandidates(a.candidates);
          assert(a.candidates.length, '没有适合的候选，请调整活动需求');
          a.requests.filter(r => r.status === 'pending').forEach(r => { r.status = 'approved'; r.handledAt = now; r.handledBy = actorId; r.response = '已按最新需求生成三组候选并开启新轮次'; });
          startRound(a, now);
          break;
        case 'request':
          assert(a.candidates.length, '请先生成推荐');
          assert(!a.requests.some(r => r.memberId === actorId && r.status === 'pending'), '你已有一条待处理申请');
          assert(data.reason === undefined || (typeof data.reason === 'string' && data.reason.trim().length <= 300), '申请说明不能超过 300 字');
          a.requests.push({ id: uid(), memberId: actorId, status: 'pending', reason: data.reason?.trim() || '希望按最新出行需求重新推荐', round: a.round, createdAt: now });
          break;
        case 'reject-request': {
          host();
          const request = a.requests.find(r => r.id === data.id && r.status === 'pending');
          assert(request, '该申请不存在或已处理');
          assert(typeof data.reason === 'string' && data.reason.trim() && data.reason.trim().length <= 300, '请填写拒绝原因（1—300 字）');
          Object.assign(request, { status: 'rejected', response: data.reason.trim(), handledAt: now, handledBy: actorId });
          break;
        }
        case 'schedule':
          host(); assert(validDate(data.date), '请选择有效的聚会日期');
          assert(/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time), '请选择有效时间');
          a.date = data.date; a.time = data.time;
          break;
        case 'identity-type':
          assert(['guest', 'account'].includes(data.identityType), '身份类型无效');
          actor.identityType = data.identityType;
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
    if (actor) actor.lastActiveAt = now;
    return a;
  }
  function visibleMembers(a, viewerId) {
    return a.members.map(m => ({ ...clone(m), origin: m.shared || m.id === viewerId ? clone(m.origin) : null }));
  }
  function seed(now = Date.now()) {
    let a = createActivity('周末见面，一起吃顿好的', '小林', '聚餐', now);
    const host = a.members[0];
    Object.assign(host, member('小林', 0, '公共交通', '聚餐', 150, true), { id: host.id });
    a.members.push(member('阿泽', 1, '骑行', '不限', 150, true));
    a.members.push(member('可可', 2, '公共交通', '聚餐', 120, false));
    a.members.push(member('一诺', 3, '公共交通', '不限', 120, false));
    a.members.forEach(m => { m.lastActiveAt = now; m.identityType = 'account'; });
    a = act(a, a.hostId, 'recommend', {}, now);
    a = act(a, a.members[1].id, 'vote', { id: a.candidates[0].id }, now);
    a = act(a, a.members[2].id, 'vote', { id: a.candidates[1].id }, now);
    return a;
  }
  function seedMemories(now = Date.now()) {
    const [year, month] = dateKey(now).split('-');
    return [6, 12, 18].map((day, i) => {
      let a = seed(now);
      a.title = ['把秋天装进口袋', '一顿饭，聊到天黑', '留半天给老朋友'][i];
      a.date = `${year}-${month}-${String(day).padStart(2, '0')}`;
      a.time = ['15:00', '18:30', '14:00'][i];
      a.members.forEach(m => { a = act(a, m.id, 'vote', { id: a.candidates[i % a.candidates.length].id }, now); });
      a = act(a, a.hostId, 'finish', {}, now);
      a.journal.cover = ['autumn', 'cafe', 'lake'][i];
      a.journal.feelings = [{ memberId: a.hostId, text: ['天气刚好，朋友也刚好。沿着小路走了很久，原来快乐可以这么简单。', '从最近的忙碌聊到明年的旅行。热菜慢慢凉了，话题却一直没停。', '什么都不赶的一天。坐在水边吹风，和熟悉的人说些没那么重要的话。'][i], updatedAt: now }];
      a.journal.comments = [{ id: uid(), memberId: a.members[1].id, text: ['下次还要一起去看落叶！', '这顿饭值得再约一次。', '已经开始期待下一次见面了。'][i], createdAt: now }];
      a.isExample = true;
      return a;
    });
  }
  const api = { DAY, GROUPS, ORIGINS, POIS, OPTIONS, dateKey, validDate, migrate, access, groupCandidates, createActivity, ready, recommend, tally, tick, act, visibleMembers, seed, seedMemories, uid };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MeetPoint = api;
})(typeof window !== 'undefined' ? window : globalThis);
