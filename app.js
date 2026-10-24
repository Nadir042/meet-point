/* Browser-local prototype; switching identity is deliberately exposed for demonstrations. */
(() => {
  'use strict';
  const M = window.MeetPoint;
  const STORAGE_KEY = 'meetpoint-demo-v1';
  const $ = selector => document.querySelector(selector);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = {
    pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
    grid: '<rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/>',
    compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/>',
    people: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3m1-16a3 3 0 0 1 0 6m2 4c2 1 3 3 3 6"/>',
    chat: '<path d="M21 11a9 9 0 0 1-9 9H3l2-4a9 9 0 1 1 16-5Z"/><path d="M8 9h8m-8 4h5"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    link: '<path d="m10 13 4-4m-6 7-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m0 12a4 4 0 0 0 6 0l5-5a4 4 0 0 0-6-6l-1 1" transform="translate(1 0) scale(.9)"/>',
    lock: '<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 0 1 8 0m-4 5v4"/>',
    chevron: '<path d="m9 5 7 7-7 7"/>',
    refresh: '<path d="M20 7v5h-5M4 17v-5h5"/><path d="M6 7a7 7 0 0 1 12-1l2 6M4 12l2 6a7 7 0 0 0 12-1"/>',
    settings: '<path d="M3 7h18M3 17h18"/><circle cx="8" cy="7" r="3"/><circle cx="16" cy="17" r="3"/>',
    exit: '<path d="M10 4H4v16h6m-1-8h12m-5-5 5 5-5 5"/>',
    pause: '<path d="M8 5v14M16 5v14"/>',
    leaf: '<path d="M20 3C8 2 2 7 4 15s15 9 16-12ZM5 19l10-10"/>',
    train: '<rect x="5" y="3" width="14" height="15" rx="4"/><path d="M5 10h14M9 21l-2-3m8 3 2-3M9 14h.01M15 14h.01"/>',
    close: '<path d="m6 6 12 12M6 18 18 6"/>'
  };
  const icon = name => `<svg class="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.65" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.pin}</svg>`;
  let storageWarning = '';
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
      if ([1, 2].includes(saved?.version) && Array.isArray(saved.activities) && saved.activities.length &&
          saved.activities.every(a => Array.isArray(a.members) && Array.isArray(a.candidates) && a.votes && a.id)) {
        saved.activities = saved.activities.map(M.migrate);
        saved.version = 2;
        return saved;
      }
    } catch { storageWarning = '浏览器存储不可用或数据损坏，本次使用临时演示数据。'; }
    const a = M.seed();
    const memories = M.seedMemories();
    return { version: 2, activities: [a, ...memories], activeId: a.id, identities: Object.fromEntries([a, ...memories].map(x => [x.id, x.hostId])), feedback: [] };
  }
  let state = load();
  let view = 'calendar';
  let group = 'fairness';
  let selectedPoi = null;
  let focusBeforeModal = null;
  let toastTimer;
  let lastAccessState = null;
  const active = () => state.activities.find(a => a.id === state.activeId) || state.activities[0];
  const viewer = () => state.identities[active().id];
  const self = () => active().members.find(m => m.id === viewer());
  const isHost = () => active().hostId === viewer();
  const canAccess = () => M.access(active(), viewer()).allowed;
  const terminal = a => ['completed', 'cancelled'].includes(a.status);
  const statusText = a => a.paused ? '活动已暂停' : ({ collecting: '正在收集需求', voting: '正在投票', 'no-votes': '等待重新投票', completed: '已确定集合点', cancelled: '活动已取消' }[a.status]);
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch { throw new Error('本地保存失败，可能是存储空间不足。请释放空间后重试。'); }
  }
  function replace(a) {
    const previous = state.activities;
    state.activities = state.activities.map(old => old.id === a.id ? a : old);
    try { save(); } catch (error) { state.activities = previous; throw error; }
  }
  function toast(message) {
    if ($('#modal').open) {
      let notice = $('#modal-message');
      if (!notice) {
        notice = document.createElement('div');
        notice.id = 'modal-message';
        notice.className = 'notice';
        notice.setAttribute('role', 'status');
        $('#modal .modal-body').prepend(notice);
      }
      notice.textContent = message;
    }
    $('#toast').textContent = message;
    $('#toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 4000);
  }
  function run(action, data = {}, message = '已更新') {
    try {
      replace(M.act(active(), viewer(), action, data));
      if (!active().members.some(m => m.id === viewer())) state.identities[active().id] = active().hostId;
      save(); render(); toast(message); return true;
    } catch (error) { toast(error.message); return false; }
  }
  function avatar(m, index, small = false) {
    return `<span class="avatar avatar-${index % 5}${small ? ' small' : ''}" title="${esc(m.name)}">${esc(m.name.slice(0, 1))}</span>`;
  }
  function art(kind, name) {
    const trees = '<g fill="#75866a"><circle cx="37" cy="84" r="17"/><circle cx="272" cy="86" r="20"/></g><g stroke="#53674b" stroke-width="3"><path d="M37 88v32m235-30v30"/></g>';
    let building = '';
    if (kind === 'town') {
      building = '<path d="M64 62 102 38l37 24v58H64Zm85 8 34-24 36 24v50h-70Z" fill="#b67659"/><path d="m59 63 43-29 42 29m0 7 39-29 41 29" fill="none" stroke="#6e5140" stroke-width="6"/><path d="M78 74h18v21H78Zm31 0h16v21h-16Zm52 8h16v18h-16Zm26 0h17v18h-17Z" fill="#eddfbf"/><path d="M99 120V99h16v21m62 0v-14h16v14" fill="#53674b"/>';
    } else if (kind === 'building') {
      building = '<path d="M74 120V43h51v77m8 0V24h50v96m8 0V58h35v62" fill="#8b9583"/><path d="M85 52h30v58m28-77h30v77m28-43h16v43" fill="none" stroke="#e0e5d8" stroke-width="4" stroke-dasharray="5 6"/><path d="M65 121h171" fill="none" stroke="#58684e" stroke-width="3"/>';
    } else if (kind === 'park') {
      building = '<path d="M70 120c20-55 40-50 60-70 35 20 60 25 90 70" fill="#b4c293"/><path d="M140 120c-20-20 40-25 10-49" fill="none" stroke="#f6ebcb" stroke-width="16"/><g fill="#6b845e"><circle cx="95" cy="65" r="22"/><circle cx="200" cy="71" r="27"/></g><path d="M95 67v42m105-34v38" stroke="#5e654c" stroke-width="5"/>';
    } else {
      building = '<path d="M68 120V58h157v62" fill="#b9ac8e"/><path d="M85 58V36h122v22" fill="#d3c7aa"/><path d="M94 68h25v37H94Zm39 0h25v37h-25Zm39 0h25v37h-25Z" fill="#657c70"/><path d="M59 58h176M79 35h134" stroke="#8b8069" stroke-width="5"/><path d="M126 120v-12h39v12" fill="#666f5c"/>';
    }
    return `<svg viewBox="0 0 310 146" role="img" aria-label="${esc(name)}建筑示意插画"><circle cx="242" cy="32" r="19" fill="#f5df9b"/><path d="M0 122Q73 108 155 122t155 0v24H0Z" fill="#cbd3b8"/>${trees}${building}<path d="M0 136h310" stroke="#f9f5e8" stroke-width="3"/><g fill="#748369"><circle cx="51" cy="123" r="7"/><circle cx="243" cy="124" r="10"/></g></svg>`;
  }
  function sidebar() {
    const navs = [['calendar', 'grid', '相聚日历'], ['overview', 'people', '我的活动'], ['recommend', 'compass', '集合点推荐'], ['members', 'people', '成员与需求'], ['feedback', 'chat', '意见反馈']];
    return `<aside class="sidebar">
      <a class="brand" href="#" data-action="view" data-value="calendar"><span class="brand-mark">${icon('pin')}</span><span>MeetPoint<small>让相聚，刚刚好。</small></span></a>
      <div class="workspace-label">相聚档案 <span>OUR JOURNAL</span></div>
      <nav aria-label="主导航">${navs.map(([id, glyph, label]) => `<button class="nav-item ${view === id ? 'active' : ''}" data-action="view" data-value="${id}">${icon(glyph)}<span>${label}</span>${id === 'recommend' ? '<span class="nav-dot"></span>' : ''}</button>`).join('')}</nav>
      <div class="sidebar-note"><span class="note-art">${icon('leaf')}</span><strong>见面是生活的<br>小小纪念日</strong><p>收集一起度过的日子，<br>也收集那些平凡的快乐。</p><span class="note-line"></span></div>
      <div class="sidebar-bottom"><span class="demo-pill">VOL. 02 · DEMO</span><p>neXus · 写给每一次相聚</p><button class="text-button muted" data-action="about">${icon('compass')} 关于这本手账</button></div>
    </aside>`;
  }
  function header() {
    const a = active();
    return `<header class="topbar"><div class="breadcrumb">MeetPoint 手账 ${icon('chevron')} <strong>${{ calendar: '相聚日历', overview: '我的活动', recommend: '集合点推荐', members: '成员与需求', feedback: '意见反馈' }[view]}</strong></div>
      <div class="topbar-right"><button class="text-button identity-kind" data-action="identity-info">${self()?.identityType === 'account' ? '演示账号 · 7天' : '游客 · 24小时'}</button><div class="identity">${avatar(self() || { name: '访客' }, Math.max(0, a.members.findIndex(m => m.id === viewer())), true)}<label class="sr-only" for="identity">切换演示成员</label><select id="identity" aria-label="切换演示成员">${a.members.map(m => `<option value="${m.id}" ${m.id === viewer() ? 'selected' : ''}>${esc(m.name)}${m.id === a.hostId ? ' · 发起者' : ' · 成员'}</option>`).join('')}</select></div></div></header>`;
  }
  function activityHeader() {
    const a = active();
    const stages = ['邀请伙伴', '填写需求', '推荐与投票', '出发相聚'];
    const stage = a.status === 'collecting' ? 1 : a.status === 'completed' ? 3 : 2;
    return `<div class="page-heading"><div><div class="eyebrow">A LITTLE CLOSER, TOGETHER</div><h1>找到刚刚好的集合点<span class="heading-dot">.</span></h1><p>照顾每个人的出发地，让下一次见面少一点纠结。</p></div><button class="button primary" data-action="create">${icon('plus')} 创建活动</button></div>
      <section class="activity-banner"><div class="activity-info"><span class="activity-symbol">${icon('people')}</span><div><div class="inline"><h2>${esc(a.title)}</h2><span class="status ${terminal(a) ? 'neutral' : ''}"><i></i>${statusText(a)}</span></div><p>${esc(a.date)} ${esc(a.time)}<span>·</span>${esc(a.type)}<span>·</span>${a.members.length} 位伙伴<span>·</span>邀请码 <strong>${a.code}</strong></p></div></div><div class="inline"><button class="text-button" data-action="open-journal" data-value="${a.id}">翻开手账</button><button class="button light" data-action="invite">${icon('link')} 邀请伙伴</button></div></section>
      <div class="steps" aria-label="活动进度">${stages.map((s, i) => `<div class="step ${i < stage ? 'done' : ''} ${i === stage ? 'current' : ''}"><span>${i < stage ? icon('check') : `0${i + 1}`}</span><strong>${s}</strong>${i === stage ? '<small>当前步骤</small>' : ''}</div>`).join('')}</div>
      ${a.paused ? '<div class="notice">活动已暂停。选票与候选已保留，倒计时将在恢复后继续。</div>' : ''}
      ${a.status === 'cancelled' ? '<div class="notice">这场活动已取消。你仍可查看记录，或创建一场新的相聚。</div>' : ''}`;
  }
  function mapPanel() {
    const a = active();
    const visible = M.visibleMembers(a, viewer()).filter(m => m.origin);
    const points = (a.groups[group] || []).map(id => a.candidates.find(p => p.id === id)).filter(Boolean);
    return `<section class="panel map-panel"><div class="panel-heading"><h3>${icon('pin')} 相聚地图</h3><span class="tiny-label">上海 · 地点分布示意</span></div>
      <div class="map-canvas">
        <svg class="map-base" viewBox="0 0 800 300" preserveAspectRatio="none" aria-hidden="true">
          <defs><pattern id="blocks" width="100" height="76" patternUnits="userSpaceOnUse" patternTransform="rotate(-13)"><rect width="100" height="76" fill="#f0efe6"/><rect x="8" y="8" width="80" height="56" rx="7" fill="#e5e5db"/><path d="M0 0h100M0 0v76" stroke="#fffef9" stroke-width="8"/></pattern></defs>
          <rect width="800" height="300" fill="url(#blocks)"/>
          <path d="M605-30c-100 110 92 145 12 205s-65 88-7 155" fill="none" stroke="#c5dce0" stroke-width="58"/>
          <path d="M-30 231 820 28M110-30 412 330M-10 79l840 170" stroke="#fffdf5" stroke-width="13" fill="none"/>
          <path d="M-30 231 820 28" stroke="#e1cfa7" stroke-width="2" fill="none"/>
          <path d="M77 38h87v37H77Zm380 183h75v45h-75ZM690 80h63v54h-63Z" fill="#ccd8bb"/>
          <g fill="#9b9d90" font-size="12" font-family="sans-serif"><text x="45" y="159">长宁区</text><text x="235" y="45">静安区</text><text x="393" y="131">黄浦区</text><text x="150" y="272">徐汇区</text><text x="696" y="213">浦东新区</text><text x="620" y="117" fill="#709b9f" transform="rotate(65 620 117)">黄浦江</text></g>
          ${points.length ? '<ellipse cx="347" cy="155" rx="185" ry="100" fill="#7b9166" fill-opacity=".06" stroke="#8e9d7c" stroke-dasharray="5 6"/>' : ''}
        </svg>
        ${visible.map((m, i) => {
          const x = Math.max(7, Math.min(93, (m.origin.lng - 121.40) / .16 * 100));
          const y = Math.max(12, Math.min(86, 95 - (m.origin.lat - 31.19) / .07 * 85));
          return `<div class="origin-marker" style="left:${x}%;top:${y}%">${avatar(m, a.members.findIndex(p => p.id === m.id), true)}<span>${esc(m.name)}${m.id === viewer() ? '（我）' : ''}</span></div>`;
        }).join('')}
        ${points.map((p, i) => `<button class="poi-marker ${selectedPoi === p.id ? 'selected' : ''}" style="left:${p.x}%;top:${p.y}%" data-action="select-poi" data-value="${p.id}" aria-label="查看候选 ${i + 1} ${esc(p.name)}"><span>${i + 1}</span><strong>${esc(p.name)}</strong></button>`).join('')}
        <div class="map-caption"><span><i class="legend-dot"></i> 候选集合点</span><span><i class="legend-dot origin"></i> 已公开 / 本人出发地</span></div>
        <span class="map-compass">N ↑</span>
      </div><div class="map-footer">${icon('lock')} 隐藏的出发地不会在其他成员视角中展示。<span>示意图 · 非真实地图</span></div></section>`;
  }
  function candidateCard(p, i) {
    const a = active();
    const vote = a.votes[viewer()];
    const count = M.tally(a)[p.id];
    const mine = p.routes.find(r => r.memberId === viewer());
    const winner = a.resultId === p.id;
    return `<article id="candidate-${p.id}" class="candidate ${selectedPoi === p.id ? 'focused' : ''} ${vote === p.id ? 'voted' : ''}">
      <div class="candidate-art art-${p.illustration}">${art(p.illustration, p.name)}<span class="rank ${i === 0 ? 'first' : ''}">${M.GROUPS.find(g => g.id === group).name} · ${i + 1}</span><span class="art-note">示意插画</span></div>
      <div class="candidate-body"><div class="candidate-title"><h3>${esc(p.name)}</h3><div class="score">${p.score.toFixed(1)}<small>/ 10</small></div></div><p class="address">${icon('pin')}${esc(p.area)}</p><p class="poi-description">${esc(p.subtitle)}</p>
        <div class="metrics"><div><small>我的预计用时</small><strong>${mine?.minutes ?? '—'}<span> 分钟</span></strong></div><div><small>全员平均用时</small><strong>${p.average}<span> 分钟</span></strong></div></div>
        <p class="group-reason">${group === 'fairness' ? `最长与最短出行相差 ${p.gap} 分钟` : group === 'preference' ? `偏好匹配 ${p.dimensions.preference.toFixed(1)} / 10 分` : `便利度 ${p.dimensions.transit.toFixed(1)} / 10 · 平均 ${p.average} 分钟`}</p><div class="transit-tag">${icon('train')}${esc(p.line)}</div>
        <button class="score-link" data-action="details" data-value="${p.id}">评分依据与路线比较 ${icon('chevron')}</button>
        <div class="vote-row"><span><strong>${count}</strong> 票支持</span><button class="button ${vote === p.id || winner ? 'primary' : 'vote-button'}" data-action="vote" data-value="${p.id}" ${a.status !== 'voting' || a.paused ? 'disabled' : ''}>${vote === p.id || winner ? icon('check') : ''}${winner ? '最终集合点' : vote === p.id ? '我已投票' : vote ? '改投这里' : '投票给这里'}</button></div>
      </div></article>`;
  }
  function memberPanel() {
    const a = active();
    const members = M.visibleMembers(a, viewer());
    return `<section class="panel member-panel"><div class="panel-heading"><h3>一起出发的伙伴</h3><span class="count-badge">${a.members.length} / 10</span></div>
      <div class="member-list">${members.map((m, i) => `<div class="member-row">${avatar(m, i)}<div><strong>${esc(m.name)} ${m.id === viewer() ? '<small>我</small>' : ''}${m.id === a.hostId ? '<span class="host-tag">发起者</span>' : ''}</strong><p>${m.origin ? esc(m.origin.name) : a.members[i].origin ? `${icon('lock')} 出发地已隐藏` : '待填写出行需求'}</p></div><span class="member-check ${a.votes[m.id] ? 'is-voted' : ''}" title="${a.votes[m.id] ? '已投票' : a.members[i].origin ? '已填写需求' : '待填写'}">${a.votes[m.id] ? icon('check') : a.members[i].origin ? '就绪' : '待填'}</span></div>`).join('')}</div>
      <button class="button full light" data-action="requirements" ${terminal(a) || a.paused ? 'disabled' : ''}>${icon('settings')} 编辑我的出行需求</button>
      <p class="panel-tip">通过右上角身份切换，可演示每位成员的填写与投票。</p></section>`;
  }
  function timerLabel(a) {
    if (a.status !== 'voting') return '—';
    const ms = a.paused ? a.remaining : Math.max(0, a.deadline - Date.now());
    const sec = Math.max(0, Math.floor(ms / 1000));
    return `${String(Math.floor(sec / 3600)).padStart(2, '0')} : ${String(Math.floor(sec / 60) % 60).padStart(2, '0')} : ${String(sec % 60).padStart(2, '0')}`;
  }
  function votePanel() {
    const a = active();
    const total = Object.values(M.tally(a)).reduce((s, n) => s + n, 0);
    const all = total === a.members.length;
    return `<section class="panel vote-panel"><div class="panel-heading"><h3>把决定交给大家</h3><span class="tiny-label">第 ${a.round || 1} 轮</span></div>
      <div class="vote-progress"><strong>${total}<span> / ${a.members.length}</span></strong><span>位伙伴已投票</span></div><div class="progress-track"><span style="width:${total / a.members.length * 100}%"></span></div>
      <div class="countdown">${icon('clock')}<span>${a.paused ? '倒计时已暂停' : '距离本轮投票截止'}<strong id="countdown">${timerLabel(a)}</strong></span></div>
      <p class="panel-tip">每人一票，截止前可改票。平票按本轮综合排序确定（当前为演示等权参考分）。</p>
      ${isHost() ? `<button class="button full primary" data-action="finish" ${!all || a.status !== 'voting' || a.paused ? 'disabled' : ''}>${icon('check')} 全员投票后确认结果</button>` : '<div class="subtle-box">全员投票后，发起者可提前确认结果。</div>'}
      ${a.status === 'no-votes' && isHost() ? '<button class="button full primary" data-action="revote">零票截止 · 重新开启投票</button>' : ''}
      ${!terminal(a) ? `<div class="management-actions">${isHost() ? `<button class="text-button" data-action="${a.paused ? 'resume' : 'pause'}">${icon(a.paused ? 'arrow' : 'pause')}${a.paused ? '恢复活动' : '暂停活动'}</button><button class="text-button muted" data-action="manage">管理活动 ${icon('chevron')}</button>` : '<button class="text-button" data-action="request">申请重新推荐</button>'}</div>` : ''}</section>`;
  }
  function resultBanner() {
    const a = active();
    if (a.status === 'no-votes') return '<div class="notice">本轮已截止，没有有效选票。发起者可沿用候选开启新的 24 小时投票。</div>';
    if (a.status !== 'completed') return '';
    const p = a.candidates.find(p => p.id === a.resultId);
    return `<section class="result-banner"><span class="result-icon">${icon('check')}</span><div><small>下一站，见面。</small><h2>就在「${esc(p.name)}」相聚吧</h2><p>结果已确认 · 预计出行费用未知，请以地图实时信息为准</p></div><button class="button primary" data-action="navigate">${icon('arrow')} 打开高德导航</button></section>`;
  }
  function requestsPanel(a) {
    if (!a.requests.length) return '';
    return `<section class="request-log"><h3>重新推荐申请 · 全体成员可见</h3>${[...a.requests].reverse().map(r => `<article><div class="inline"><strong>${esc(a.members.find(m => m.id === r.memberId)?.name || '原成员')}</strong><span class="status request-${r.status}">${{ pending: '待处理', approved: '已同意', rejected: '已拒绝' }[r.status]}</span><small>第 ${r.round} 轮</small></div><p>${esc(r.reason)}</p>${r.response ? `<p class="request-response">${r.status === 'rejected' ? '拒绝原因' : '处理说明'}：${esc(r.response)}</p>` : ''}${r.status === 'pending' && isHost() && !terminal(a) ? `<div class="inline"><button class="text-button" data-action="recommend" ${a.paused ? 'disabled' : ''}>同意并重新推荐</button><button class="text-button danger" data-action="reject-request" data-value="${r.id}" ${a.paused ? 'disabled' : ''}>拒绝并说明原因</button></div>` : ''}</article>`).join('')}</section>`;
  }
  function recommendations() {
    const a = active(), selectedGroup = M.GROUPS.find(g => g.id === group);
    const candidates = (a.groups[group] || []).map(id => a.candidates.find(p => p.id === id)).filter(Boolean);
    return `${activityHeader()}${resultBanner()}<div class="group-tabs" role="tablist" aria-label="推荐方案">${M.GROUPS.map(g => `<button role="tab" aria-selected="${g.id === group}" class="${g.id === group ? 'selected' : ''}" data-action="recommend-group" data-value="${g.id}"><span>${g.id === 'fairness' ? '01' : g.id === 'preference' ? '02' : '03'}</span><strong>${g.name}</strong><small>TOP ${a.groups[g.id]?.length || 3}</small></button>`).join('')}</div><div class="workspace-grid"><div class="main-column">${mapPanel()}
      <section class="recommendations"><div class="section-heading"><div><h2>${selectedGroup.name}的好去处 <span>TOP ${candidates.length || 3}</span></h2><p>${selectedGroup.description}</p></div><button class="text-button" data-action="${isHost() ? 'recommend' : 'request'}" ${terminal(a) || a.paused || !M.ready(a) ? 'disabled' : ''}>${icon('refresh')} ${a.candidates.length ? isHost() ? '重新推荐' : '申请重新推荐' : '生成推荐'}</button></div>
      ${candidates.length ? `<div class="candidate-grid">${candidates.map(candidateCard).join('')}</div>` : `<div class="empty-state"><span class="empty-icon">${icon('compass')}</span><h3>好去处，从了解每个人开始</h3><p>邀请至少一位伙伴，并为所有成员填写出行需求。<br>准备就绪后，生成三组 Top3 候选并开放投票。</p><button class="button primary" data-action="${M.ready(a) && isHost() ? 'recommend' : 'requirements'}">${M.ready(a) && isHost() ? '生成三组推荐' : '填写我的出行需求'} ${icon('arrow')}</button></div>`}
      <div class="data-note">三组共用每人一票，同一地点跨组出现时票数合并。分值为演示参考，费用未知；甲方未约定评分权重。</div>${requestsPanel(a)}</section></div>
      <aside class="right-column">${memberPanel()}${votePanel()}<div class="gentle-note">${icon('leaf')}<div><strong>见面之前，照顾每个人的期待。</strong><p>见面之后，把这一天写进手账。</p></div></div></aside></div>`;
  }
  function overview() {
    return `<div class="page-heading"><div><div class="eyebrow">MAKE ROOM FOR A GOOD TIME</div><h1>每一次相聚，都从这里开始<span class="heading-dot">.</span></h1><p>创建、恢复你的活动，和伙伴一起决定下一站。</p></div><button class="button primary" data-action="create">${icon('plus')} 创建活动</button></div>
      <div class="overview-actions"><button class="button light" data-action="join">${icon('link')} 使用邀请码加入</button><button class="text-button" data-action="sample">${icon('plus')} 新建示例活动</button></div>
      <div class="activity-grid">${state.activities.map(a => `<article class="panel activity-card"><div class="inline"><span class="activity-symbol">${icon('people')}</span><span class="status">${statusText(a)}</span></div><h2>${esc(a.title)}</h2><p>${esc(a.date)} ${esc(a.time)} · ${esc(a.type)} · ${a.members.length} 位伙伴</p><div class="stacked-avatars">${a.members.slice(0, 5).map((m, i) => avatar(m, i, true)).join('')}</div><button class="button light full" data-action="open-activity" data-value="${a.id}">进入活动 ${icon('arrow')}</button></article>`).join('')}</div><div class="data-note">游客 24 小时、演示账号 7 天内可恢复未完成活动，从本人最近有效操作起算。跨设备同步与真实账号仍待后端接入。</div>`;
  }
  function membersPage() {
    const a = active();
    const members = M.visibleMembers(a, viewer());
    return `${activityHeader()}<section class="panel members-page"><div class="panel-heading"><h3>每个人的出行偏好</h3><button class="button primary" data-action="requirements" ${terminal(a) || a.paused ? 'disabled' : ''}>编辑我的需求</button></div>
      <div class="member-table-wrap"><table><thead><tr><th>成员</th><th>出发地</th><th>交通方式</th><th>个人偏好</th><th>预算上限</th><th>状态</th></tr></thead><tbody>${members.map((m, i) => `<tr><td><div class="inline">${avatar(m, i, true)}<strong>${esc(m.name)}</strong>${m.id === a.hostId ? '<span class="host-tag">发起者</span>' : ''}</div></td><td>${m.origin ? esc(m.origin.name) : a.members[i].origin ? '已隐藏' : '待填写'}</td><td>${esc(m.mode)}</td><td>${esc(m.preference)}</td><td>¥${m.budget}</td><td><span class="status">${a.members[i].origin ? '需求已就绪' : '待完善'}</span></td></tr>`).join('')}</tbody></table></div>
      <div class="notice">${icon('lock')} 具体出发地只对本人或经本人授权的其他成员展示。此 Demo 的身份切换仅用于演示。</div>
      <div class="inline">${isHost() ? `<button class="button light" data-action="invite">邀请伙伴</button><button class="text-button" data-action="manage">管理活动</button>` : `<button class="text-button danger" data-action="leave" ${terminal(a) || a.paused || a.status === 'voting' ? 'disabled' : ''}>退出活动</button>`}</div></section>`;
  }
  function feedbackPage() {
    const mine = state.feedback.filter(f => f.memberId === viewer());
    return `<div class="page-heading"><div><div class="eyebrow">BETTER, WITH YOU</div><h1>一起把相聚这件事做好<span class="heading-dot">.</span></h1><p>告诉我们你的想法，或记录演示中遇到的问题。</p></div></div>
      <div class="feedback-layout"><section class="panel"><h2>留下你的建议</h2><form id="feedback-form"><label>反馈类型<select name="category"><option>功能建议</option><option>体验问题</option><option>推荐结果</option><option>其他反馈</option></select></label><label>反馈内容<textarea name="content" rows="6" maxlength="1000" required placeholder="你希望 MeetPoint 可以做得更好的地方……"></textarea></label><p class="panel-tip">演示反馈只保存在当前浏览器，不会发送给团队。真实管理员处理流程待后端接入。</p><button class="button primary" type="submit">保存反馈 ${icon('arrow')}</button></form></section>
      <section class="panel"><h2>我的反馈 <span class="count-badge">${mine.length}</span></h2>${mine.length ? mine.map(f => `<article class="feedback-item"><div class="inline"><strong>${esc(f.category)}</strong><span class="status">本地已记录</span></div><p>${esc(f.content)}</p><small>${new Date(f.at).toLocaleString('zh-CN')}</small></article>`).join('') : '<div class="empty-state compact"><p>还没有反馈记录。<br>你的想法，会让下一次见面更好。</p></div>'}</section></div>`;
  }
  function expiredPage() {
    return `<div class="empty-state"><h2>这段未完成的约定，已超过恢复期限</h2><p>游客在最近一次有效操作后 24 小时、演示账号 7 天内可恢复。<br>这里只限制当前身份，伙伴的记录仍然保留。切换其他有效成员，或发起新的活动。</p><button class="button primary" data-action="create">发起新活动</button></div>`;
  }
  function render() {
    const a = active();
    if (!a.members.some(m => m.id === viewer())) state.identities[a.id] = a.hostId;
    const restricted = !canAccess() && !['calendar', 'overview'].includes(view);
    $('#app').innerHTML = `${sidebar()}<div class="app-shell">${header()}<main>${restricted ? expiredPage() : ({ calendar: journal.page, recommend: recommendations, overview, members: membersPage, feedback: feedbackPage }[view])()}<footer><span>MeetPoint <span class="footer-separator">/</span> 见面有期，回忆有迹</span><span>OUR LITTLE JOURNAL · VOL. 02</span></footer></main></div>`;
    journal.hydrate();
  }
  function openModal(title, body, wide = false) {
    focusBeforeModal = document.activeElement;
    const dialog = $('#modal');
    dialog.className = wide ? 'wide' : '';
    dialog.innerHTML = `<div class="modal-header"><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close')}</button></div><div class="modal-body">${body}</div>`;
    if (!dialog.open) dialog.showModal();
  }
  function closeModal() {
    $('#modal').close();
    if (focusBeforeModal?.isConnected) focusBeforeModal.focus();
  }
  function requirements() {
    const a = active(), m = self();
    if (!m) return toast('请先加入活动');
    openModal('我的出行需求', `<p class="modal-intro">从哪里出发，想怎样相聚，都由你来决定。</p><form id="requirements-form">
      <label>出发地 <span class="label-note">Demo 提供上海示例位置</span><select name="originIndex" required><option value="">请选择出发地</option>${M.ORIGINS.map((o, i) => `<option value="${i}" ${m.origin?.name === o.name ? 'selected' : ''}>${o.name}</option>`).join('')}</select></label>
      <div class="form-grid"><label>交通方式<select name="mode">${['公共交通', '驾车', '步行', '骑行'].map(mode => `<option ${m.mode === mode ? 'selected' : ''}>${mode}</option>`).join('')}</select></label><label>活动偏好<select name="preference">${M.OPTIONS[a.type].map(p => `<option ${m.preference === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label></div>
      <label>人均预算上限（元）<input name="budget" type="number" min="0" max="5000" value="${m.budget}" required></label>
      <label class="checkbox-label"><input name="shared" type="checkbox" ${m.shared ? 'checked' : ''}><span>向其他成员公开我的具体出发地<small>关闭后，位置仍用于推荐计算，但不会在其他人的页面中显示。</small></span></label>
      ${a.status === 'voting' ? '<div class="notice">本轮候选保持不变。修改需求后，可申请重新推荐。</div>' : ''}
      <button type="submit" class="button primary full">保存我的需求 ${icon('check')}</button></form>`);
  }
  function identityOptions() {
    return '<label>演示参与身份<select name="identityType"><option value="guest">游客 · 24 小时内恢复</option><option value="account">演示账号 · 7 天内恢复</option></select></label>';
  }
  function create(date = M.dateKey()) {
    if (!M.validDate(date)) date = M.dateKey();
    openModal('在日历里，约一次见面', `<p class="modal-intro">先留一个日子，再一起决定在哪里相聚。</p><form id="create-form"><label>活动名称<input name="title" maxlength="40" required placeholder="例如：周五下班后的放松小聚"></label><div class="form-grid"><label>聚会日期<input name="date" type="date" value="${date}" required></label><label>见面时间<input name="time" type="time" value="18:30" required></label></div><label>你的昵称<input name="nickname" maxlength="16" required value="${esc(self()?.name || '')}"></label><label>活动类型<select name="type">${Object.keys(M.OPTIONS).map(t => `<option>${t}</option>`).join('')}</select></label>${identityOptions()}<div class="subtle-box">创建后自动保留在当天日历。支持 2—10 人；演示账号仅用于验证恢复规则，不是真实登录。</div><button type="submit" class="button primary full">创建并邀请伙伴 ${icon('arrow')}</button></form>`);
  }
  function join(code = '') {
    openModal('加入一场相聚', `<p class="modal-intro">此版本可加入同一浏览器内已创建的活动。投票期间暂不开放新成员加入。</p><form id="join-form"><label>邀请码<input name="code" required maxlength="6" value="${esc(code)}" placeholder="输入 6 位邀请码"></label><label>你的昵称<input name="nickname" maxlength="16" required placeholder="让伙伴知道你是谁"></label>${identityOptions()}<button class="button primary full" type="submit">加入活动 ${icon('arrow')}</button></form>`);
  }
  function invite() {
    const a = active();
    openModal('好的相聚，从一句邀请开始', `<p class="modal-intro">活动：${esc(a.title)}</p><div class="invite-code"><small>活动邀请码</small><strong>${a.code}</strong><button class="button light" data-action="copy">${icon('link')} 复制邀请链接</button></div><div class="notice">本地 Demo 不支持跨设备同步。可在此浏览器添加成员，再切换身份演示。</div><button class="button primary full" data-action="join-current" ${a.status === 'voting' || terminal(a) || a.paused ? 'disabled' : ''}>添加演示成员 ${icon('plus')}</button>${a.status === 'voting' ? '<p class="panel-tip">本轮正在投票，成员名单已锁定。可创建新活动体验邀请流程。</p>' : ''}`);
  }
  function details(id) {
    const a = active(), p = a.candidates.find(p => p.id === id);
    if (!p) return;
    openModal(`${esc(p.name)} · 为什么推荐这里`, `<div class="detail-score"><span>演示参考分 · 非约定权重</span><strong>${p.score.toFixed(1)}<small> / 10</small></strong><p>各维度采用 0—10 分。三组分别按公平性、偏好匹配、交通便利性优先排序。</p></div>
      <div class="dimension-list">${[['fairness', '出行公平性', `最长与最短出行时间相差 ${p.gap} 分钟；演示公式：10 − 时间差 / 8`], ['time', '整体耗时', `全员平均 ${p.average} 分钟；演示公式：10 − 平均用时 / 12`], ['preference', '偏好匹配', '演示匹配模型：活动偏好 60%，示例预算适配 40%；并非甲方约定权重'], ['transit', '交通便利', '内置示例站点便利分，待真实地图数据替换']].map(([key, label, help]) => `<div class="dimension"><div><strong>${label}</strong><span>${p.dimensions[key].toFixed(1)}</span></div><div class="progress-track"><span style="width:${p.dimensions[key] * 10}%"></span></div><p>${help}</p></div>`).join('')}</div>
      <h3>本轮成员出行比较</h3><div class="member-table-wrap"><table><thead><tr><th>成员</th><th>预计用时</th><th>预计费用</th></tr></thead><tbody>${p.routes.map(r => `<tr><td>${esc(a.members.find(m => m.id === r.memberId)?.name || '已退出成员')}</td><td>${r.minutes} 分钟</td><td>未知</td></tr>`).join('')}</tbody></table></div>
      <div class="notice">甲方未约定评分权重。本 Demo 使用四维等权均值作为参考分及平票时的本轮综合排序依据，并非已确认的正式算法。路线为直线距离模拟；费用未知，不纳入评分。示例预算不代表真实报价。</div>`, true);
  }
  function manage() {
    const a = active();
    if (!isHost()) return toast('只有发起者可以管理活动');
    openModal('活动管理', `<p class="modal-intro">${esc(a.title)} · ${statusText(a)}</p><form id="schedule-form"><div class="form-grid"><label>聚会日期<input type="date" name="date" required value="${a.date}"></label><label>见面时间<input type="time" name="time" required value="${a.time}"></label></div><button class="button light" type="submit" ${terminal(a) || a.paused ? 'disabled' : ''}>更新日历安排</button></form><form id="transfer-form"><label>移交发起权限<select name="id" required><option value="">选择接任成员</option>${a.members.filter(m => m.id !== viewer()).map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}</select></label><p class="panel-tip">移交后你仍保留成员身份；投票期间成员名单不变。</p><button class="button light full" type="submit" ${terminal(a) ? 'disabled' : ''}>确认移交权限</button></form>
      ${a.status !== 'voting' && !terminal(a) && !a.paused ? `<div class="manage-members"><h3>成员管理</h3>${a.members.filter(m => m.id !== a.hostId).map(m => `<div class="inline"><span>${esc(m.name)}</span><button class="text-button danger" data-action="remove" data-value="${m.id}">移除</button></div>`).join('')}</div>` : ''}
      <div class="danger-zone"><h3>取消本次活动</h3><p>取消后保留记录，但无法继续推荐或投票。</p><button class="button danger-button full" data-action="cancel-confirm" ${terminal(a) ? 'disabled' : ''}>取消活动</button></div>`);
  }
  function confirmAction(title, text, action, label = '确认继续') {
    openModal(title, `<p class="modal-intro">${text}</p><div class="modal-actions"><button class="button light" data-action="close-modal">再想想</button><button class="button primary" data-action="${action}">${label}</button></div>`);
  }
  function navigate() {
    const a = active(), p = a.candidates.find(p => p.id === a.resultId), m = self();
    if (!p || !m?.origin) return toast('请先确认结果并填写出发地');
    const params = new URLSearchParams({
      from: `${m.origin.lng},${m.origin.lat},${m.origin.name}`, to: `${p.lng},${p.lat},${p.name}`,
      mode: ({ '公共交通': 'bus', '驾车': 'car', '步行': 'walk', '骑行': 'ride' })[m.mode],
      policy: '1', src: 'MeetPoint', coordinate: 'gaode', callnative: '0'
    });
    window.open(`https://uri.amap.com/navigation?${params}`, '_blank', 'noopener,noreferrer');
  }
  const actions = {
    view: value => { view = value; render(); },
    create, invite, requirements, details, manage, navigate, join: () => join(),
    'join-current': () => join(active().code),
    'close-modal': closeModal,
    'select-poi': value => { selectedPoi = value; render(); document.getElementById(`candidate-${value}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); },
    vote: value => run('vote', { id: value }, '选票已保存，截止前仍可改票'),
    recommend: () => active().candidates.length ? confirmAction('重新生成推荐？', '将按最新需求生成候选，并开启新的 24 小时投票。当前轮次与旧选票将失效。', 'recommend-confirm', '确认重新推荐') : run('recommend', {}, '推荐已生成，24 小时投票已开启'),
    'recommend-confirm': () => { if (run('recommend', {}, '已开始新一轮投票，旧票已清空')) closeModal(); },
    request: () => openModal('申请重新推荐', '<form id="request-form"><label>告诉大家为什么想换一组地点<textarea name="reason" maxlength="300" required placeholder="例如：出发地变了，希望大家的路程更均衡。"></textarea></label><button type="submit" class="button primary">提交申请</button></form>'),
    'reject-request': id => openModal('拒绝申请并说明原因', `<form id="reject-form"><input type="hidden" name="id" value="${esc(id)}"><label>原因（所有成员可见）<textarea name="reason" maxlength="300" required></textarea></label><button type="submit" class="button primary">确认拒绝</button></form>`),
    'recommend-group': value => { group = value; selectedPoi = null; render(); },
    'identity-info': () => { const info = M.access(active(), viewer()); openModal('我的演示身份', `<p class="modal-intro">${esc(self().name)} · ${self().identityType === 'account' ? '演示账号（7 天）' : '游客（24 小时）'}</p><p>未完成活动的恢复截止：${new Date(info.expiresAt).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}</p><p class="panel-tip">从本人最近一次有效操作起算。仅查看、切换视角和自动计票不会续期。已完成的聚会手账不按此期限清理；演示身份不是真实认证。</p>`); },
    finish: () => confirmAction('确认这次相聚的地点？', '将按有效票数确定集合点；平票按本轮综合排名决定。确认后结果不可修改。', 'finish-confirm', '确定集合点'),
    'finish-confirm': () => { if (run('finish', {}, '集合地点已确定，准备出发吧！')) closeModal(); },
    pause: () => run('pause', {}, '活动已暂停，剩余投票时间已保留'),
    resume: () => run('resume', {}, '活动已恢复，继续原有投票时间'),
    revote: () => run('revote', {}, '已沿用候选开启新的 24 小时投票'),
    'cancel-confirm': () => confirmAction('确定取消活动？', '取消后无法恢复本次活动，但会保留活动记录。', 'cancel', '确认取消'),
    cancel: () => { if (run('cancel', {}, '活动已取消')) closeModal(); },
    remove: value => { if (run('remove', { id: value }, '成员已移除')) manage(); },
    leave: () => confirmAction('退出这场活动？', '退出后，演示界面将切换为发起者视角。', 'leave-confirm', '确认退出'),
    'leave-confirm': () => { if (run('leave', {}, '已退出活动，演示切换至发起者')) closeModal(); },
    'open-activity': value => { state.activeId = value; state.identities[value] ||= active().hostId; selectedPoi = null; view = 'recommend'; save(); render(); },
    sample: () => { const a = M.seed(); state.activities.unshift(a); state.activeId = a.id; state.identities[a.id] = a.hostId; selectedPoi = null; view = 'recommend'; save(); render(); toast('已创建新的示例活动'); },
    copy: async () => {
      const url = new URL(location.href); url.hash = ''; url.search = ''; url.searchParams.set('invite', active().code);
      try { await navigator.clipboard.writeText(url.href); toast('邀请链接已复制（仅同一浏览器的本地数据可用）'); }
      catch { openModal('复制邀请链接', `<p class="modal-intro">当前浏览器不支持自动复制，请手动复制下方内容。该链接只能访问本浏览器中已有的活动。</p><label>邀请链接<input readonly value="${esc(url.href)}" onclick="this.select()"></label>`); }
    },
    about: () => openModal('关于这本相聚手账', '<p class="modal-intro">根据 neXus 团队 MeetPoint SRS V1.1 初始化的本地交互原型。</p><ul class="about-list"><li>支持三组 Top3、申请审批与原因展示、多轮投票，以及日历、照片、每人感受与留言。</li><li>右上角可切换成员，模拟不同参与者的操作。</li><li>数据保存在本浏览器；没有真实登录、服务器同步或管理员权限。</li><li>示意地图和出行时间均为模拟，未调用地图定位接口。导航按钮会打开第三方地图并传递当前示例出发地与目的地。</li><li>已实现游客 24 小时、演示账号 7 天的本地恢复检查；生产认证与隐私隔离仍需后端。照片保存在本浏览器数据库，清除网站数据会删除手账。</li></ul>')
  };
  function activate(id, nextView = 'calendar') {
    state.activeId = id; state.identities[id] ||= active().hostId; view = nextView; save();
  }
  const journal = window.createMeetPointJournal({ M, esc, icon, avatar, getState: () => state, active, viewer, activate, replace, save, render, openModal, toast, create, statusText });
  Object.assign(actions, journal.actions);
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-action]');
    if (!button || button.disabled) return;
    event.preventDefault();
    try { await actions[button.dataset.action]?.(button.dataset.value); } catch (error) { toast(error.message); }
  });
  document.addEventListener('change', async event => {
    try {
      await journal.change(event.target);
      if (event.target.id === 'identity') { state.identities[active().id] = event.target.value; save(); render(); toast(`已切换到 ${self().name} 的演示视角`); }
    } catch (error) { toast(error.message); }
  });
  document.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.target;
    if (await journal.submit(form)) return;
    const data = new FormData(form);
    try {
      if (form.getAttribute('id') === 'request-form') {
        if (run('request', { reason: data.get('reason') }, '申请已提交，处理状态对所有成员可见')) closeModal();
      } else if (form.getAttribute('id') === 'reject-form') {
        if (run('reject-request', { id: data.get('id'), reason: data.get('reason') }, '已拒绝申请并公开原因')) closeModal();
      } else if (form.getAttribute('id') === 'schedule-form') {
        if (run('schedule', { date: data.get('date'), time: data.get('time') }, '日历安排已更新')) closeModal();
      } else if (form.getAttribute('id') === 'create-form') {
        const a = M.createActivity(data.get('title'), data.get('nickname'), data.get('type'), Date.now(), { date: data.get('date'), time: data.get('time'), identityType: data.get('identityType') });
        journal.setDate(a.date);
        state.activities.unshift(a); state.activeId = a.id; state.identities[a.id] = a.hostId;
        selectedPoi = null; view = 'recommend'; save(); closeModal(); render(); invite();
      } else if (form.getAttribute('id') === 'join-form') {
        const a = state.activities.find(a => a.code === data.get('code').trim().toUpperCase());
        if (!a) throw new Error('未在本浏览器找到该活动，请检查邀请码');
        const updated = M.act(a, null, 'join', { name: data.get('nickname'), identityType: data.get('identityType') });
        replace(updated); state.activeId = a.id; state.identities[a.id] = updated.members.at(-1).id;
        selectedPoi = null; view = 'recommend'; save(); closeModal(); render(); requirements();
      } else if (form.getAttribute('id') === 'requirements-form') {
        if (run('requirements', { originIndex: Number(data.get('originIndex')), mode: data.get('mode'), preference: data.get('preference'), budget: Number(data.get('budget')), shared: data.has('shared') }, '出行需求已保存')) closeModal();
      } else if (form.getAttribute('id') === 'transfer-form') {
        if (run('transfer', { id: data.get('id') }, '权限已移交，你现在是普通成员')) closeModal();
      } else if (form.getAttribute('id') === 'feedback-form') {
        const content = data.get('content').trim();
        if (!content) throw new Error('请填写反馈内容');
        state.feedback.unshift({ id: M.uid(), memberId: viewer(), category: data.get('category'), content: content.slice(0, 1000), at: Date.now() });
        save(); render(); toast('反馈已保存在本浏览器');
      }
    } catch (error) { toast(error.message); }
  });
  $('#modal').addEventListener('click', event => { if (event.target === $('#modal')) { const r = $('#modal').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeModal(); } });
  window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) { state = load(); closeModal(); render(); } });
  function synchronizeTime() {
    let changed = false;
    state.activities = state.activities.map(a => { const next = M.tick(a); if (next.status !== a.status) changed = true; return next; });
    const accessNow = canAccess();
    if (lastAccessState !== null && accessNow !== lastAccessState) {
      if (!accessNow) closeModal();
      render();
    }
    lastAccessState = accessNow;
    if (changed) { try { save(); } catch (error) { toast(error.message); } render(); }
    const countdown = $('#countdown'); if (countdown) countdown.textContent = timerLabel(active());
  }
  try { save(); } catch (error) { storageWarning = error.message; }
  synchronizeTime(); render();
  setInterval(synchronizeTime, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) synchronizeTime(); });
  const invitation = new URL(location.href).searchParams.get('invite');
  if (invitation) join(invitation.slice(0, 6));
  if (storageWarning) toast(storageWarning);
})();
