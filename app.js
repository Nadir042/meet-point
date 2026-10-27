/* Unified demo: new activities use the shared API; older seeded examples stay browser-local. */
(() => {
  'use strict';
  const M = window.MeetPoint;
  const STORAGE_KEY = 'meetpoint-demo-v1';
  const SHARED_KEY = 'meetpoint-shared-sessions-v1';
  const PROFILE_KEY = 'meetpoint-guest-profiles-v1';
  const ACCOUNT_KEY = 'meetpoint-account-session-v1';
  const AVATAR_KEY = 'meetpoint-local-avatars-v1';
  const sessionKey = (profileId, activityId) => `${profileId}|${activityId}`;
  const sessionActivityId = key => key.split('|').at(-1);
  let sharedSessions = {};
  try { sharedSessions = JSON.parse(localStorage.getItem(SHARED_KEY)) || {}; } catch { sharedSessions = {}; }
  let accountAuth = null;
  try { accountAuth = JSON.parse(localStorage.getItem(ACCOUNT_KEY)); } catch { accountAuth = null; }
  let localAvatars = {};
  try { localAvatars = JSON.parse(localStorage.getItem(AVATAR_KEY)) || {}; } catch { localAvatars = {}; }
  const sharedPhotoUrls = new Map();
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
  let profiles;
  let newProfileStore = false;
  let defaultGuestId = null;
  try { profiles = JSON.parse(localStorage.getItem(PROFILE_KEY)); } catch { profiles = null; }
  if (!profiles || !Array.isArray(profiles.list)) {
    const initial = { id: M.uid(), name: '游客', lastActivityId: null };
    // First visit opens the original guided example; the guest profile remains available for shared activities.
    profiles = { activeId: 'examples', lastGuestId: initial.id, list: [initial] };
    newProfileStore = true;
    defaultGuestId = initial.id;
  }
  const migratedSessions = {};
  for (const [key, session] of Object.entries(sharedSessions)) {
    const id = sessionActivityId(key);
    if (session.profileId && profiles.list.some(profile => profile.id === session.profileId)) continue;
    // Legacy sessions have no reliable person identifier. Preserve each session separately.
    const profile = { id: M.uid(), name: session.name || '游客', lastActivityId: id };
    profiles.list.push(profile);
    session.profileId = profile.id;
  }
  for (const [key, session] of Object.entries(sharedSessions))
    migratedSessions[sessionKey(session.profileId, sessionActivityId(key))] = session;
  sharedSessions = migratedSessions;
  const lastSession = Object.entries(sharedSessions).find(([key]) => sessionActivityId(key) === state.activeId)?.[1];
  if (newProfileStore && Object.keys(sharedSessions).length) {
    profiles.activeId = lastSession?.profileId || Object.values(sharedSessions)[0].profileId;
    profiles.list = profiles.list.filter(profile => profile.id !== defaultGuestId);
  }
  for (const profile of profiles.list.filter(item => item.kind !== 'account')) {
    // Undo the earlier generated-label experiment without combining distinct credentials.
    if (/^游客\d{6}$/.test(profile.name))
      profile.name = Object.values(sharedSessions).find(session => session.profileId === profile.id)?.name || '游客';
  }
  if (!profiles.list.some(profile => profile.id === profiles.lastGuestId && profile.kind !== 'account'))
    profiles.lastGuestId = profiles.list.find(profile => profile.kind !== 'account')?.id || null;
  if (!profiles.list.some(profile => profile.id === profiles.activeId) && profiles.activeId !== 'examples')
    profiles.activeId = lastSession?.profileId || profiles.list[0]?.id || 'examples';
  if (accountAuth?.id && accountAuth?.token) {
    const id = `account:${accountAuth.id}`;
    profiles.list = profiles.list.filter(profile => profile.kind !== 'account' || profile.id === id);
    if (!profiles.list.some(profile => profile.id === id)) profiles.list.push({ id, name: accountAuth.username, kind: 'account', lastActivityId: null });
    if (String(profiles.activeId).startsWith('account:')) profiles.activeId = id;
  } else {
    profiles.list = profiles.list.filter(profile => profile.kind !== 'account');
    if (String(profiles.activeId).startsWith('account:')) profiles.activeId = 'examples';
  }
  function saveProfiles() {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profiles));
    localStorage.setItem(SHARED_KEY, JSON.stringify(sharedSessions));
    if (accountAuth) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(accountAuth));
    else localStorage.removeItem(ACCOUNT_KEY);
  }
  try { saveProfiles(); } catch { storageWarning = '浏览器存储不可用，游客身份可能无法恢复。'; }
  let view = profiles.activeId === 'examples' ? 'calendar' : 'overview';
  let group = 'fairness';
  let selectedPoi = null;
  let poiContext = null;
  let poiTrigger = null;
  let menuOpen = false;
  let focusBeforeModal = null;
  let toastTimer;
  let lastAccessState = null;
  const active = () => state.activities.find(a => a.id === state.activeId) || state.activities[0];
  const sessionFor = (id, profileId = profiles.activeId) => sharedSessions[sessionKey(profileId, id)];
  const sharedActivityIds = new Set(Object.keys(sharedSessions).map(sessionActivityId));
  state.activities = state.activities.filter(a => !sharedActivityIds.has(a.id) && !a.viewerId);
  if (!state.activities.length) {
    const example = M.seed();
    state.activities.push(example);
    state.identities[example.id] = example.hostId;
  }
  const isShared = a => !!sessionFor(a?.id)?.token;
  const currentProfile = () => profiles.list.find(profile => profile.id === profiles.activeId);
  const isAccount = () => currentProfile()?.kind === 'account';
  const visibleActivities = () => state.activities.filter(a => profiles.activeId === 'examples' ? !sharedActivityIds.has(a.id) : !!sessionFor(a.id));
  async function restoreProfile() {
    const profileId = profiles.activeId;
    if (isAccount()) {
      const result = await api('/api/account/activities', 'GET', null, accountAuth.token);
      for (const key of Object.keys(sharedSessions)) if (key.startsWith(`${profileId}|`)) delete sharedSessions[key];
      for (const activity of result.activities) {
        sharedSessions[sessionKey(profileId, activity.id)] = { token: accountAuth.token, title: activity.title, name: activity.members.find(m => m.id === activity.viewerId)?.name, profileId };
        if (profiles.activeId === profileId) acceptShared({ activity });
      }
      saveProfiles();
      return [];
    }
    return Promise.allSettled(Object.entries(sharedSessions).filter(([, session]) => session.profileId === profileId).map(async ([key, session]) => {
      try {
        const result = await api(`/api/activities/${sessionActivityId(key)}`, 'GET', null, session.token);
        if (profiles.activeId === profileId) acceptShared(result);
      } catch (error) {
        if (error.status === 403 || error.status === 401) { delete sharedSessions[key]; saveProfiles(); return; }
        throw error;
      }
    }));
  }
  async function selectProfile(id) {
    if (id !== 'examples' && !profiles.list.some(profile => profile.id === id)) return;
    profiles.activeId = id;
    if (profiles.list.some(profile => profile.id === id && profile.kind !== 'account')) profiles.lastGuestId = id;
    for (const url of sharedPhotoUrls.values()) URL.revokeObjectURL(url);
    sharedPhotoUrls.clear();
    state.activities = state.activities.filter(a => !sharedActivityIds.has(a.id));
    const results = await restoreProfile();
    const activities = visibleActivities();
    state.activeId = activities.find(a => a.id === currentProfile()?.lastActivityId)?.id || activities[0]?.id || state.activeId;
    selectedPoi = null;
    view = 'overview';
    saveProfiles(); save(); render();
    if (results.some(result => result.status === 'rejected')) toast('部分共享活动暂时无法恢复，请检查服务或身份期限');
  }
  function attachToProfile(a, token) {
    let profile = currentProfile();
    if (isAccount()) token = accountAuth.token;
    else if (!profile) {
      profile = profiles.list.find(item => item.id === profiles.lastGuestId && item.kind !== 'account');
      if (!profile) profile = { id: M.uid(), name: '游客', lastActivityId: null };
      if (!profiles.list.some(item => item.id === profile.id)) profiles.list.push(profile);
    }
    if (profile.kind !== 'account' && profile.name === '游客')
      profile.name = a.members.find(m => m.id === a.viewerId).name;
    if (profile.kind !== 'account') profiles.lastGuestId = profile.id;
    sharedSessions[sessionKey(profile.id, a.id)] = { token, title: a.title, name: a.members.find(m => m.id === a.viewerId).name, profileId: profile.id };
    sharedActivityIds.add(a.id);
    profiles.activeId = profile.id;
    profile.lastActivityId = a.id;
    saveProfiles();
  }
  const ready = a => isShared(a) ? a.requirementsReady : M.ready(a);
  const viewer = () => state.identities[active().id];
  const self = () => active().members.find(m => m.id === viewer());
  const isHost = () => active().hostId === viewer();
  const canAccess = () => M.access(active(), viewer()).allowed;
  const terminal = a => ['completed', 'cancelled'].includes(a.status);
  const statusText = a => a.paused ? '活动已暂停' : ({ collecting: '正在收集需求', voting: '正在投票', 'no-votes': '等待重新投票', completed: '已确定集合点', cancelled: '活动已取消' }[a.status]);
  function save() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state,
      activities: state.activities.filter(a => !sharedActivityIds.has(a.id)),
      identities: Object.fromEntries(Object.entries(state.identities).filter(([id]) => !sharedActivityIds.has(id)))
    })); }
    catch { throw new Error('本地保存失败，可能是存储空间不足。请释放空间后重试。'); }
  }
  function replace(a) {
    const previous = state.activities;
    state.activities = state.activities.map(old => old.id === a.id ? a : old);
    try { save(); } catch (error) { state.activities = previous; throw error; }
  }
  async function api(url, method = 'GET', data, token) {
    const response = await fetch(url, { method, headers: { ...(data ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: data ? JSON.stringify(data) : undefined });
    const result = await response.json();
    if (!response.ok) { const error = new Error(result.error || '服务器请求失败'); error.status = response.status; throw error; }
    return result;
  }
  function acceptShared(result) {
    const a = result.activity;
    sharedActivityIds.add(a.id);
    const index = state.activities.findIndex(old => old.id === a.id);
    if (index < 0) state.activities.unshift(a);
    else state.activities[index] = a;
    state.identities[a.id] = a.viewerId;
    return a;
  }
  async function refreshShared(id = active().id, show = true) {
    if (!isShared({ id })) return;
    const result = await api(`/api/activities/${id}`, 'GET', null, sessionFor(id).token);
    const previous = state.activities.find(a => a.id === id);
    if (JSON.stringify(previous) !== JSON.stringify(result.activity)) {
      acceptShared(result);
      if (show) render();
    }
  }
  async function perform(action, data = {}) {
    if (isShared(active())) {
      const id = active().id;
      const result = await api(`/api/activities/${id}/actions`, 'POST', { action, data }, sessionFor(id).token);
      acceptShared(result);
    } else replace(M.act(active(), viewer(), action, data));
  }
  async function uploadSharedPhoto(photo) {
    const a = active();
    const bytes = new Uint8Array(await photo.blob.arrayBuffer());
    let binary = '';
    for (let i = 0; i < bytes.length; i += 32768) binary += String.fromCharCode(...bytes.subarray(i, i + 32768));
    const result = await api(`/api/activities/${a.id}/photos`, 'POST', { id: photo.id, name: photo.name, mime: photo.blob.type, base64: btoa(binary) }, sessionFor(a.id).token);
    acceptShared(result);
  }
  async function sharedPhotoUrl(activityId, photoId) {
    if (sharedPhotoUrls.has(photoId)) return sharedPhotoUrls.get(photoId);
    const response = await fetch(`/api/activities/${activityId}/photos/${photoId}`, { headers: { Authorization: `Bearer ${sessionFor(activityId).token}` } });
    if (!response.ok) throw new Error('照片暂时无法读取');
    const url = URL.createObjectURL(await response.blob());
    sharedPhotoUrls.set(photoId, url);
    return url;
  }
  function forgetSharedPhoto(photoId) {
    if (sharedPhotoUrls.has(photoId)) { URL.revokeObjectURL(sharedPhotoUrls.get(photoId)); sharedPhotoUrls.delete(photoId); }
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
  async function run(action, data = {}, message = '已更新') {
    try {
      const sharedId = isShared(active()) ? active().id : null;
      await perform(action, data);
      if (action === 'leave' && sharedId) {
        delete sharedSessions[sessionKey(profiles.activeId, sharedId)];
        saveProfiles();
        state.activities = state.activities.filter(a => a.id !== sharedId);
        state.activeId = state.activities[0].id;
        view = 'overview'; save(); render(); toast(message); return true;
      }
      if (!active().members.some(m => m.id === viewer())) state.identities[active().id] = active().hostId;
      save(); if (action === 'vote' && view === 'recommend' && canAccess()) refreshVoteUI(); else render(); toast(message); return true;
    } catch (error) { toast(error.message); return false; }
  }
  function avatar(m, index, small = false) {
    return `<span class="avatar avatar-${index % 5}${small ? ' small' : ''}" title="${esc(m.name)}">${esc(m.name.slice(0, 1))}</span>`;
  }
  function identityAvatar(name, id, small = true) {
    const image = localAvatars[id];
    return image && /^data:image\/(?:jpeg|png|webp);base64,/.test(image)
      ? `<span class="avatar avatar-0${small ? ' small' : ''}" title="${esc(name)}"><img src="${esc(image)}" alt=""></span>`
      : avatar({ name }, 0, small);
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
  function header() {
    const profile = currentProfile();
    const identityName = profile ? profile.name : '本机示例';
    const navs = [['calendar', '相聚日历'], ['overview', '我的活动'], ['recommend', '集合点推荐'], ['members', '成员与需求'], ['feedback', '意见反馈']];
    return `<header class="site-header">
      <a class="site-brand" href="#" data-action="view" data-value="calendar" aria-label="MeetPoint 相聚日历"><span class="brand-mark">${icon('pin')}</span><span>MeetPoint</span></a>
      <nav id="primary-nav" class="primary-nav ${menuOpen ? 'is-open' : ''}" aria-label="主导航">${navs.map(([id, label]) => `<button class="top-nav-item ${view === id ? 'active' : ''}" ${view === id ? 'aria-current="page"' : ''} data-action="view" data-value="${id}">${label}</button>`).join('')}</nav>
      <div class="header-account"><button class="text-button identity-kind" data-action="identity-info" aria-label="身份与设置：${esc(identityName)}">${identityAvatar(identityName, profiles.activeId)}<span>${esc(identityName)}</span></button></div>
      <button class="menu-toggle button light" data-action="toggle-menu" aria-expanded="${menuOpen}" aria-controls="primary-nav">菜单</button>
    </header>`;
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
  function mapPoints() {
    const a = active();
    const ids = [...(a.groups[group] || [])];
    if (a.resultId && !ids.includes(a.resultId)) ids.push(a.resultId);
    return ids.map(id => a.candidates.find(p => p.id === id)).filter(Boolean);
  }
  function mapPanel() {
    const a = active();
    const visible = M.visibleMembers(a, viewer()).filter(m => m.origin);
    const points = mapPoints();
    return `<section class="panel map-panel"><div class="panel-heading"><h3>${icon('pin')} 相聚地图</h3><span class="tiny-label">上海 · 地点分布示意</span></div>
      <div class="map-stage"><div class="map-canvas" aria-label="候选集合点示意地图">
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
        ${points.map((p, i) => `<button id="marker-${p.id}" class="poi-marker ${selectedPoi === p.id ? 'selected' : ''} ${a.resultId === p.id ? 'is-result' : ''}" style="left:${p.x}%;top:${p.y}%" data-action="select-poi" data-value="${p.id}" aria-expanded="${selectedPoi === p.id}" aria-controls="poi-popup" aria-label="${a.resultId === p.id ? '最终集合点' : `查看候选 ${i + 1}`} ${esc(p.name)}"><span>${a.resultId === p.id ? '✓' : i + 1}</span><strong>${esc(p.name)}${a.resultId === p.id ? ' · 最终地点' : ''}</strong></button>`).join('')}
        <div class="map-caption"><span><i class="legend-dot"></i> 候选集合点</span><span><i class="legend-dot origin"></i> 已公开 / 本人出发地</span></div>
        <span class="map-compass">N ↑</span>
      </div><div id="poi-popup-host">${renderPoiPopup()}</div></div><div class="map-footer">${icon('lock')} 隐藏的出发地不会在其他成员视角中展示。<span>示意图 · 非真实地图</span></div></section>`;
  }
  function candidateCard(p, i) {
    const a = active();
    const vote = a.votes[viewer()];
    const count = M.tally(a)[p.id];
    const mine = p.routes.find(r => r.memberId === viewer());
    const winner = a.resultId === p.id;
    return `<article id="candidate-${p.id}" class="candidate ${selectedPoi === p.id ? 'focused' : ''} ${vote === p.id ? 'voted' : ''}">
      <div class="poi-card-top"><span class="poi-rank">${i >= 0 ? `${M.GROUPS.find(g => g.id === group).name} · 第 ${i + 1} 名` : '已确认的最终集合点'}</span><button class="icon-button" data-action="close-poi" aria-label="关闭地点详情">${icon('close')}</button></div>
      <div class="candidate-body"><div class="candidate-title"><h3 id="poi-title">${esc(p.name)}</h3><div class="score">${p.score.toFixed(1)}<small>/ 10</small></div></div><p class="address">${icon('pin')}${esc(p.area)}</p><p class="poi-description">${esc(p.subtitle)}</p>
        <div class="metrics"><div><small>我的预计用时</small><strong>${mine?.minutes ?? '—'}<span> 分钟</span></strong></div><div><small>全员平均用时</small><strong>${p.average}<span> 分钟</span></strong></div></div>
        <p class="group-reason">${group === 'fairness' ? `最长与最短出行相差 ${p.gap} 分钟` : group === 'preference' ? `偏好匹配 ${p.dimensions.preference.toFixed(1)} / 10 分` : `便利度 ${p.dimensions.transit.toFixed(1)} / 10 · 平均 ${p.average} 分钟`}</p><div class="transit-tag">${icon('train')}${esc(p.line)}</div>
        <details class="poi-details"><summary>评分依据与成员路线比较</summary>${scoreDetails(p)}</details>
        <div class="vote-row"><span><strong>${count}</strong> 票支持</span><button class="button ${vote === p.id || winner ? 'primary' : 'vote-button'}" data-action="vote" data-value="${p.id}" ${a.status !== 'voting' || a.paused || !canAccess() || a.deadline <= Date.now() ? 'disabled' : ''}>${vote === p.id || winner ? icon('check') : ''}${winner ? '最终集合点' : vote === p.id ? '我已投票' : vote ? '改投这里' : '投票给这里'}</button></div>
        <p class="poi-vote-status">${a.paused ? '活动已暂停，暂不可投票或改票' : a.status === 'voting' ? a.deadline <= Date.now() ? '本轮投票已截止，正在更新结果' : vote === p.id ? '这是你当前的选择，截止前可以改票' : '三组推荐共用每人一票，截止前可以改票' : statusText(a)} · 预计费用：未知</p>
        ${winner ? '<button class="button light full" data-action="navigate">打开高德导航</button>' : ''}
      </div></article>`;
  }
  function currentPoiContext() {
    return [active().id, viewer(), group, active().round].join(':');
  }
  function renderPoiPopup() {
    const p = mapPoints().find(p => p.id === selectedPoi);
    if (!p || !canAccess()) return '';
    return `<section id="poi-popup" class="poi-popup" role="region" aria-labelledby="poi-title" tabindex="-1">${candidateCard(p, (active().groups[group] || []).indexOf(p.id))}</section>`;
  }
  function positionPoiPopup() {
    const popup = $('#poi-popup'), canvas = $('.map-canvas'), marker = document.getElementById(`marker-${selectedPoi}`);
    if (!popup || !canvas || !marker) return;
    if (window.matchMedia('(max-width: 700px)').matches) {
      popup.style.removeProperty('left'); popup.style.removeProperty('top'); popup.style.removeProperty('max-height');
      return;
    }
    const r = canvas.getBoundingClientRect(), m = marker.getBoundingClientRect();
    const width = popup.offsetWidth, gap = 14, margin = 12;
    const headerBottom = $('.site-header').getBoundingClientRect().bottom;
    const top = Math.max(margin, headerBottom + margin - r.top);
    const bottom = Math.min(r.height - margin, window.innerHeight - margin - r.top);
    popup.style.maxHeight = `${Math.max(100, bottom - top)}px`;
    const right = m.right - r.left + gap;
    const left = right + width <= r.width - margin ? right : m.left - r.left - width - gap;
    popup.style.left = `${Math.max(margin, Math.min(left, r.width - width - margin))}px`;
    popup.style.top = `${Math.max(top, Math.min(m.top - r.top - 32, bottom - popup.offsetHeight))}px`;
  }
  function updatePoiPopup(focus = false) {
    const host = $('#poi-popup-host');
    if (!host) return;
    host.innerHTML = renderPoiPopup();
    document.querySelectorAll('.poi-marker').forEach(el => {
      const selected = el.dataset.value === selectedPoi;
      el.classList.toggle('selected', selected); el.setAttribute('aria-expanded', String(selected));
    });
    document.querySelectorAll('.poi-shortcuts button').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.value === selectedPoi)));
    positionPoiPopup();
    if (focus) $('#poi-popup')?.focus({ preventScroll: true });
  }
  function closePoi(restoreFocus = true) {
    const fallback = document.getElementById(`marker-${selectedPoi}`);
    selectedPoi = null; poiContext = null;
    updatePoiPopup();
    if (restoreFocus) (poiTrigger?.isConnected ? poiTrigger : fallback)?.focus({ preventScroll: true });
    poiTrigger = null;
  }
  function refreshVoteUI() {
    // Retain the popup node, expanded details, scroll position and keyboard focus.
    const popup = $('#poi-popup');
    if (popup) {
      const template = document.createElement('template');
      template.innerHTML = renderPoiPopup();
      const oldRow = popup.querySelector('.vote-row'), newRow = template.content.querySelector('.vote-row');
      if (oldRow && newRow) {
        oldRow.querySelector('span').innerHTML = newRow.querySelector('span').innerHTML;
        const button = oldRow.querySelector('button'), next = newRow.querySelector('button');
        button.innerHTML = next.innerHTML; button.className = next.className; button.disabled = next.disabled;
      }
      popup.querySelector('.candidate').classList.toggle('voted', active().votes[viewer()] === selectedPoi);
      popup.querySelector('.poi-vote-status').textContent = template.content.querySelector('.poi-vote-status').textContent;
    }
    const support = $('.recommend-support');
    if (support) support.innerHTML = memberPanel() + votePanel();
  }
  function memberPanel() {
    const a = active();
    const members = M.visibleMembers(a, viewer());
    return `<section class="panel member-panel"><div class="panel-heading"><h3>一起出发的伙伴</h3><span class="count-badge">${a.members.length} / 10</span></div>
      <div class="member-list">${members.map((m, i) => `<div class="member-row">${avatar(m, i)}<div><strong>${esc(m.name)} ${m.id === viewer() ? '<small>我</small>' : ''}${m.id === a.hostId ? '<span class="host-tag">发起者</span>' : ''}</strong><p>${m.origin ? esc(m.origin.name) : a.members[i].ready || a.members[i].origin ? `${icon('lock')} 出发地已隐藏` : '待填写出行需求'}</p></div><span class="member-check ${a.votes[m.id] ? 'is-voted' : ''}" title="${a.votes[m.id] ? '已投票' : a.members[i].ready || a.members[i].origin ? '已填写需求' : '待填写'}">${a.votes[m.id] ? icon('check') : a.members[i].ready || a.members[i].origin ? '就绪' : '待填'}</span></div>`).join('')}</div>
      <button class="button full light" data-action="requirements" ${terminal(a) || a.paused ? 'disabled' : ''}>${icon('settings')} 编辑我的出行需求</button>
      <p class="panel-tip">${isShared(a) ? '每位成员在自己的浏览器填写和投票。' : '通过右上角身份切换，可演示每位成员的填写与投票。'}</p></section>`;
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
      ${a.status === 'no-votes' && isHost() ? `<button class="button full primary" data-action="revote" ${a.paused || !ready(a) ? 'disabled' : ''}>零票截止 · 重新开启投票</button>` : ''}
      ${!terminal(a) ? `<div class="management-actions">${isHost() ? `<button class="text-button" data-action="${a.paused ? 'resume' : 'pause'}">${icon(a.paused ? 'arrow' : 'pause')}${a.paused ? '恢复活动' : '暂停活动'}</button><button class="text-button muted" data-action="manage">管理活动 ${icon('chevron')}</button>` : `<button class="text-button" data-action="request" ${a.paused || !ready(a) ? 'disabled' : ''}>申请重新推荐</button>`}</div>` : ''}</section>`;
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
    return `<div class="recommend-page">${activityHeader()}${resultBanner()}
      <section class="recommend-toolbar" aria-label="推荐方案"><div class="group-tabs" role="tablist" aria-label="推荐方案">${M.GROUPS.map(g => `<button id="tab-${g.id}" role="tab" aria-controls="recommend-map" aria-selected="${g.id === group}" tabindex="${g.id === group ? 0 : -1}" class="${g.id === group ? 'selected' : ''}" data-action="recommend-group" data-value="${g.id}"><strong>${g.name}</strong><small>TOP ${a.groups[g.id]?.length || 0}</small></button>`).join('')}</div>
      <button class="text-button" data-action="${isHost() ? 'recommend' : 'request'}" ${terminal(a) || a.paused || !ready(a) ? 'disabled' : ''}>${icon('refresh')} ${a.candidates.length ? isHost() ? '重新推荐' : '申请重新推荐' : '生成推荐'}</button></section>
      <p class="group-description">${selectedGroup.description} 点击地点标记查看详情并投票。</p>
      <div id="recommend-map" role="tabpanel" aria-labelledby="tab-${group}">
      <div class="poi-shortcuts" aria-label="快速选择地点">${mapPoints().map(p => `<button data-action="select-poi" data-value="${p.id}" aria-pressed="${selectedPoi === p.id}">${esc(p.name)}${a.resultId === p.id ? ' · 最终地点' : ''}</button>`).join('')}</div>
      ${mapPanel()}
      ${!candidates.length ? `<div class="empty-state compact"><h3>好去处，从了解每个人开始</h3><p>邀请至少一位伙伴，并为所有成员填写出行需求。准备就绪后生成推荐并开放投票。</p><button class="button primary" data-action="${ready(a) && isHost() ? 'recommend' : 'requirements'}" ${terminal(a) || a.paused ? 'disabled' : ''}>${ready(a) && isHost() ? '生成三组推荐' : '填写我的出行需求'}</button></div>` : ''}</div>
      <div class="data-note">三组共用每人一票，同一地点跨组出现时票数合并。地图、路线与评分为演示数据；费用未知，甲方未约定评分权重。</div>
      <div class="recommend-support">${memberPanel()}${votePanel()}</div>${requestsPanel(a)}</div>`;
  }
  function overview() {
    const activities = visibleActivities();
    return `<div class="page-heading"><div><div class="eyebrow">MAKE ROOM FOR A GOOD TIME</div><h1>每一次相聚，都从这里开始<span class="heading-dot">.</span></h1><p>创建、恢复你的活动，和伙伴一起决定下一站。</p></div><button class="button primary" data-action="create">${icon('plus')} 创建活动</button></div>
      <div class="overview-actions"><button class="button light" data-action="join">${icon('link')} 使用邀请码加入</button><button class="text-button" data-action="identity-info">${isAccount() ? '我的账号' : '身份设置'}</button>${isAccount() ? '<button class="text-button" data-action="sample-journal">查看示例手账</button>' : '<button class="text-button" data-action="new-profile">＋ 新游客身份</button><button class="text-button" data-action="account-login">注册／登录</button>'}${profiles.activeId === 'examples' ? `<button class="text-button" data-action="sample">${icon('plus')} 新建示例活动</button>` : ''}</div>
      <div class="activity-grid">${activities.map(a => `<article class="panel activity-card"><div class="inline"><span class="activity-symbol">${icon('people')}</span><span class="status">${isShared(a) ? '多人共享' : '本机示例'} · ${statusText(a)}</span></div><h2>${esc(a.title)}</h2><p>${esc(a.date)} ${esc(a.time)} · ${esc(a.type)} · ${a.members.length} 位伙伴</p><div class="stacked-avatars">${a.members.slice(0, 5).map((m, i) => avatar(m, i, true)).join('')}</div><button class="button light full" data-action="open-activity" data-value="${a.id}">进入活动 ${icon('arrow')}</button></article>`).join('') || `<div class="empty-state compact"><p>${isAccount() ? '这个账号还没有参与活动。使用邀请码加入，或创建一场新活动。' : '这个游客身份还没有参与活动。使用邀请码加入，或创建一场新活动。'}</p></div>`}</div><div class="data-note">${isAccount() ? '这里汇总本账号以不同昵称参与的活动。示例手账单独展示，不计入我的活动。' : '当前只显示所选游客身份参与的活动。切换到“本机示例”可查看引导数据；同一浏览器内的游客切换不提供账号级隐私保护。'}</div>`;
  }
  function membersPage() {
    const a = active();
    const members = M.visibleMembers(a, viewer());
    return `${activityHeader()}<section class="panel members-page"><div class="panel-heading"><h3>每个人的出行偏好</h3><button class="button primary" data-action="requirements" ${terminal(a) || a.paused ? 'disabled' : ''}>编辑我的需求</button></div>
      <div class="member-table-wrap"><table><thead><tr><th>成员</th><th>出发地</th><th>交通方式</th><th>个人偏好</th><th>预算上限</th><th>状态</th></tr></thead><tbody>${members.map((m, i) => `<tr><td><div class="inline">${avatar(m, i, true)}<strong>${esc(m.name)}</strong>${m.id === a.hostId ? '<span class="host-tag">发起者</span>' : ''}</div></td><td>${m.origin ? esc(m.origin.name) : a.members[i].ready || a.members[i].origin ? '已隐藏' : '待填写'}</td><td>${esc(m.mode)}</td><td>${esc(m.preference)}</td><td>¥${m.budget}</td><td><span class="status">${a.members[i].ready || a.members[i].origin ? '需求已就绪' : '待完善'}</span></td></tr>`).join('')}</tbody></table></div>
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
    if (!visibleActivities().some(item => item.id === a.id) && !['calendar', 'overview', 'feedback'].includes(view)) view = 'overview';
    if (!a.members.some(m => m.id === viewer())) state.identities[a.id] = a.hostId;
    const restricted = !canAccess() && !['calendar', 'overview'].includes(view);
    if (view !== 'recommend' || poiContext !== currentPoiContext() || !mapPoints().some(p => p.id === selectedPoi) || restricted) selectedPoi = null;
    const oldPopup = $('#poi-popup');
    const popupScroll = oldPopup?.scrollTop || 0;
    const expanded = oldPopup?.querySelector('details')?.open;
    const hadPopupFocus = oldPopup?.contains(document.activeElement);
    const focusedAction = hadPopupFocus ? document.activeElement.dataset.action : null;
    const focusedSummary = hadPopupFocus && document.activeElement.matches('summary');
    $('#app').innerHTML = `<div class="app-shell">${header()}<main>${restricted ? expiredPage() : ({ calendar: journal.page, recommend: recommendations, overview, members: membersPage, feedback: feedbackPage }[view])()}<footer><span>MeetPoint <span class="footer-separator">/</span> 见面有期，回忆有迹</span><span>OUR LITTLE JOURNAL · VOL. 02 <button class="text-button" data-action="about">关于这本手账</button></span></footer></main></div>`;
    journal.hydrate();
    if ($('#poi-popup')) {
      $('#poi-popup details').open = !!expanded;
      positionPoiPopup(); $('#poi-popup').scrollTop = popupScroll;
      if (hadPopupFocus) {
        const target = focusedAction ? $('#poi-popup').querySelector(`[data-action="${focusedAction}"]`) : focusedSummary ? $('#poi-popup summary') : $('#poi-popup');
        target?.focus({ preventScroll: true });
      }
    }
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
  function identityOptions() { return `<p class="panel-tip">${isAccount() ? '本次以登录账号参与。活动昵称可单独修改；未完成活动可在最近一次有效操作后 7 天内恢复。' : '本次以游客身份参与，可在最近一次有效操作后 24 小时内从本浏览器恢复。'}</p>`; }
  const defaultNickname = () => {
    const profile = isAccount() ? null : currentProfile() || profiles.list.find(item => item.id === profiles.lastGuestId);
    return profile?.name === '游客' ? '' : profile?.name || '';
  };
  function create(date = M.dateKey()) {
    if (!M.validDate(date)) date = M.dateKey();
    openModal('在日历里，约一次见面', `<p class="modal-intro">先留一个日子，再一起决定在哪里相聚。</p><form id="create-form"><label>活动名称<input name="title" maxlength="40" required placeholder="例如：周五下班后的放松小聚"></label><div class="form-grid"><label>聚会日期<input name="date" type="date" value="${date}" required></label><label>见面时间<input name="time" type="time" value="18:30" required></label></div><label>你的昵称<input name="nickname" maxlength="16" required value="${esc(defaultNickname())}"></label><label>活动类型<select name="type">${Object.keys(M.OPTIONS).map(t => `<option>${t}</option>`).join('')}</select></label>${identityOptions()}<div class="subtle-box">创建后自动保留在当天日历。支持 2—10 人；每位伙伴可使用游客身份或账号参与。</div><button type="submit" class="button primary full">创建并邀请伙伴 ${icon('arrow')}</button></form>`);
  }
  function join(code = '') {
    openModal('加入一场相聚', `<p class="modal-intro">打开伙伴发来的邀请链接，或输入 6 位邀请码。投票期间暂不开放新成员加入。</p><form id="join-form"><label>邀请码<input name="code" required maxlength="6" value="${esc(code)}" placeholder="输入 6 位邀请码"></label><label>你的昵称<input name="nickname" maxlength="16" required value="${esc(defaultNickname())}" placeholder="让伙伴知道你是谁"></label>${identityOptions()}<button class="button primary full" type="submit">加入活动 ${icon('arrow')}</button></form>`);
  }
  function invite() {
    const a = active();
    openModal('好的相聚，从一句邀请开始', `<p class="modal-intro">活动：${esc(a.title)}</p><div class="invite-code"><small>活动邀请码</small><strong>${a.code}</strong><button class="button light" data-action="copy">${icon('link')} 复制邀请链接</button></div><div class="notice">${isShared(a) ? '把链接发给伙伴，对方可在自己的设备加入这场活动。' : '这是旧版本机示例；请新建活动来体验跨设备协作。'}</div>${a.status === 'voting' ? '<p class="panel-tip">本轮正在投票，成员名单已锁定。</p>' : ''}`);
  }
  function scoreDetails(p) {
    const a = active();
    return `<div class="detail-score"><span>演示参考分 · 非约定权重</span><strong>${p.score.toFixed(1)}<small> / 10</small></strong><p>各维度采用 0—10 分。三组分别按公平性、偏好匹配、交通便利性优先排序。</p></div>
      <div class="dimension-list">${[['fairness', '出行公平性', `最长与最短出行时间相差 ${p.gap} 分钟；演示公式：10 − 时间差 / 8`], ['time', '整体耗时', `全员平均 ${p.average} 分钟；演示公式：10 − 平均用时 / 12`], ['preference', '偏好匹配', '演示匹配模型：活动偏好 60%，示例预算适配 40%；并非甲方约定权重'], ['transit', '交通便利', '内置示例站点便利分，待真实地图数据替换']].map(([key, label, help]) => `<div class="dimension"><div><strong>${label}</strong><span>${p.dimensions[key].toFixed(1)}</span></div><div class="progress-track"><span style="width:${p.dimensions[key] * 10}%"></span></div><p>${help}</p></div>`).join('')}</div>
      <h3>本轮成员出行比较</h3><div class="member-table-wrap"><table><thead><tr><th>成员</th><th>预计用时</th><th>预计费用</th></tr></thead><tbody>${p.routes.map(r => `<tr><td>${esc(a.members.find(m => m.id === r.memberId)?.name || '已退出成员')}</td><td>${r.minutes} 分钟</td><td>未知</td></tr>`).join('')}</tbody></table></div>
      <div class="notice">甲方未约定评分权重。本 Demo 使用四维等权均值作为参考分及平票时的本轮综合排序依据，并非已确认的正式算法。路线为直线距离模拟；费用未知，不纳入评分。示例预算不代表真实报价。</div>`;
  }
  function details(id) {
    const p = active().candidates.find(p => p.id === id);
    if (p) openModal(`${esc(p.name)} · 为什么推荐这里`, scoreDetails(p), true);
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
  function localIdentityChoices() {
    const guests = profiles.list.filter(item => item.kind !== 'account');
    return `<details class="identity-choices"><summary>切换本机身份</summary><div><button class="button light" data-action="switch-profile" data-value="examples" ${profiles.activeId === 'examples' ? 'disabled aria-current="true"' : ''}>本机示例</button>${guests.map(item => `<button class="button light" data-action="switch-profile" data-value="${esc(item.id)}" ${profiles.activeId === item.id ? 'disabled aria-current="true"' : ''}>${esc(item.name)}${guests.filter(guest => guest.name === item.name).length > 1 ? ` · ${esc(item.id.slice(-4))}` : ''}</button>`).join('')}</div><p class="panel-tip">同名身份用末尾四位区分，切换不会合并活动。</p></details>`;
  }
  const actions = {
    view: value => { view = value; selectedPoi = null; menuOpen = false; render(); },
    create, invite, requirements, details, manage, navigate, join: () => join(),
    'join-current': () => join(active().code),
    'close-modal': closeModal,
    'select-poi': value => { if (!mapPoints().some(p => p.id === value)) return; poiTrigger = document.activeElement; selectedPoi = value; poiContext = currentPoiContext(); updatePoiPopup(true); },
    'close-poi': () => closePoi(),
    'toggle-menu': () => { menuOpen = !menuOpen; $('#primary-nav').classList.toggle('is-open', menuOpen); $('[data-action="toggle-menu"]').setAttribute('aria-expanded', String(menuOpen)); },
    vote: value => run('vote', { id: value }, '选票已保存，截止前仍可改票'),
    recommend: () => active().candidates.length ? confirmAction('重新生成推荐？', '将按最新需求生成候选，并开启新的 24 小时投票。当前轮次与旧选票将失效。', 'recommend-confirm', '确认重新推荐') : run('recommend', {}, '推荐已生成，24 小时投票已开启'),
    'recommend-confirm': async () => { if (await run('recommend', {}, '已开始新一轮投票，旧票已清空')) closeModal(); },
    request: () => openModal('申请重新推荐', '<form id="request-form"><label>告诉大家为什么想换一组地点<textarea name="reason" maxlength="300" required placeholder="例如：出发地变了，希望大家的路程更均衡。"></textarea></label><button type="submit" class="button primary">提交申请</button></form>'),
    'reject-request': id => openModal('拒绝申请并说明原因', `<form id="reject-form"><input type="hidden" name="id" value="${esc(id)}"><label>原因（所有成员可见）<textarea name="reason" maxlength="300" required></textarea></label><button type="submit" class="button primary">确认拒绝</button></form>`),
    'recommend-group': value => { group = value; selectedPoi = null; render(); document.getElementById(`tab-${value}`)?.focus({ preventScroll: true }); },
    'identity-info': () => {
      if (profiles.activeId === 'examples') {
        const a = active();
        openModal('身份与示例视角', `<p class="modal-intro">小林等成员和历史活动是功能引导数据，不代表真实登录。</p>${localIdentityChoices()}<label>示例成员视角<select id="identity" aria-label="切换示例成员视角">${a.members.map(m => `<option value="${m.id}" ${m.id === viewer() ? 'selected' : ''}>${esc(m.name)}${m.id === a.hostId ? ' · 发起者' : ' · 成员'}</option>`).join('')}</select></label><p class="panel-tip">此处仅改变示例活动的演示视角。</p><button class="button light" data-action="new-profile">使用另一游客身份</button><button class="text-button" data-action="account-login">注册／登录</button>`);
        return;
      }
      const a = active(), belongs = visibleActivities().some(item => item.id === a.id);
      const renameActivity = belongs && isShared(a) ? `<details class="identity-activity"><summary>修改本活动昵称</summary><form id="rename-form" class="identity-form"><label>本活动昵称<input name="name" maxlength="16" required value="${esc(self().name)}"></label><button type="submit" class="button light">保存活动昵称</button></form></details>` : '';
      const accountSettings = `<p class="identity-current">账号 <strong>${esc(currentProfile().name)}</strong>${belongs ? `<span>本活动昵称：${esc(self().name)}</span>` : ''}</p>${renameActivity}<div class="identity-actions"><button class="button light" data-action="edit-avatar">修改头像</button><button class="button light" data-action="sample-journal">查看示例手账</button>${accountAuth?.previousProfileId && Object.values(sharedSessions).some(s => s.profileId === accountAuth.previousProfileId) ? '<button class="button light" data-action="claim-guest">归入游客活动</button>' : ''}<button class="text-button" data-action="account-logout">退出登录</button></div>`;
      const guestSettings = `<p class="identity-current">当前游客 <strong>${esc(currentProfile().name)}</strong>${belongs ? `<span>本活动昵称：${esc(self().name)}</span>` : ''}</p><form id="profile-name-form" class="identity-form"><label>默认昵称<input name="name" maxlength="16" required value="${currentProfile().name === '游客' ? '' : esc(currentProfile().name)}"></label><button class="button light" type="submit">保存默认昵称</button></form><p class="identity-help">新活动会预填默认昵称，已有活动昵称不变。</p>${renameActivity}${localIdentityChoices()}<div class="identity-actions"><button class="button light" data-action="edit-avatar">修改头像</button><button class="button light" data-action="new-profile">新建游客身份</button><button class="text-button" data-action="merge-profile">合并旧身份</button><button class="text-button" data-action="account-login">注册／登录</button></div>`;
      openModal(isAccount() ? '我的账号' : '游客身份与设置', `<div class="identity-settings">${isAccount() ? accountSettings : guestSettings}</div>`);
    },
    'switch-profile': async value => { closeModal(); await selectProfile(value); },
    'edit-avatar': () => {
      const profile = currentProfile();
      if (!profile) return toast('请先选择游客或登录账号');
      openModal('修改头像', `<div class="avatar-editor"><div class="avatar-preview">${identityAvatar(profile.name, profile.id, false)}</div><form id="avatar-form"><label>选择头像图片<input name="avatar" type="file" accept="image/jpeg,image/png,image/webp" required></label><p class="identity-help">支持 JPG、PNG、WebP，不超过 2 MB。头像仅保存在此浏览器。</p><button class="button primary" type="submit">保存头像</button></form>${localAvatars[profile.id] ? '<button class="text-button" data-action="reset-avatar">恢复默认头像</button>' : ''}</div>`);
    },
    'reset-avatar': () => {
      const profile = currentProfile();
      if (!profile) return;
      delete localAvatars[profile.id];
      localStorage.setItem(AVATAR_KEY, JSON.stringify(localAvatars));
      actions['edit-avatar'](); render(); toast('已恢复默认头像');
    },
    'account-login': () => openModal('登录账号', '<form id="account-login-form"><label>账号名称<input name="username" minlength="3" maxlength="30" required autocomplete="username"></label><label>密码<input name="password" type="password" minlength="8" required autocomplete="current-password"></label><button class="button primary full" type="submit">登录</button></form><button class="text-button" data-action="account-register">还没有账号？注册</button>'),
    'account-register': () => openModal('注册账号', '<form id="account-register-form"><label>账号名称<input name="username" minlength="3" maxlength="30" required autocomplete="username"></label><label>密码（至少 8 位）<input name="password" type="password" minlength="8" required autocomplete="new-password"></label><button class="button primary full" type="submit">注册并登录</button></form><button class="text-button" data-action="account-login">已有账号？登录</button>'),
    'account-logout': async () => {
      const previous = accountAuth?.previousProfileId;
      try { await api('/api/account/logout', 'POST', {}, accountAuth.token); } catch { /* Local logout still clears this browser. */ }
      for (const key of Object.keys(sharedSessions)) if (key.startsWith(`${profiles.activeId}|`)) delete sharedSessions[key];
      profiles.list = profiles.list.filter(item => item.kind !== 'account');
      accountAuth = null;
      closeModal(); await selectProfile(profiles.list.some(item => item.id === previous) ? previous : 'examples');
    },
    'sample-journal': () => {
      const memories = M.seedMemories();
      openModal('示例手账 · 只读', `<p class="modal-intro">以下内容用于展示手账效果，不属于你的活动，也不会计入个人统计。</p>${memories.map(a => `<article class="panel"><img src="./assets/${['autumn', 'cafe', 'lake'].includes(a.journal.cover) ? a.journal.cover : 'autumn'}.svg" alt="${esc(a.title)}的示例封面" width="160"><h3>${esc(a.title)}</h3><p>${esc(a.date)}</p>${a.journal.feelings.map(f => `<blockquote>${esc(f.text)}</blockquote>`).join('')}${a.journal.comments.map(c => `<p>${esc(c.text)}</p>`).join('')}</article>`).join('')}`);
    },
    'claim-guest': async () => {
      const guestId = accountAuth.previousProfileId;
      let count = 0;
      for (const [key, session] of Object.entries(sharedSessions).filter(([, s]) => s.profileId === guestId)) {
        try { await api(`/api/activities/${sessionActivityId(key)}/claim`, 'POST', { guestToken: session.token }, accountAuth.token); delete sharedSessions[key]; count++; }
        catch (error) { toast(error.message); }
      }
      closeModal(); await selectProfile(profiles.activeId); toast(`已将 ${count} 场游客活动归入账号`);
    },
    'new-profile': () => openModal('新游客身份', '<p class="modal-intro">新身份的活动与当前身份分开。创建或加入第一场活动时输入的昵称，会成为新身份的默认昵称。</p><button class="button primary full" data-action="create-guest-profile">创建新游客身份</button>'),
    'create-guest-profile': async () => {
      const profile = { id: M.uid(), name: '游客', lastActivityId: null };
      profiles.list.push(profile);
      closeModal(); await selectProfile(profile.id);
    },
    'merge-profile': () => {
      if (isAccount() || !currentProfile()) return;
      const others = profiles.list.filter(item => item.kind !== 'account' && item.id !== profiles.activeId);
      if (!others.length) return toast('当前没有其他游客身份可合并');
      openModal('合并本机游客身份', `<p class="modal-intro">把 ${esc(currentProfile().name)} 参与的活动转到另一游客身份下。仅合并本浏览器保存的活动凭证；同名也不会自动合并。</p><form id="merge-profile-form"><label>合并到<select name="target" required><option value="">选择目标游客身份</option>${others.map(item => `<option value="${esc(item.id)}">${esc(item.name)} · ${esc(item.id.slice(-4))}</option>`).join('')}</select></label><button class="button primary full" type="submit">确认合并</button></form>`);
    },
    finish: () => confirmAction('确认这次相聚的地点？', '将按有效票数确定集合点；平票按本轮综合排名决定。确认后结果不可修改。', 'finish-confirm', '确定集合点'),
    'finish-confirm': async () => { if (await run('finish', {}, '集合地点已确定，准备出发吧！')) closeModal(); },
    pause: () => run('pause', {}, '活动已暂停，剩余投票时间已保留'),
    resume: () => run('resume', {}, '活动已恢复，继续原有投票时间'),
    revote: () => run('revote', {}, '已沿用候选开启新的 24 小时投票'),
    'cancel-confirm': () => confirmAction('确定取消活动？', '取消后无法恢复本次活动，但会保留活动记录。', 'cancel', '确认取消'),
    cancel: async () => { if (await run('cancel', {}, '活动已取消')) closeModal(); },
    remove: async value => { if (await run('remove', { id: value }, '成员已移除')) manage(); },
    leave: () => confirmAction('退出这场活动？', isShared(active()) ? '退出后将失去这场共享活动的成员访问权限。' : '退出后，演示界面将切换为发起者视角。', 'leave-confirm', '确认退出'),
    'leave-confirm': async () => { if (await run('leave', {}, '已退出活动')) closeModal(); },
    'open-activity': async value => { if (!visibleActivities().some(a => a.id === value)) return; state.activeId = value; if (isShared(active())) await refreshShared(value, false); else state.identities[value] ||= active().hostId; if (currentProfile()) currentProfile().lastActivityId = value; selectedPoi = null; view = 'recommend'; saveProfiles(); save(); render(); },
    sample: () => { const a = M.seed(); state.activities.unshift(a); state.activeId = a.id; state.identities[a.id] = a.hostId; selectedPoi = null; view = 'recommend'; save(); render(); toast('已创建新的示例活动'); },
    copy: async () => {
      const url = new URL(location.href); url.hash = ''; url.search = ''; url.searchParams.set('invite', active().code);
      try { await navigator.clipboard.writeText(url.href); toast(isShared(active()) ? '邀请链接已复制，可发送给其他设备' : '本机示例链接已复制，仅当前浏览器可用'); }
      catch { openModal('复制邀请链接', `<p class="modal-intro">请手动复制下方链接。${isShared(active()) ? '其他设备可通过链接加入。' : '本机示例仅当前浏览器可用。'}</p><label>邀请链接<input readonly value="${esc(url.href)}" onclick="this.select()"></label>`); }
    },
    about: () => openModal('关于这本相聚手账', '<p class="modal-intro">根据 neXus 团队 MeetPoint SRS V1.1 实现的演示。</p><ul class="about-list"><li>新建活动可跨设备完成邀请、需求、三组 Top3 推荐、申请审批、多轮投票与手账记录。</li><li>共享活动由服务器和 SQLite 保存；游客可在 24 小时内恢复未完成活动，登录账号可在 7 天内恢复。</li><li>旧示例活动只保存在当前浏览器。登录后的示例手账为独立只读内容，不计入个人活动。</li><li>反馈表单仍为本机演示数据；管理员流程尚未接入共享服务。</li><li>地图、路线和出行时间为模拟数据，尚未接入真实地图接口。</li><li>演示环境将登录令牌保存在本浏览器；正式部署还需要 HTTPS、访问频率限制和数据库备份。</li></ul>')
  };
  function activate(id, nextView = 'calendar') {
    state.activeId = id; state.identities[id] ||= active().hostId; selectedPoi = null; view = nextView; save();
  }
  const journal = window.createMeetPointJournal({ M, esc, icon, avatar, getState: () => state, visibleActivities, active, viewer, activate, replace, perform, isShared, uploadSharedPhoto, sharedPhotoUrl, forgetSharedPhoto, save, render, openModal, toast, create, statusText });
  Object.assign(actions, journal.actions);
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-action]');
    if (!button && event.target.closest('.map-canvas')) closePoi();
    if (menuOpen && !event.target.closest('.site-header')) { menuOpen = false; $('#primary-nav')?.classList.remove('is-open'); $('[data-action="toggle-menu"]')?.setAttribute('aria-expanded', 'false'); }
    if (!button || button.disabled) return;
    event.preventDefault();
    try { await actions[button.dataset.action]?.(button.dataset.value); } catch (error) { toast(error.message); }
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && !$('#modal').open) {
      if (selectedPoi) { event.preventDefault(); closePoi(); }
      else if (menuOpen) { actions['toggle-menu'](); $('[data-action="toggle-menu"]').focus(); }
    }
    if (!event.ctrlKey && !event.metaKey && !event.altKey && event.target.matches('[role="tab"]') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const i = M.GROUPS.findIndex(g => g.id === group);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? M.GROUPS.length - 1 : (i + (event.key === 'ArrowRight' ? 1 : -1) + M.GROUPS.length) % M.GROUPS.length;
      actions['recommend-group'](M.GROUPS[next].id);
    }
  });
  window.addEventListener('resize', positionPoiPopup);
  window.addEventListener('scroll', positionPoiPopup, { passive: true });
  document.addEventListener('change', async event => {
    try {
      await journal.change(event.target);
      if (event.target.id === 'identity' && profiles.activeId === 'examples') { state.identities[active().id] = event.target.value; selectedPoi = null; save(); render(); $('#identity')?.focus({ preventScroll: true }); toast(`已切换到 ${self().name} 的演示视角`); }
    } catch (error) { toast(error.message); }
  });
  document.addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.target;
    if (await journal.submit(form)) return;
    const data = new FormData(form);
    try {
      if (form.getAttribute('id') === 'request-form') {
        if (await run('request', { reason: data.get('reason') }, '申请已提交，处理状态对所有成员可见')) closeModal();
      } else if (form.getAttribute('id') === 'reject-form') {
        if (await run('reject-request', { id: data.get('id'), reason: data.get('reason') }, '已拒绝申请并公开原因')) closeModal();
      } else if (form.getAttribute('id') === 'schedule-form') {
        if (await run('schedule', { date: data.get('date'), time: data.get('time') }, '日历安排已更新')) closeModal();
      } else if (form.getAttribute('id') === 'create-form') {
        const result = await api('/api/activities', 'POST', { title: data.get('title'), nickname: data.get('nickname'), type: data.get('type'), date: data.get('date'), time: data.get('time') }, isAccount() ? accountAuth.token : null);
        attachToProfile(result.activity, result.token);
        const a = acceptShared(result);
        journal.setDate(a.date);
        state.activeId = a.id;
        selectedPoi = null; view = 'recommend'; save(); closeModal(); render(); invite();
      } else if (form.getAttribute('id') === 'join-form') {
        const result = await api('/api/activities/join', 'POST', { code: data.get('code'), nickname: data.get('nickname') }, isAccount() ? accountAuth.token : null);
        attachToProfile(result.activity, result.token);
        const a = acceptShared(result);
        state.activeId = a.id;
        selectedPoi = null; view = 'recommend'; save();
        const url = new URL(location.href);
        url.searchParams.delete('invite');
        history.replaceState(null, '', url);
        closeModal(); render(); requirements();
      } else if (form.getAttribute('id') === 'requirements-form') {
        if (await run('requirements', { originIndex: Number(data.get('originIndex')), mode: data.get('mode'), preference: data.get('preference'), budget: Number(data.get('budget')), shared: data.has('shared') }, '出行需求已保存')) closeModal();
      } else if (form.getAttribute('id') === 'rename-form') {
        if (await run('rename', { name: data.get('name') }, '昵称已更新')) {
          sessionFor(active().id).name = self().name;
          saveProfiles(); closeModal(); render();
        }
      } else if (form.getAttribute('id') === 'profile-name-form') {
        if (isAccount() || !currentProfile()) throw new Error('请先切换到游客身份');
        const name = String(data.get('name') || '').trim();
        if (!name || name.length > 16) throw new Error('默认昵称应为 1—16 个字');
        currentProfile().name = name;
        saveProfiles(); closeModal(); render(); toast('默认昵称已更新');
      } else if (form.getAttribute('id') === 'avatar-form') {
        const profile = currentProfile(), file = data.get('avatar');
        if (!profile || !(file instanceof File) || !file.size) throw new Error('请选择头像图片');
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) throw new Error('请选择不超过 2 MB 的 JPG、PNG 或 WebP 图片');
        const source = URL.createObjectURL(file);
        let image;
        try {
          image = new Image(); image.src = source;
          await image.decode();
          if (!image.naturalWidth || image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('图片尺寸过大，请先缩小');
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 160;
          const side = Math.min(image.naturalWidth, image.naturalHeight);
          canvas.getContext('2d').drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, 160, 160);
          localAvatars[profile.id] = canvas.toDataURL('image/jpeg', .82);
          localStorage.setItem(AVATAR_KEY, JSON.stringify(localAvatars));
        } finally { URL.revokeObjectURL(source); }
        closeModal(); render(); toast('头像已保存到本浏览器');
      } else if (form.getAttribute('id') === 'merge-profile-form') {
        const source = currentProfile();
        const target = profiles.list.find(item => item.id === data.get('target') && item.kind !== 'account');
        if (!source || source.kind === 'account' || !target || source.id === target.id) throw new Error('请选择另一个游客身份');
        const sessions = Object.entries(sharedSessions).filter(([, session]) => session.profileId === source.id);
        if (sessions.some(([key]) => sharedSessions[sessionKey(target.id, sessionActivityId(key))]))
          throw new Error('两个游客身份参与了同一活动，不能自动合并');
        for (const [key, session] of sessions) {
          sharedSessions[sessionKey(target.id, sessionActivityId(key))] = { ...session, profileId: target.id };
          delete sharedSessions[key];
        }
        target.lastActivityId = source.lastActivityId || target.lastActivityId;
        profiles.list = profiles.list.filter(item => item.id !== source.id);
        if (accountAuth?.previousProfileId === source.id) accountAuth.previousProfileId = target.id;
        closeModal(); await selectProfile(target.id); toast(`活动已归入 ${target.name}`);
      } else if (['account-login-form', 'account-register-form'].includes(form.getAttribute('id'))) {
        const route = form.getAttribute('id') === 'account-register-form' ? 'register' : 'login';
        const result = await api(`/api/account/${route}`, 'POST', { username: data.get('username'), password: data.get('password') });
        const previousProfileId = isAccount() ? accountAuth.previousProfileId : profiles.activeId;
        accountAuth = { ...result.account, token: result.token, previousProfileId };
        const id = `account:${result.account.id}`;
        if (!profiles.list.some(item => item.id === id)) profiles.list.push({ id, name: result.account.username, kind: 'account', lastActivityId: null });
        closeModal(); await selectProfile(id); toast('账号已登录');
      } else if (form.getAttribute('id') === 'transfer-form') {
        if (await run('transfer', { id: data.get('id') }, '权限已移交，你现在是普通成员')) closeModal();
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
    state.activities = state.activities.map(a => { if (isShared(a)) return a; const next = M.tick(a); if (next.status !== a.status) changed = true; return next; });
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
  setInterval(() => { if (!document.hidden && !$('#modal').open && isShared(active())) refreshShared().catch(error => toast(error.message)); }, 5000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { synchronizeTime(); if (isShared(active())) refreshShared().catch(error => toast(error.message)); } });
  const invitation = new URL(location.href).searchParams.get('invite')?.trim().slice(0, 6).toUpperCase();
  if (storageWarning) toast(storageWarning);
  restoreProfile().then(results => {
    const invited = invitation && state.activities.find(a => isShared(a) && a.code === invitation);
    const mine = visibleActivities();
    const previous = mine.find(a => a.id === state.activeId);
    const preferred = mine.find(a => a.id === currentProfile()?.lastActivityId);
    const target = invited || (!invitation && profiles.activeId !== 'examples' && (previous || preferred || mine[0]));
    if (target) {
      state.activeId = target.id;
      selectedPoi = null;
      view = 'recommend';
      save();
      saveProfiles();
    } else if (profiles.activeId !== 'examples') {
      view = 'overview';
    }
    if (results.some(result => result.status === 'rejected')) toast('部分共享活动暂时无法恢复，请检查服务或身份期限');
    render();
    if (invitation && !invited) join(invitation);
    if (invited) {
      const url = new URL(location.href);
      url.searchParams.delete('invite');
      history.replaceState(null, '', url);
    }
  }).catch(async error => {
    if (isAccount() && error.status === 401) {
      for (const key of Object.keys(sharedSessions)) if (key.startsWith(`${profiles.activeId}|`)) delete sharedSessions[key];
      profiles.list = profiles.list.filter(item => item.kind !== 'account');
      accountAuth = null;
      await selectProfile('examples');
      toast('账号登录已过期，请重新登录');
    } else toast(error.message);
  });
})();
