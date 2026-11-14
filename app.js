/* Unified demo: new activities use the shared API; older seeded examples stay browser-local. */
(() => {
  'use strict';
  const M = window.MeetPoint;
  const STORAGE_KEY = 'meetpoint-demo-v1';
  const SHARED_KEY = 'meetpoint-shared-sessions-v1';
  const PROFILE_KEY = 'meetpoint-guest-profiles-v1';
  const ACCOUNT_KEY = 'meetpoint-account-session-v1';
  const AVATAR_KEY = 'meetpoint-local-avatars-v1';
  const FULL_DEMO_USERNAME = 'meetpoint_demo';
  const FULL_DEMO_MARKER = 'meetpoint-full-demo-v1';
  const invitation = new URL(location.href).searchParams.get('invite')?.trim().slice(0, 6).toUpperCase();
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
    navigation: '<path d="m20 4-7.2 16-2.1-6.7L4 11.2 20 4Z"/><path d="m10.7 13.3 3.1-3.1"/>',
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
  let appSurface = accountAuth || invitation ? 'workspace' : 'landing';
  let group = 'fairness';
  let selectedPoi = null;
  let poiContext = null;
  let poiTrigger = null;
  let staticMapState = { key: null, url: null, error: null, loading: false, controller: null };
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
      const result = action === 'requirements'
        ? await api(`/api/activities/${id}/requirements`, 'PUT', data, sessionFor(id).token)
        : await api(`/api/activities/${id}/actions`, 'POST', { action, data }, sessionFor(id).token);
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
    const navs = [['overview', '我的活动', 'grid'], ['recommend', '集合点推荐', 'compass'], ['members', '成员与需求', 'people'], ['feedback', '意见反馈', 'chat']];
    return `<header class="site-header">
      <a class="site-brand" href="#" data-action="landing-home" aria-label="返回 MeetPoint 首页"><span class="workspace-brand-word"><b>Meet</b><i></i><b>Point</b></span><small>一起选个方便见面的地方</small></a>
      <div class="workspace-nav-cluster"><button class="workspace-calendar-shortcut ${view === 'calendar' ? 'active' : ''}" data-action="view" data-value="calendar" aria-label="相聚日历" title="相聚日历">${icon('clock')}</button><nav id="primary-nav" class="primary-nav ${menuOpen ? 'is-open' : ''}" aria-label="主导航">${navs.map(([id, label, iconName]) => `<button class="top-nav-item ${view === id ? 'active' : ''}" ${view === id ? 'aria-current="page"' : ''} data-action="view" data-value="${id}">${icon(iconName)}<span>${label}</span></button>`).join('')}</nav></div>
      <div class="header-account"><button class="text-button identity-kind" data-action="identity-info" aria-label="身份与设置：${esc(identityName)}">${identityAvatar(identityName, profiles.activeId)}<span>${esc(identityName)}</span></button></div>
      <button class="menu-toggle button light" data-action="toggle-menu" aria-expanded="${menuOpen}" aria-controls="primary-nav">菜单</button>
    </header>`;
  }
  function activityHeader() {
    const a = active();
    const stages = ['邀请伙伴', '填写需求', '推荐与投票', '出发相聚'];
    const stage = a.status === 'collecting' ? 1 : a.status === 'completed' ? 3 : 2;
    const heading = view === 'members'
      ? { title: '听听Ta的想法', description: '把各自的起点与偏好放在一起，才能找到更公平的答案。' }
      : { title: '找到刚刚好的集合点', description: '照顾每个人的出发地，让下一次见面少一点纠结。' };
    const headingArt = view === 'members'
      ? '<figure class="activity-heading-art members-heading-art"><img src="./assets/members-meeting.png" alt="伙伴围坐讨论出行需求的手绘插图"></figure>'
      : view === 'recommend'
        ? '<figure class="activity-heading-art recommend-heading-art"><img src="./assets/recommend-companion.png" alt="伙伴一起寻找集合点的手绘插图"></figure>'
        : '';
    return `<div class="page-heading activity-page-heading"><div><h1>${heading.title}<span class="heading-dot">.</span></h1><p>${heading.description}</p></div>${headingArt}<button class="button primary" data-action="create">${icon('plus')} 创建活动</button></div>
      <section class="activity-banner"><div class="activity-info"><span class="activity-symbol">${icon('people')}</span><div><div class="inline"><h2>${esc(a.title)}</h2><span class="status ${terminal(a) ? 'neutral' : ''}"><i></i>${statusText(a)}</span></div><p>${esc(a.date)} ${esc(a.time)}<span>·</span>${esc(a.type)}<span>·</span>${a.members.length} 位伙伴<span>·</span>邀请码 <strong>${a.code}</strong></p></div></div><div class="inline"><button class="text-button" data-action="open-journal" data-value="${a.id}">翻开手账</button><button class="button light" data-action="invite">${icon('link')} 邀请伙伴</button></div></section>
      <div class="steps" aria-label="活动进度">${stages.map((s, i) => `<div class="step ${i < stage ? 'done' : ''} ${i === stage ? 'current' : ''}"><span>${i < stage ? icon('check') : `0${i + 1}`}</span><strong>${s}</strong>${i === stage ? '<small>当前步骤</small>' : ''}</div>`).join('')}</div>
      ${a.paused ? '<div class="notice">活动已暂停。选票与候选已保留，倒计时将在恢复后继续。</div>' : ''}
      ${a.status === 'cancelled' ? '<div class="notice">这场活动已取消。你仍可查看记录，或创建一场新的相聚。</div>' : ''}`;
  }
  function mapPoints() {
    const a = active();
    const ids = [...(a.groups[group] || [])];
    if (a.winningCandidateId && !ids.includes(a.winningCandidateId)) ids.push(a.winningCandidateId);
    return ids.map(id => a.candidates.find(p => p.id === id)).filter(Boolean);
  }
  function staticMapKey() {
    const a = active();
    return [a.id, a.round, group, a.winningCandidateId || '', ...mapPoints().map(point => `${point.id}:${point.lng}:${point.lat}`)].join('|');
  }
  function resetStaticMap() {
    staticMapState.controller?.abort();
    if (staticMapState.url) URL.revokeObjectURL(staticMapState.url);
    staticMapState = { key: null, url: null, error: null, loading: false, controller: null };
  }
  async function loadStaticMap(force = false) {
    const a = active(), key = staticMapKey();
    if (view !== 'recommend' || !isShared(a) || !mapPoints().length) return;
    if (!force && staticMapState.key === key && (staticMapState.loading || staticMapState.url || staticMapState.error)) return;
    staticMapState.controller?.abort();
    if (staticMapState.url) URL.revokeObjectURL(staticMapState.url);
    const controller = new AbortController();
    staticMapState = { key, url: null, error: null, loading: true, controller };
    try {
      const response = await fetch(`/api/activities/${encodeURIComponent(a.id)}/static-map?group=${encodeURIComponent(group)}`, {
        headers: { Authorization: `Bearer ${sessionFor(a.id).token}` }, signal: controller.signal
      });
      if (!response.ok) {
        let message = '地图暂时无法加载';
        try { message = (await response.json()).error || message; } catch {}
        throw new Error(message);
      }
      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) throw new Error('地图服务返回了无效图片');
      const url = URL.createObjectURL(blob);
      if (staticMapKey() !== key || view !== 'recommend') { URL.revokeObjectURL(url); return; }
      staticMapState = { key, url, error: null, loading: false, controller: null };
    } catch (error) {
      if (error.name === 'AbortError') return;
      if (staticMapKey() !== key) return;
      staticMapState = { key, url: null, error: error.message || '地图暂时无法加载', loading: false, controller: null };
    }
    if (view === 'recommend' && staticMapKey() === key) render();
  }
  function mapPanel() {
    const a = active();
    const points = mapPoints();
    const key = staticMapKey(), current = staticMapState.key === key;
    let visual;
    if (!points.length) {
      const empty = recommendationEmptyState();
      visual = `<div class="static-map-state"><span class="static-map-state-icon">${icon('pin')}</span><h4>${empty.title}</h4><p>${empty.body}</p><strong class="static-map-progress">${empty.progress}</strong>${empty.action}</div>`;
    }
    else if (!isShared(a)) visual = `<div class="static-map-state"><span class="static-map-state-icon">${icon('pin')}</span><h4>本机示例不调用真实地图</h4><p>新建或加入共享活动后，将使用高德展示真实 Top3。</p></div>`;
    else if (current && staticMapState.url) visual = `<img class="static-map-image" src="${esc(staticMapState.url)}" alt="${esc(`高德地图，标注${points.map((point, index) => `候选 ${index + 1} ${point.name}`).join('、')}`)}" draggable="false">`;
    else if (current && staticMapState.error) visual = `<div class="static-map-state static-map-error" role="alert"><span class="static-map-state-icon">${icon('refresh')}</span><h4>地图暂时没有加载出来</h4><p>${esc(staticMapState.error)}</p><button class="button light" data-action="retry-static-map">重新加载地图</button></div>`;
    else visual = `<div class="static-map-loading" role="status" aria-live="polite"><span></span><p>正在整理候选地点分布…</p></div>`;
    return `<section class="panel map-panel"><div class="panel-heading"><h3>${icon('pin')} 候选地点分布</h3><span class="tiny-label">${isShared(a) ? '高德静态地图 · TOP 3' : '本机示例'}</span></div>
      <div class="map-stage"><div class="map-canvas static-map-canvas">${visual}${points.length ? `<div class="map-candidate-key" aria-label="地图标记说明">${points.map((point, index) => `<button data-action="select-poi" data-value="${point.id}" aria-pressed="${selectedPoi === point.id}"><span>${index + 1}</span>${esc(point.name)}</button>`).join('')}</div>` : ''}</div><div id="poi-popup-host">${renderPoiPopup()}</div></div>
      <div class="map-footer">${icon('lock')} 地图只标记候选地点，不展示成员出发地。<span>地图与路线信息由高德提供</span></div></section>`;
  }
  function recommendationEmptyState() {
    const a = active(), progress = M.recommendationProgress(a);
    const mineReady = !!(self()?.ready || self()?.origin);
    if (progress.stage === 'members') return {
      title: '还不能生成集合点地图',
      body: '至少需要 2 位成员加入，并且每个人都完成出发地与出行需求。条件满足后，由发起者生成推荐，即可查看三组候选地点的真实地图。',
      progress: `当前 ${progress.total}/2 位成员加入 · ${progress.readyCount}/${progress.total} 位成员已填写需求`,
      action: isHost() ? '<button class="button light" data-action="invite">邀请伙伴</button>' : ''
    };
    if (progress.stage === 'requirements') return {
      title: '等待所有成员完成出行需求',
      body: '推荐会同时比较每位成员的真实路线。所有人填写完成后，发起者即可生成地图。',
      progress: `当前 ${progress.total} 位成员 · ${progress.readyCount}/${progress.total} 位已填写需求`,
      action: mineReady ? '<span class="static-map-wait">我的需求已完成，等待其他伙伴</span>' : '<button class="button light" data-action="requirements">填写我的需求</button>'
    };
    return {
      title: '可以生成候选地图了',
      body: '成员和需求已经准备就绪。生成后将显示最公平、最合心意和最方便三组候选地点。',
      progress: `当前 ${progress.total} 位成员 · ${progress.readyCount}/${progress.total} 位已填写需求`,
      action: isHost() ? '<button class="button light" data-action="recommend">生成三组推荐</button>' : '<span class="static-map-wait">等待发起者生成推荐</span>'
    };
  }
  function candidateCard(p, i) {
    const a = active();
    const vote = a.votes[viewer()];
    const count = M.tally(a)[p.id];
    const mine = p.routes.find(r => r.memberId === viewer());
    const winner = a.winningCandidateId === p.id;
    return `<article id="candidate-${p.id}" class="candidate ${selectedPoi === p.id ? 'focused' : ''} ${vote === p.id ? 'voted' : ''}">
      <div class="poi-card-top"><span class="poi-rank">${i >= 0 ? `${M.GROUPS.find(g => g.id === group).name} · 第 ${i + 1} 名` : '已确认的最终集合点'}</span><button class="icon-button" data-action="close-poi" aria-label="关闭地点详情">${icon('close')}</button></div>
      <div class="candidate-body"><div class="candidate-title"><h3 id="poi-title">${esc(p.name)}</h3><div class="score">${p.score.toFixed(1)}<small>/ 10</small></div></div><p class="address">${icon('pin')}${esc(p.area)}</p><p class="poi-description">${esc(p.subtitle)}</p>
        <div class="metrics"><div><small>我的预计用时</small><strong>${mine?.minutes ?? '—'}<span> 分钟</span></strong></div><div><small>全员平均用时</small><strong>${p.average}<span> 分钟</span></strong></div></div>
        <p class="group-reason">${group === 'fairness' ? `最长与最短出行相差 ${p.gap} 分钟` : group === 'preference' ? `偏好匹配 ${formatScore(p.dimensions.preference)} / 10 分` : `便利度 ${formatScore(p.dimensions.convenience)} / 10 · 平均 ${p.average} 分钟`}</p><div class="transit-tag">${icon('train')}${esc(p.line)}</div>
        <details class="poi-details"><summary>评分依据与成员路线比较</summary>${scoreDetails(p)}</details>
        <div class="vote-row"><span><strong>${count}</strong> 票支持</span><button class="button ${vote === p.id || winner ? 'primary' : 'vote-button'}" data-action="vote" data-value="${p.id}" ${a.status !== 'voting' || a.paused || !canAccess() || a.deadline <= Date.now() ? 'disabled' : ''}>${vote === p.id || winner ? icon('check') : ''}${winner ? '最终集合点' : vote === p.id ? '我已投票' : vote ? '改投这里' : '投票给这里'}</button></div>
        <p class="poi-vote-status">${a.paused ? '活动已暂停，暂不可投票或改票' : a.status === 'voting' ? a.deadline <= Date.now() ? '本轮投票已截止，正在更新结果' : vote === p.id ? '这是你当前的选择，截止前可以改票' : '三组推荐共用每人一票，截止前可以改票' : statusText(a)} · 预计费用：未知</p>
        <button class="button light full candidate-navigation" data-action="navigate">${icon('navigation')} ${winner ? '在高德地图中打开路线' : '在高德地图查看此地点'}</button>
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
    if (!popup || !canvas) return;
    if (window.matchMedia('(max-width: 700px)').matches) {
      popup.style.removeProperty('left'); popup.style.removeProperty('top'); popup.style.removeProperty('max-height');
      return;
    }
    const r = canvas.getBoundingClientRect(), m = marker?.getBoundingClientRect();
    const width = popup.offsetWidth, gap = 14, margin = 12;
    const headerBottom = $('.site-header').getBoundingClientRect().bottom;
    const top = Math.max(margin, headerBottom + margin - r.top);
    const bottom = Math.min(r.height - margin, window.innerHeight - margin - r.top);
    popup.style.maxHeight = `${Math.max(100, bottom - top)}px`;
    if (!m) {
      popup.style.left = `${margin}px`;
      popup.style.top = `${top}px`;
      return;
    }
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
      <div class="member-list">${members.map((m, i) => `<div class="member-row">${avatar(m, i)}<div class="member-copy"><strong>${esc(m.name)} ${m.id === viewer() ? '<small>我</small>' : ''}${m.id === a.hostId ? '<span class="host-tag">发起者</span>' : ''}</strong><p>${m.origin ? esc(m.origin.name) : a.members[i].ready || a.members[i].origin ? `${icon('lock')} 出发地已隐藏` : '待填写出行需求'}</p><span class="member-check ${a.votes[m.id] ? 'is-voted' : ''}" title="${a.votes[m.id] ? '已投票' : a.members[i].ready || a.members[i].origin ? '已填写需求' : '待填写'}">${a.votes[m.id] ? `${icon('check')} 已投票` : a.members[i].ready || a.members[i].origin ? '需求已就绪' : '等待填写'}</span></div></div>`).join('')}</div>
      <button class="button full light" data-action="requirements" ${terminal(a) || a.paused ? 'disabled' : ''}>${icon('settings')} 编辑我的出行需求</button>
      <p class="panel-tip">${isShared(a) ? '每位成员在自己的浏览器填写和投票。' : '通过右上角身份切换，可演示每位成员的填写与投票。'}</p></section>`;
  }
  function timerLabel(a) {
    if (a.status !== 'voting') return '—';
    const ms = a.paused ? a.remainingMs : Math.max(0, a.deadline - Date.now());
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
    const p = a.candidates.find(p => p.id === a.winningCandidateId);
    return `<section class="result-banner"><span class="result-icon">${icon('check')}</span><div><small>下一站，见面。</small><h2>就在「${esc(p.name)}」相聚吧</h2><p>结果已确认 · 预计出行费用未知，请以地图实时信息为准</p></div><button class="button primary" data-action="navigate">${icon('navigation')} 在高德地图中打开路线</button></section>`;
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
      ${(a.warnings || []).map(w => `<p class="notice">${esc(w)}</p>`).join('')}<div class="recommend-intro"><img src="./assets/workspace-idea.png" alt="" aria-hidden="true"><p class="group-description">${selectedGroup.description} 点击地点标记查看详情并投票。</p></div>
      <div id="recommend-map" role="tabpanel" aria-labelledby="tab-${group}">
      <div class="recommend-stage-grid">
      <div class="recommend-map-column"><div class="poi-shortcuts" aria-label="快速选择地点">${mapPoints().map(p => `<button data-action="select-poi" data-value="${p.id}" aria-pressed="${selectedPoi === p.id}">${esc(p.name)}${a.winningCandidateId === p.id ? ' · 最终地点' : ''}</button>`).join('')}</div>
      ${mapPanel()}</div>
      <aside class="recommend-candidate-rail" aria-label="候选地点概览"><div class="candidate-rail-heading"><span>候选地点</span><strong>${candidates.length}</strong></div>${candidates.map((p, i) => `<button class="candidate-rail-item ${selectedPoi === p.id ? 'active' : ''}" data-action="select-poi" data-value="${p.id}"><span class="candidate-rank">${i + 1}</span><div><strong>${esc(p.name)}</strong><small>${p.average} 分钟 · ${p.score.toFixed(1)} 分</small></div>${icon('arrow')}</button>`).join('') || '<p class="candidate-rail-empty">需求就绪后，候选地点会出现在这里。</p>'}</aside>
      </div>
      </div>
      <div class="data-note">三组共用每人一票，同一地点跨组出现时票数合并。四项评分维度等权；${isShared(a) ? '地点和路线来自高德，费用按可获得数据展示；仅供出行参考。' : '当前为本机示例数据。'}</div>
      <div class="recommend-support">${memberPanel()}${votePanel()}</div>${requestsPanel(a)}</div>`;
  }
  function overview() {
    const activities = visibleActivities();
    return `<section class="overview-hero"><div class="overview-hero-copy"><h1>大家在哪儿见<span class="heading-dot">？</span></h1><p>告诉我们每个人从哪里出发，一起选出更公平、更方便的集合点。</p><div class="overview-primary-actions"><button class="button primary" data-action="create">${icon('plus')} 发起一次见面</button><button class="button light" data-action="join">${icon('link')} 使用邀请码加入</button></div></div><figure class="overview-illustration"><img src="./assets/workspace-ticket.png" alt="手绘人物正在查看集合地点"><figcaption>路线不同，也可以在刚刚好的地方见面。</figcaption></figure></section>
      <ol class="overview-flow" aria-label="MeetPoint 使用流程"><li><span>01</span><div><strong>发起活动</strong><small>确定时间和活动类型</small></div></li><li><span>02</span><div><strong>伙伴填写</strong><small>提交出发地和偏好</small></div></li><li><span>03</span><div><strong>推荐与投票</strong><small>比较真实路线后共同决定</small></div></li></ol>
      <div class="overview-tools"><span>当前身份相关</span><button class="text-button" data-action="identity-info">${isAccount() ? '我的账号' : '身份设置'}</button>${isAccount() ? '<button class="text-button" data-action="sample-journal">查看示例手账</button>' : '<button class="text-button" data-action="new-profile">＋ 新游客身份</button><button class="text-button" data-action="account-login">注册／登录</button>'}${profiles.activeId === 'examples' ? `<button class="text-button" data-action="sample">${icon('plus')} 新建示例活动</button>` : ''}</div>
      <div class="section-heading overview-section-heading"><div><h2>相聚目录</h2><p>正在参与和已经留下回忆的活动，都在这里。</p></div><span>${activities.length} 场</span></div><div class="activity-directory">${activities.map((a, i) => `<article class="activity-entry"><span class="activity-paper-tag ${i % 2 ? 'tilt-right' : 'tilt-left'}">${isShared(a) ? '多人共享' : '本机示例'} · ${statusText(a)}</span><div class="activity-entry-copy"><h2>${esc(a.title)}</h2><p>${esc(a.date)} ${esc(a.time)}<span>·</span>${esc(a.type)}<span>·</span>${a.members.length} 位伙伴</p></div><div class="stacked-avatars">${a.members.slice(0, 5).map((m, index) => avatar(m, index, true)).join('')}</div><button class="text-button activity-entry-link" data-action="open-activity" data-value="${a.id}">进入活动 ${icon('arrow')}</button></article>`).join('') || `<div class="empty-state compact overview-empty"><img src="./assets/workspace-graduate.png" alt="手绘人物举起毕业证书"><p>${isAccount() ? '这个账号还没有参与活动。使用邀请码加入，或创建一场新活动。' : '这个游客身份还没有参与活动。使用邀请码加入，或创建一场新活动。'}</p></div>`}</div><div class="data-note">${isAccount() ? '这里汇总本账号以不同昵称参与的活动。示例手账单独展示，不计入我的活动。' : '当前只显示所选游客身份参与的活动。切换到“本机示例”可查看引导数据；同一浏览器内的游客切换不提供账号级隐私保护。'}</div>`;
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
    ensureDemoFeedback();
    const mine = state.feedback.filter(f => isAccount() ? f.accountId === accountAuth.id : f.memberId === viewer());
    return `<div class="page-heading feedback-heading"><div><div class="eyebrow">BETTER, WITH YOU</div><h1>听听你的建议<span class="heading-dot">.</span></h1><p>告诉我们你的想法，或记录演示中遇到的问题。</p></div><figure class="feedback-heading-art"><img src="./assets/feedback-idea.png" alt="手绘灯泡点亮新想法"></figure></div>
      <div class="feedback-layout"><section class="panel"><h2>留下你的建议</h2><form id="feedback-form"><label>反馈类型<select name="category"><option>功能建议</option><option>体验问题</option><option>推荐结果</option><option>其他反馈</option></select></label><label>反馈内容<textarea name="content" rows="6" maxlength="1000" required placeholder="你希望 MeetPoint 可以做得更好的地方……"></textarea></label><p class="panel-tip">演示反馈只保存在当前浏览器，不会发送给团队。真实管理员处理流程待后端接入。</p><button class="button primary" type="submit">保存反馈 ${icon('arrow')}</button></form></section>
      <section class="panel"><h2>我的反馈 <span class="count-badge">${mine.length}</span></h2>${mine.length ? mine.map(f => `<article class="feedback-item"><div class="inline"><strong>${esc(f.category)}</strong><span class="status">本地已记录</span></div><p>${esc(f.content)}</p><small>${new Date(f.at).toLocaleString('zh-CN')}</small></article>`).join('') : '<div class="empty-state compact"><p>还没有反馈记录。<br>你的想法，会让下一次见面更好。</p></div>'}</section></div>`;
  }
  function ensureDemoFeedback() {
    if (accountAuth?.username !== FULL_DEMO_USERNAME || state.feedback.some(item => item.demoSeed === FULL_DEMO_MARKER && item.accountId === accountAuth.id)) return;
    const items = [
      ['功能建议', '希望可以把最终集合点一键分享给所有伙伴。'],
      ['体验问题', '手机端切换三组推荐时，希望继续保留当前查看的候选地点。'],
      ['推荐结果', '这次最公平方案的路线差异很直观，推荐理由也容易理解。']
    ];
    items.forEach(([category, content], index) => state.feedback.push({
      id: M.uid(), accountId: accountAuth.id, memberId: null, category, content,
      at: Date.now() - (index + 1) * 60 * 60 * 1000, demoSeed: FULL_DEMO_MARKER
    }));
    save();
  }
  function expiredPage() {
    return `<div class="empty-state"><h2>这段未完成的约定，已超过恢复期限</h2><p>游客在最近一次有效操作后 24 小时、演示账号 7 天内可恢复。<br>这里只限制当前身份，伙伴的记录仍然保留。切换其他有效成员，或发起新的活动。</p><button class="button primary" data-action="create">发起新活动</button></div>`;
  }
  function landingHeader() {
    const accountActions = accountAuth
      ? `<button class="landing-workspace" data-action="landing-enter"><span>进入工作台</span>${icon('arrow')}</button>`
      : `<button class="landing-workspace" data-action="account-login"><span>进入工作台</span>${icon('arrow')}</button><button class="landing-register" data-action="account-register">注册</button>`;
    return `<header class="landing-header">
      <div class="landing-header-inner">
        <a class="landing-brand" href="#landing-top" data-action="landing-section" data-value="landing-top" aria-label="MeetPoint 首页"><span>Meet</span><i></i><span>Point</span></a>
        <nav id="primary-nav" class="landing-nav ${menuOpen ? 'is-open' : ''}" aria-label="首页导航">
          <button class="landing-nav-link" data-action="landing-section" data-value="about-meetpoint">了解 MeetPoint</button>
          <button class="landing-nav-link" data-action="landing-section" data-value="how-it-works">使用指南</button>
          <span class="landing-account-actions">${accountActions}</span>
        </nav>
        <button class="landing-menu-toggle" data-action="toggle-menu" aria-expanded="${menuOpen}" aria-controls="primary-nav"><span></span><span></span><span></span><b>菜单</b></button>
      </div>
    </header>`;
  }
  function landingPage() {
    return `<div class="landing-shell" id="landing-top">
      ${landingHeader()}
      <main class="landing-main">
        <section class="landing-hero" aria-labelledby="landing-title">
          <div class="landing-map" aria-hidden="true">
            <svg class="landing-grain-city" viewBox="0 0 1440 760" preserveAspectRatio="xMidYMid slice">
              <defs>
                <pattern id="landing-grain" width="13" height="13" patternUnits="userSpaceOnUse" patternTransform="rotate(7)">
                  <circle cx="2" cy="2" r="1.15"/><circle cx="9" cy="4" r=".7"/><circle cx="5" cy="9" r=".9"/><circle cx="12" cy="11" r=".55"/>
                </pattern>
                <linearGradient id="landing-grain-light" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".88"/><stop offset="1" stop-color="#fff" stop-opacity="0"/>
                </linearGradient>
                <mask id="landing-city-mask">
                  <g fill="#fff">
                    <path d="M0 720V594h54v-42h46v26h42v-86h62v44h49v-118h74v96h42v-54h58v82h48v-132h68v98h50v-61h62v103h56v-174h74v126h45v-76h54v118h62v-202h70v160h56v-94h61v132h62v-158h68v116h51v-72h67v104h64v-136h65v102h54v-48h72v172Z"/>
                    <rect x="812" y="245" width="16" height="355"/><rect x="817" y="98" width="6" height="170"/><circle cx="820" cy="322" r="44"/><circle cx="820" cy="468" r="28"/><circle cx="820" cy="235" r="11"/><path d="M788 620 812 520h16l25 100Zm-10 0h86v28h-86Z"/>
                    <path d="M1006 642q20-274 8-494 66 32 73 494Z"/>
                    <path d="M922 642 937 222h67l12 420Z"/><path d="m949 222 22-34 22 34Z"/>
                    <path d="M865 642 879 290h45l12 352Z"/><path d="m887 290 15-52 16 52Z"/>
                  </g>
                </mask>
              </defs>
              <rect class="city-silhouette" width="1440" height="760" mask="url(#landing-city-mask)"/>
              <path class="city-river" d="M-40 676C250 604 472 726 720 650S1170 562 1480 638"/>
              <path class="city-bridge" d="M240 650Q380 554 520 660M252 650H508M1026 628Q1132 548 1240 620M1040 628H1228"/>
              <rect class="grain-base" width="1440" height="760" fill="url(#landing-grain)" mask="url(#landing-city-mask)"/>
              <rect class="grain-scan" x="-520" width="460" height="760" fill="url(#landing-grain-light)" mask="url(#landing-city-mask)"/>
            </svg>
          </div>
          <div class="landing-hero-content">
            <div class="landing-hero-copy">
              <h1 id="landing-title"><span>WHERE EVERY</span><span>ROUTE MEETS</span></h1>
              <p>让不同的出发，找到刚刚好的相遇。</p>
            </div>
            <figure class="landing-people"><div><img src="./assets/landing-people.png" alt="六位伙伴聚在一起的手绘插画"></div></figure>
            <button class="landing-cta" data-action="landing-enter">开始使用 ${icon('arrow')}</button>
            <p class="landing-assurance">真实路线 · 公平推荐 · 一起决定</p>
          </div>
        </section>

        <section class="landing-about" id="about-meetpoint" aria-labelledby="about-title">
          <div class="landing-section-city landing-about-city" aria-hidden="true"><img src="./assets/landing-city-paris.png?v=2" width="2176" height="728" decoding="async" alt=""></div>
          <figure class="landing-about-illustration"><img src="./assets/landing-routes-complete.png" alt="不同出发点汇聚成共同路线的手绘图"></figure>
          <div class="landing-about-content">
            <div class="landing-section-title"><h2 id="about-title">不是找地图中心，<br>是照顾每个人的路。</h2></div>
            <div class="landing-about-copy">
              <p>MeetPoint 收集每位伙伴的出发地和出行方式，用真实路线比较时间与便利程度，再把合适的候选地点交给大家共同投票。</p>
              <dl class="landing-principles">
                <div><dt>看真实路线</dt><dd>不把几何中点当作公平答案。</dd></div>
                <div><dt>说清推荐理由</dt><dd>时间、费用与未知信息如实呈现。</dd></div>
                <div><dt>由大家决定</dt><dd>候选、投票和改票都留在同一场活动里。</dd></div>
              </dl>
            </div>
          </div>
        </section>

        <section class="landing-guide" id="how-it-works" aria-labelledby="guide-title">
          <div class="landing-section-city landing-guide-city" aria-hidden="true"><img src="./assets/landing-city-sydney.png?v=2" width="2176" height="728" decoding="async" alt=""></div>
          <div class="guide-heading"><h2 id="guide-title">从邀请到出发，三步就够了。</h2><p>少一点群聊里的反复比较，多一点对每个人行程的照顾。</p></div>
          <div class="landing-guide-body">
            <ol class="guide-steps">
              <li><span>1</span><div><h3>发起一次见面</h3><p>确定时间和活动类型，把邀请链接发给伙伴。</p></div></li>
              <li><span>2</span><div><h3>填写各自的路</h3><p>每个人提交出发地、交通方式、偏好和预算。</p></div></li>
              <li><span>3</span><div><h3>比较，然后一起选</h3><p>看懂推荐依据，投票确定大家都方便的集合点。</p></div></li>
            </ol>
            <figure class="landing-guide-illustration"><img src="./assets/landing-vote-black.png?v=2" width="1244" height="1265" decoding="async" alt="共同投票并确认选择的手绘图"></figure>
          </div>
          <button class="landing-cta landing-cta-bottom" data-action="landing-enter">开始一次相聚 ${icon('arrow')}</button>
        </section>
      </main>
      <footer class="landing-footer"><a class="landing-brand" href="#landing-top" data-action="landing-section" data-value="landing-top"><span>Meet</span><i></i><span>Point</span></a><p>让每个人，都离相聚更近一点。</p><small>© 2026 7-eleven engineering</small></footer>
    </div>`;
  }
  function render() {
    document.body.dataset.surface = appSurface;
    if (appSurface === 'landing') {
      document.body.classList.remove('landing-ready');
      $('#app').innerHTML = landingPage();
      syncLandingHeader();
      requestAnimationFrame(() => {
        updateLandingPageTurn();
        requestAnimationFrame(() => document.body.classList.add('landing-ready'));
      });
      return;
    }
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
    $('#app').innerHTML = `<div class="app-shell">${header()}<main class="workspace-main">${restricted ? expiredPage() : ({ calendar: journal.page, recommend: recommendations, overview, members: membersPage, feedback: feedbackPage }[view])()}<footer><span>MeetPoint <span class="footer-separator">/</span> 见面有期，回忆有迹</span><span>OUR LITTLE JOURNAL · VOL. 02 <button class="text-button" data-action="about">关于这本手账</button></span></footer></main></div>`;
    journal.hydrate();
    if ($('#poi-popup')) {
      $('#poi-popup details').open = !!expanded;
      positionPoiPopup(); $('#poi-popup').scrollTop = popupScroll;
      if (hadPopupFocus) {
        const target = focusedAction ? $('#poi-popup').querySelector(`[data-action="${focusedAction}"]`) : focusedSummary ? $('#poi-popup summary') : $('#poi-popup');
        target?.focus({ preventScroll: true });
      }
    }
    if (view === 'recommend' && !restricted) queueMicrotask(() => loadStaticMap());
  }
  function openModal(title, body, wide = false, variant = '') {
    const dialog = $('#modal');
    const wasOpen = dialog.open;
    if (!wasOpen) focusBeforeModal = document.activeElement;
    dialog.className = [wide ? 'wide' : '', variant].filter(Boolean).join(' ');
    dialog.innerHTML = `<div class="modal-header"><h2 id="modal-title">${title}</h2><button class="icon-button" data-action="close-modal" aria-label="关闭">${icon('close')}</button></div><div class="modal-body">${body}</div>`;
    dialog.scrollTop = 0;
    if (!wasOpen) dialog.showModal();
    document.body.classList.add('modal-open');
    requestAnimationFrame(() => dialog.querySelector('.modal-body input, .modal-body select, .modal-body textarea, .modal-body button, .modal-header button')?.focus({ preventScroll: true }));
  }
  function closeModal() {
    $('#modal').close();
    document.body.classList.remove('modal-open');
    if (focusBeforeModal?.isConnected) focusBeforeModal.focus();
  }
  function openAccount(mode = 'login') {
    const registering = mode === 'register';
    openModal(registering ? '创建 MeetPoint 账号' : '欢迎回到 MeetPoint', `<div class="auth-intro"><p>${registering ? '保存你参与的活动，换一台设备也能继续。' : '登录后继续查看和管理你的相聚活动。'}</p></div><div class="auth-mode" role="tablist" aria-label="账号入口"><button type="button" role="tab" aria-selected="${!registering}" class="${!registering ? 'active' : ''}" data-action="account-login">登录</button><button type="button" role="tab" aria-selected="${registering}" class="${registering ? 'active' : ''}" data-action="account-register">注册</button></div><form id="account-${registering ? 'register' : 'login'}-form" class="auth-form"><label>账号名称<input name="username" minlength="3" maxlength="30" required autocomplete="username" placeholder="3—30 个字符" autofocus></label><label>${registering ? '设置密码' : '密码'}<input name="password" type="password" minlength="8" required autocomplete="${registering ? 'new-password' : 'current-password'}" placeholder="至少 8 位"></label><p class="auth-error" role="alert" aria-live="polite"></p><button class="button primary full auth-submit" type="submit">${registering ? '注册并进入工作台' : '登录并进入工作台'} ${icon('arrow')}</button></form><p class="auth-note">账号仅用于恢复活动记录；出发地是否公开仍由你自己决定。</p>`, false, 'auth-dialog');
  }
  let selectedOrigin = null;
  function requirements() {
    selectedOrigin = self()?.origin || null;
    const a = active(), m = self();
    if (!m) return toast('请先加入活动');
    openModal('我的出行需求', `<p class="modal-intro">先告诉我们你从哪里出发。具体位置是否向伙伴公开，由你决定。</p><form id="requirements-form">
      <label>出发地<input id="origin-keyword" value="${esc(m.origin?.name || "")}" placeholder="例如：人民广场"></label><div class="origin-actions"><button type="button" class="button light" id="search-origin">搜索地点</button><button type="button" class="button light" id="use-current-location">${icon('pin')} 使用当前位置</button></div><section class="origin-search-results" aria-label="搜索结果"><p id="origin-search-status" role="status" aria-live="polite">搜索地点，或在你同意后使用设备当前位置。</p><div id="origin-result" class="origin-result-list"></div></section><p id="origin-selected" class="origin-selected" role="status">${m.origin ? `已选择：${esc(m.origin.name)} · ${esc(m.origin.address?.trim() || "暂无详细地址")}` : "尚未选择出发地"}</p>
      <div class="form-grid"><label>交通方式<select name="mode">${['公共交通', '驾车', '步行', '骑行'].map(mode => `<option ${m.mode === mode ? 'selected' : ''}>${mode}</option>`).join('')}</select></label><label>活动偏好<select name="preference">${M.OPTIONS[a.type].map(p => `<option ${m.preference === p ? 'selected' : ''}>${p}</option>`).join('')}</select></label></div>
      <label>人均预算上限（元）<input name="budget" type="number" min="0" max="5000" value="${m.budget}" required></label>
      <label class="checkbox-label"><input name="shared" type="checkbox" ${m.shared ? 'checked' : ''}><span>向其他成员公开我的具体出发地<small>关闭后，位置仍用于推荐计算，但不会在其他人的页面中显示。</small></span></label>
      ${a.status === 'voting' ? '<div class="notice">本轮候选保持不变。修改需求后，可申请重新推荐。</div>' : ''}
      <button type="submit" class="button primary full">保存我的需求 ${icon('check')}</button></form>`);
  }
  document.addEventListener('click',async e=>{
    const button=e.target.closest('#search-origin');
    if(!button)return;
    const form=button.closest('form'),input=form.querySelector('#origin-keyword');
    const status=form.querySelector('#origin-search-status'),list=form.querySelector('#origin-result');
    const keyword=input.value.trim();
    if(!keyword){status.textContent='请先输入地点名称，例如人民广场。';input.focus();return;}
    button.disabled=true;button.textContent='正在搜索…';list.replaceChildren();
    status.textContent='正在搜索地点，请稍候…';
    try{
      const a=active();
      const result=await api('/api/locations/search?activityId='+encodeURIComponent(a.id)+'&keyword='+encodeURIComponent(keyword),'GET',null,sessionFor(a.id).token);
      if(!form.isConnected||!document.getElementById('modal').open)return;
      if(input.value.trim()!==keyword){status.textContent='搜索词已修改，请重新搜索。';return;}
      status.textContent=result.items.length?'找到 '+result.items.length+' 个地点，请点击下方地点选择。':'没有找到相关地点，请换一个名称或补充街道信息。';
      result.items.forEach(p=>{
        const option=document.createElement('button');option.type='button';option.className='origin-result-item';option.setAttribute('aria-pressed','false');
        const title=document.createElement('strong'),address=document.createElement('span'),mark=document.createElement('small');
        title.textContent=p.name;address.textContent=p.address||p.category||'暂无详细地址';mark.textContent='点击选择';
        option.append(title,address,mark);
        option.addEventListener('click',()=>{
          selectedOrigin=p;
          input.value=p.name;
          list.replaceChildren();
          status.textContent='';
          form.querySelector('#origin-selected').textContent='详细地址：'+(p.address?.trim() || '暂无详细地址');
          input.focus({preventScroll:true});
        });
        list.append(option);
      });
    }catch(error){if(form.isConnected)status.textContent='搜索失败：'+error.message+'。请检查后重试。';}
    finally{button.disabled=false;button.textContent='搜索地点';}
  });
  document.addEventListener('click',async e=>{
    const button=e.target.closest('#use-current-location');
    if(!button)return;
    const form=button.closest('form'),input=form.querySelector('#origin-keyword');
    const status=form.querySelector('#origin-search-status'),list=form.querySelector('#origin-result');
    if(!navigator.geolocation){status.textContent='当前浏览器不支持定位，请手动搜索出发地。';return;}
    button.disabled=true;button.textContent='正在定位…';list.replaceChildren();
    status.textContent='浏览器将询问定位权限；只有你同意后才会读取当前位置。';
    try{
      const position=await new Promise((resolve,reject)=>navigator.geolocation.getCurrentPosition(resolve,reject,{enableHighAccuracy:false,timeout:10000,maximumAge:60000}));
      const {longitude:lng,latitude:lat}=position.coords,a=active();
      const place=await api('/api/locations/reverse?activityId='+encodeURIComponent(a.id)+'&lng='+encodeURIComponent(lng)+'&lat='+encodeURIComponent(lat),'GET',null,sessionFor(a.id).token);
      if(!form.isConnected||!document.getElementById('modal').open)return;
      selectedOrigin=place;input.value=place.name;
      status.textContent='已根据当前位置找到附近地点。';
      form.querySelector('#origin-selected').textContent='已选择：'+place.name+' · '+(place.address?.trim()||'暂无详细地址');
    }catch(error){
      if(!form.isConnected)return;
      const denied=error?.code===1;
      status.textContent=denied?'你没有允许定位。可以继续手动搜索出发地。':'当前位置获取失败：'+(error.message||'请稍后重试或手动搜索。');
    }finally{button.disabled=false;button.innerHTML=icon('pin')+' 使用当前位置';}
  });
  function identityOptions() { return `<p class="panel-tip">${isAccount() ? '本次以登录账号参与。活动昵称可单独修改；未完成活动可在最近一次有效操作后 7 天内恢复。' : '本次以游客身份参与，可在最近一次有效操作后 24 小时内从本浏览器恢复。'}</p>`; }
  const defaultNickname = () => {
    const profile = isAccount() ? null : currentProfile() || profiles.list.find(item => item.id === profiles.lastGuestId);
    return profile?.name === '游客' ? '' : profile?.name || '';
  };
  function create(date = M.dateKey()) {
    if (!M.validDate(date)) date = M.dateKey();
    openModal('发起一次见面', `<p class="modal-intro">先确定时间和活动类型，创建后把邀请链接发给伙伴。</p><form id="create-form"><label>活动名称<input name="title" maxlength="40" required placeholder="例如：周五晚饭见"></label><div class="form-grid"><label>见面日期<input name="date" type="date" value="${date}" required></label><label>见面时间<input name="time" type="time" value="18:30" required></label></div><label>你的昵称<input name="nickname" maxlength="16" required value="${esc(defaultNickname())}" placeholder="伙伴会看到这个名字"></label><label>这次想做什么<select name="type">${Object.keys(M.OPTIONS).map(t => `<option>${t}</option>`).join('')}</select></label>${identityOptions()}<div class="subtle-box">支持 2—10 人。创建后，大家分别填写出发地和偏好，再一起查看推荐、完成投票。</div><button type="submit" class="button primary full">创建并邀请伙伴 ${icon('arrow')}</button></form>`);
  }
  function join(code = '') {
    openModal('加入伙伴的活动', `<p class="modal-intro">输入伙伴发来的 6 位邀请码。加入后，先填写你的出行需求。</p><form id="join-form"><label>6 位邀请码<input name="code" required maxlength="6" inputmode="text" autocomplete="one-time-code" value="${esc(code)}" placeholder="例如：MP2026"></label><label>你的昵称<input name="nickname" maxlength="16" required value="${esc(defaultNickname())}" placeholder="让伙伴知道你是谁"></label>${identityOptions()}<button class="button primary full" type="submit">加入并填写需求 ${icon('arrow')}</button></form>`);
  }
  function invite() {
    const a = active();
    openModal('好的相聚，从一句邀请开始', `<p class="modal-intro">活动：${esc(a.title)}</p><div class="invite-code"><small>活动邀请码</small><strong>${a.code}</strong><button class="button light" data-action="copy">${icon('link')} 复制邀请链接</button></div><div class="notice">${isShared(a) ? '把链接发给伙伴，对方可在自己的设备加入这场活动。' : '这是旧版本机示例；请新建活动来体验跨设备协作。'}</div>${a.status === 'voting' ? '<p class="panel-tip">本轮正在投票，成员名单已锁定。</p>' : ''}`);
  }
  function formatScore(value) {
    return Number.isFinite(value) ? value.toFixed(1) : '未知';
  }
  function scoreDetails(p) {
    const a=active();
    return '<div class="detail-score"><span>综合参考分</span><strong>'+p.score.toFixed(1)+'</strong><p>有效维度等权平均；预算无可靠消费数据时不扣分。</p></div>'+
    '<div>'+Object.entries(p.dimensions).map(([key,value])=>'<p>'+esc(({fairness:'公平性',time:'整体耗时',preference:'偏好匹配',convenience:'便利性'})[key]||key)+'：'+formatScore(value)+'</p>').join('')+'</div>'+
    '<p>'+esc((p.reasons||[]).join('；'))+'</p><table><tr><th>成员</th><th>时间</th><th>费用</th></tr>'+p.routes.map(r=>'<tr><td>'+esc(a.members.find(m=>m.id===r.memberId)?.name||'成员')+'</td><td>'+r.minutes+' 分钟</td><td>'+(r.costStatus==='known'?esc(String(r.cost))+' 元':r.costStatus==='not_applicable'?'不适用':'未知')+'</td></tr>').join('')+'</table><p>仅显示本人和公开位置成员的路线；地图费用为预计费用，驾车油费和停车费未知。</p>';
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
    const a = active(), p = a.candidates.find(p => p.id === selectedPoi) || a.candidates.find(p => p.id === a.winningCandidateId), m = self();
    if (!p || !m?.origin) return toast('请先选择候选地点并填写出发地');
    const url = M.navigationUrl(m.origin, p, m.mode);
    const popup = window.open(url, '_blank');
    if (popup) popup.opener = null;
    else openModal('浏览器阻止了新窗口', `<p class="modal-intro">请点击下面的按钮，在高德地图中继续查看从「${esc(m.origin.name)}」到「${esc(p.name)}」的路线。</p><a class="button primary full" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${icon('navigation')} 在高德地图中打开路线</a>`);
  }
  function localIdentityChoices() {
    const guests = profiles.list.filter(item => item.kind !== 'account');
    return `<details class="identity-choices"><summary>切换本机身份</summary><div><button class="button light" data-action="switch-profile" data-value="examples" ${profiles.activeId === 'examples' ? 'disabled aria-current="true"' : ''}>本机示例</button>${guests.map(item => `<button class="button light" data-action="switch-profile" data-value="${esc(item.id)}" ${profiles.activeId === item.id ? 'disabled aria-current="true"' : ''}>${esc(item.name)}${guests.filter(guest => guest.name === item.name).length > 1 ? ` · ${esc(item.id.slice(-4))}` : ''}</button>`).join('')}</div><p class="panel-tip">同名身份用末尾四位区分，切换不会合并活动。</p></details>`;
  }
  const actions = {
    view: value => { view = value; selectedPoi = null; menuOpen = false; render(); },
    'landing-home': () => { appSurface = 'landing'; menuOpen = false; closeModal(); render(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
    'landing-section': value => {
      menuOpen = false;
      $('#primary-nav')?.classList.remove('is-open');
      $('[data-action="toggle-menu"]')?.setAttribute('aria-expanded', 'false');
      document.getElementById(value)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    },
    'landing-enter': () => {
      if (!accountAuth) return openAccount('login');
      appSurface = 'workspace'; view = 'overview'; menuOpen = false; window.scrollTo(0, 0); render();
    },
    create, invite, requirements, details, manage, navigate, join: () => join(),
    'join-current': () => join(active().code),
    'close-modal': closeModal,
    'select-poi': value => { if (!mapPoints().some(p => p.id === value)) return; poiTrigger = document.activeElement; selectedPoi = value; poiContext = currentPoiContext(); updatePoiPopup(true); },
    'retry-static-map': () => { resetStaticMap(); render(); },
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
    'account-login': () => openAccount('login'),
    'account-register': () => openAccount('register'),
    'account-logout': async () => {
      const previous = accountAuth?.previousProfileId;
      try { await api('/api/account/logout', 'POST', {}, accountAuth.token); } catch { /* Local logout still clears this browser. */ }
      for (const key of Object.keys(sharedSessions)) if (key.startsWith(`${profiles.activeId}|`)) delete sharedSessions[key];
      profiles.list = profiles.list.filter(item => item.kind !== 'account');
      accountAuth = null;
      appSurface = 'landing';
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
    about: () => openModal('关于这本相聚手账', '<p class="modal-intro">根据 7-eleven engineering 的 MeetPoint SRS V1.1 实现的演示。</p><ul class="about-list"><li>新建活动可跨设备完成邀请、需求、三组 Top3 推荐、申请审批、多轮投票与手账记录。</li><li>共享活动由服务器和 SQLite 保存；游客可在 24 小时内恢复未完成活动，登录账号可在 7 天内恢复。</li><li>旧示例活动只保存在当前浏览器。登录后的示例手账为独立只读内容，不计入个人活动。</li><li>反馈表单仍为本机演示数据；管理员流程尚未接入共享服务。</li><li>共享活动的地点、路线与静态地图来自高德；本机示例仍使用演示数据。</li><li>演示环境将登录令牌保存在本浏览器；正式部署还需要 HTTPS、访问频率限制和数据库备份。</li></ul>')
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
        if (await run('requirements', { origin: selectedOrigin, mode: data.get('mode'), preference: data.get('preference'), budget: Number(data.get('budget')), shared: data.has('shared') }, '出行需求已保存')) closeModal();
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
        const submit = form.querySelector('.auth-submit');
        const errorMessage = form.querySelector('.auth-error');
        submit.disabled = true;
        submit.setAttribute('aria-busy', 'true');
        submit.dataset.label = submit.innerHTML;
        submit.textContent = route === 'register' ? '正在创建账号…' : '正在登录…';
        errorMessage.textContent = '';
        const result = await api(`/api/account/${route}`, 'POST', { username: data.get('username'), password: data.get('password') });
        const previousProfileId = isAccount() ? accountAuth.previousProfileId : profiles.activeId;
        accountAuth = { ...result.account, token: result.token, previousProfileId };
        const id = `account:${result.account.id}`;
        if (!profiles.list.some(item => item.id === id)) profiles.list.push({ id, name: result.account.username, kind: 'account', lastActivityId: null });
        appSurface = 'workspace';
        closeModal(); await selectProfile(id); toast('账号已登录');
      } else if (form.getAttribute('id') === 'transfer-form') {
        if (await run('transfer', { id: data.get('id') }, '权限已移交，你现在是普通成员')) closeModal();
      } else if (form.getAttribute('id') === 'feedback-form') {
        const content = data.get('content').trim();
        if (!content) throw new Error('请填写反馈内容');
        state.feedback.unshift({ id: M.uid(), memberId: viewer(), accountId: isAccount() ? accountAuth.id : null, category: data.get('category'), content: content.slice(0, 1000), at: Date.now() });
        save(); render(); toast('反馈已保存在本浏览器');
      }
    } catch (error) {
      if (['account-login-form', 'account-register-form'].includes(form.getAttribute('id'))) {
        const submit = form.querySelector('.auth-submit');
        if (submit) {
          submit.disabled = false;
          submit.removeAttribute('aria-busy');
          if (submit.dataset.label) submit.innerHTML = submit.dataset.label;
        }
        const message = form.querySelector('.auth-error');
        if (message) message.textContent = error.message;
      } else toast(error.message);
    }
  });
  $('#modal').addEventListener('click', event => { if (event.target === $('#modal')) { const r = $('#modal').getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeModal(); } });
  window.addEventListener('storage', event => { if (event.key === STORAGE_KEY) { state = load(); closeModal(); render(); } });
  function syncLandingHeader() {
    const threshold = matchMedia('(max-width: 700px)').matches ? 96 : 160;
    document.body.classList.toggle('landing-scrolled', window.scrollY > threshold);
  }
  window.addEventListener('scroll', () => {
    if (appSurface === 'landing') {
      syncLandingHeader();
      scheduleLandingPageTurn();
    }
  }, { passive: true });
  let pageTurnFrame = 0;
  function scheduleLandingPageTurn() {
    if (pageTurnFrame) return;
    pageTurnFrame = requestAnimationFrame(updateLandingPageTurn);
  }
  function updateLandingPageTurn() {
    pageTurnFrame = 0;
    const shell = document.querySelector('.landing-shell');
    const hero = document.querySelector('.landing-hero');
    const sections = document.querySelectorAll('.landing-about, .landing-guide');
    if (!shell || !hero) return;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const viewport = window.innerHeight;
    if (reduced) {
      shell.style.removeProperty('--hero-progress');
      for (const section of sections) section.style.removeProperty('--section-progress');
      return;
    }
    const heroProgress = Math.max(0, Math.min(1, window.scrollY / Math.max(hero.offsetHeight * .82, 1)));
    shell.style.setProperty('--hero-progress', heroProgress.toFixed(3));
    shell.style.setProperty('--hero-map-y', `${(heroProgress * 54).toFixed(1)}px`);
    shell.style.setProperty('--hero-map-opacity', (1 - heroProgress * .28).toFixed(3));
    shell.style.setProperty('--hero-copy-y', `${(heroProgress * -88).toFixed(1)}px`);
    shell.style.setProperty('--hero-copy-opacity', (1 - heroProgress * .52).toFixed(3));
    shell.style.setProperty('--hero-people-y', `${(heroProgress * -38).toFixed(1)}px`);
    shell.style.setProperty('--hero-people-scale', (1 - heroProgress * .035).toFixed(4));
    shell.style.setProperty('--hero-action-y', `${(heroProgress * -16).toFixed(1)}px`);
    for (const section of sections) {
      const bounds = section.getBoundingClientRect();
      const progress = Math.max(-1, Math.min(1, (viewport * .72 - bounds.top) / Math.max(viewport, bounds.height * .55)));
      const rawReveal = Math.max(0, Math.min(1, (viewport * .64 - bounds.top) / Math.max(viewport * .72, 1)));
      const reveal = rawReveal * rawReveal * (3 - 2 * rawReveal);
      section.style.setProperty('--section-progress', progress.toFixed(3));
      section.style.setProperty('--section-bg-reveal', Math.max(0, Math.min(1, reveal * 1.35)).toFixed(3));
      section.style.setProperty('--section-copy-reveal', Math.max(0, Math.min(1, (reveal - .04) / .96)).toFixed(3));
      section.style.setProperty('--section-art-reveal', Math.max(0, Math.min(1, (reveal - .16) / .84)).toFixed(3));
      const copyReveal = Math.max(0, Math.min(1, (reveal - .04) / .96));
      const artReveal = Math.max(0, Math.min(1, (reveal - .16) / .84));
      section.style.setProperty('--section-copy-blur', `${((1 - copyReveal) * 10).toFixed(1)}px`);
      section.style.setProperty('--section-art-blur', `${((1 - artReveal) * 13).toFixed(1)}px`);
      section.style.setProperty('--section-copy-shift', `${((1 - copyReveal) * 42).toFixed(1)}px`);
      section.style.setProperty('--section-art-shift', `${((1 - artReveal) * 54).toFixed(1)}px`);
      section.style.setProperty('--section-bg-blur', `${((1 - Math.max(0, Math.min(1, reveal * 1.35))) * 8).toFixed(1)}px`);
      section.style.setProperty('--section-about-city-y', `${(progress * 24).toFixed(1)}px`);
      section.style.setProperty('--section-guide-city-y', `${(progress * -32).toFixed(1)}px`);
      section.style.setProperty('--section-about-art-y', `${(progress * -44).toFixed(1)}px`);
      section.style.setProperty('--section-about-copy-y', `${(progress * 28).toFixed(1)}px`);
      section.style.setProperty('--section-guide-copy-y', `${(progress * -30).toFixed(1)}px`);
      section.style.setProperty('--section-guide-art-y', `${(progress * 48).toFixed(1)}px`);
    }
  }
  window.addEventListener('resize', () => {
    if (appSurface === 'landing') syncLandingHeader();
    scheduleLandingPageTurn();
  }, { passive: true });
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
      appSurface = 'landing';
      await selectProfile('examples');
      toast('账号登录已过期，请重新登录');
    } else toast(error.message);
  });
})();
