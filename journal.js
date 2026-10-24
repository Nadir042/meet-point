/* Calendar and memory book UI. Activity decisions and journal contributions use separate rules. */
window.createMeetPointJournal = function (ctx) {
  'use strict';
  const { M, esc, icon, avatar, getState, active, viewer, activate, replace, render, openModal, toast, create, statusText } = ctx;
  const media = window.MeetPointMedia;
  let selectedDate = getState().activities.filter(a => a.status === 'completed').sort((a, b) => b.date.localeCompare(a.date))[0]?.date || M.dateKey();
  let month = selectedDate.slice(0, 7);
  let busy = false;
  const months = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER'];
  const name = (a, id) => a.members.find(m => m.id === id)?.name || '原活动成员';
  const ownId = a => getState().identities[a.id] || a.hostId;
  const allowed = a => M.access(a, ownId(a)).allowed;
  const dateLabel = value => `${Number(value.slice(5, 7))} 月 ${Number(value.slice(8))} 日`;
  const timeLabel = value => new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(value));
  const onDate = value => getState().activities.filter(a => a.date === value).sort((a, b) => a.time.localeCompare(b.time));
  function cover(a, className = '') {
    const first = a.journal.photos[0];
    return first ? `<img class="photo-loading ${className}" data-photo="${esc(first.id)}" alt="${esc(a.title)}的聚会照片">` : `<img class="${className}" src="./assets/${['autumn', 'cafe', 'lake'].includes(a.journal.cover) ? a.journal.cover : 'autumn'}.svg" alt="${esc(a.title)}的手绘封面（示例插画）">`;
  }
  function page() {
    const [year, mon] = month.split('-').map(Number);
    const firstWeekday = (new Date(year, mon - 1, 1).getDay() + 6) % 7;
    const dayCount = new Date(year, mon, 0).getDate();
    const totalCells = Math.ceil((firstWeekday + dayCount) / 7) * 7;
    const all = getState().activities;
    const monthly = all.filter(a => a.date.startsWith(month) && a.status !== 'cancelled');
    const completed = all.filter(a => a.status === 'completed');
    const selected = onDate(selectedDate);
    return `<section class="journal-hero"><div class="hero-copy"><div class="eyebrow">THE DAYS WE SPENT TOGETHER</div><h1>把相聚，<br>留在日历里<span>。</span></h1><p>把一起走过的路、吃过的饭、说过的话，<br>慢慢收进这一本，只属于我们的相聚手账。</p><div class="hero-actions"><button class="button primary" data-action="create">${icon('plus')} 约一次见面</button><span class="handwritten">好久不见，不如见面。</span></div></div><div class="hero-collage" aria-label="复古手账插画"><div class="postmark">MEETPOINT<br><b>OUR DAYS</b><br>MEMORIES INSIDE</div><figure class="polaroid hero-photo photo-back"><span class="paper-tape"></span><img src="./assets/cafe.svg" alt="咖啡馆相聚的复古插画"><figcaption>闲聊，是正经事。</figcaption></figure><figure class="polaroid hero-photo photo-front"><span class="paper-tape"></span><img src="./assets/autumn.svg" alt="秋日散步的复古插画"><figcaption>和你们一起，把日子过慢一点。</figcaption></figure><span class="collage-caption">a little collection of us</span></div></section>
      <section class="journal-summary"><span><b>${completed.length.toString().padStart(2, '0')}</b> 场已确定的相聚</span><i></i><span><b>${all.reduce((n, a) => n + a.journal.photos.length, 0).toString().padStart(2, '0')}</b> 张珍藏照片</span><i></i><span><b>${all.reduce((n, a) => n + a.journal.feelings.length, 0).toString().padStart(2, '0')}</b> 段心情记录</span><span class="summary-note">每一次见面，都值得被记住。</span></section>
      <div class="calendar-layout"><section class="calendar-paper"><div class="calendar-heading"><div><span class="eyebrow">${months[mon - 1]} / ${year}</span><h2>${String(mon).padStart(2, '0')}<span>月 · 相聚日历</span></h2></div><div class="month-actions"><button class="icon-button" data-action="month-prev" aria-label="上个月">‹</button><button class="text-button" data-action="month-today">今天</button><button class="icon-button" data-action="month-next" aria-label="下个月">›</button><label class="sr-only" for="calendar-month">跳转月份</label><input id="calendar-month" type="month" value="${month}" aria-label="跳转月份"></div></div>
      <div class="calendar-week" aria-hidden="true">${['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'].map((d, i) => `<span>${d}<small>${['一', '二', '三', '四', '五', '六', '日'][i]}</small></span>`).join('')}</div><div class="calendar-grid" aria-label="${year}年${mon}月聚会日历">${Array.from({ length: totalCells }, (_, index) => {
        const day = index - firstWeekday + 1;
        if (day < 1 || day > dayCount) return '<div class="calendar-blank" aria-hidden="true"></div>';
        const value = `${month}-${String(day).padStart(2, '0')}`, entries = onDate(value), first = entries.find(a => a.status !== 'cancelled') || entries[0];
        return `<button class="calendar-day ${selectedDate === value ? 'selected' : ''} ${value === M.dateKey() ? 'today' : ''} ${entries.length ? 'has-event' : ''}" data-action="calendar-date" data-value="${value}" aria-pressed="${selectedDate === value}" aria-label="${dateLabel(value)}，${entries.length}场聚会"><span class="day-number">${day}</span>${value === M.dateKey() ? '<small class="today-word">今</small>' : ''}${first ? `<span class="calendar-event ${first.status === 'cancelled' ? 'cancelled' : ''}">${esc(first.title)}</span><span class="day-detail">${first.status === 'completed' ? '留下了回忆' : statusText(first)}${entries.length > 1 ? ` · +${entries.length - 1}` : ''}</span>${allowed(first) && first.journal.photos.length ? '<span class="day-photo-mark">▧</span>' : ''}` : ''}</button>`;
      }).join('')}</div><div class="calendar-legend"><span><i></i> 有约的日子</span><span><i></i> 正在翻阅</span><span>本月 ${monthly.length} 场相聚 · 点击日期翻开回忆</span></div></section>
      <aside class="day-paper"><div class="day-heading"><span class="eyebrow">ON THIS DAY</span><h2>${dateLabel(selectedDate)}</h2><span class="small-postmark">${selected.length} 场相聚</span></div>${selected.length ? selected.map((a, i) => `<article class="day-entry"><div class="inline"><span class="entry-time">${esc(a.time)}</span><span class="status">${allowed(a) ? statusText(a) : '当前身份已过恢复期'}</span></div><h3>${esc(a.title)}</h3>${allowed(a) ? `${i === 0 ? `<div class="mini-polaroid">${cover(a)}<small>${a.journal.photos.length ? '这一刻，被好好留下了。' : '手绘封面 · 期待你的真实照片'}</small></div>` : ''}<div class="day-members">${a.members.map((m, n) => avatar(m, n, true)).join('')}<span>${a.members.length} 人同行</span></div><p>${esc(a.journal.feelings[0]?.text || '还没有写下这一天。拍一张照片，或者留下一句感受吧。')}</p>` : '<p>只限制该身份访问未完成活动，不会删除其他伙伴的记录。</p>'}<button class="button light full" data-action="open-journal" data-value="${a.id}" ${allowed(a) ? '' : 'disabled'}>翻开这一天 ${icon('arrow')}</button></article>`).join('') : `<div class="blank-day"><span class="handwritten">空白的一页，<br>留给下一次见面。</span><p>这一天还没有聚会安排。</p><button class="button light" data-action="create-on-date">${icon('plus')} 在这天约一次</button></div>`}</aside></div>
      <section class="memory-shelf"><div class="section-heading"><div><span class="eyebrow">LITTLE MOMENTS, LONG MEMORIES</span><h2>那些想再翻一遍的日子</h2></div><button class="text-button" data-action="view" data-value="overview">所有活动 ${icon('arrow')}</button></div><div class="memory-strip">${completed.sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3).map(a => `<button class="memory-card" data-action="open-journal" data-value="${a.id}"><span class="paper-tape"></span>${cover(a)}<span class="memory-date">${esc(a.date.replaceAll('-', '.'))} ${a.isExample ? ' / 示例手账' : ''}</span><strong>${esc(a.title)}</strong><span>${a.members.length} 位伙伴 · ${a.journal.photos.length} 张照片 · ${a.journal.comments.length} 条留言</span></button>`).join('') || '<p class="empty-memories">确定集合点后，这场相聚就会出现在这里。</p>'}</div></section><p class="journal-storage-note">照片与手账保存在当前浏览器，清除网站数据会删除它们。封面为示例插画；切换成员可演示不同人的记录。</p>`;
  }
  function open(id = active().id) {
    const a = getState().activities.find(a => a.id === id);
    if (!a || !allowed(a)) return toast('该身份已超过未完成活动的恢复期限');
    activate(a.id, 'calendar'); selectedDate = a.date; month = a.date.slice(0, 7); render();
    const current = viewer(), mine = a.journal.feelings.find(f => f.memberId === current);
    const locked = a.status === 'cancelled', location = a.candidates.find(p => p.id === a.resultId)?.name || '地点还在商量中';
    openModal('这一页，属于我们', `<article class="journal-detail" data-journal-id="${a.id}"><div class="journal-detail-head"><span class="eyebrow">${esc(a.date.replaceAll('-', '.'))} / ${esc(a.time)} ${a.isExample ? '· 示例活动' : ''}</span><h2>${esc(a.title)}</h2><p>${icon('pin')} ${esc(location)} <span class="status">${statusText(a)}</span></p></div>
      <div class="journal-participants"><span>这天的伙伴</span><div>${a.members.map((m, i) => `<span>${avatar(m, i, true)}${esc(m.name)}</span>`).join('')}</div></div>
      <div class="journal-identity-row"><label>以谁的身份记录<select id="journal-identity" aria-label="切换手账成员">${a.members.map(m => `<option value="${m.id}" ${m.id === current ? 'selected' : ''}>${esc(m.name)}${m.id === a.hostId ? ' · 发起者' : ''}</option>`).join('')}</select></label><button class="text-button" data-action="journal-planning" data-value="${a.id}">查看活动与推荐 ${icon('arrow')}</button></div>
      ${locked ? '<div class="notice">已取消的活动只保留记录，不能新增照片或留言。</div>' : ''}
      <section class="journal-section"><div class="section-heading"><h3>01 / 把这一刻留下</h3><span>${a.journal.photos.length} / 12 张</span></div>${a.journal.photos.length ? `<div class="journal-gallery">${a.journal.photos.map(p => `<figure class="journal-photo"><button class="photo-open" data-action="photo-open" data-value="${p.id}" aria-label="放大查看${esc(p.name)}"><img data-photo="${p.id}" alt="${esc(p.name)}" class="photo-loading"></button><figcaption>${esc(name(a, p.memberId))}<span>${esc(p.name)}</span></figcaption>${p.memberId === current && !locked ? `<button class="text-button danger" data-action="photo-delete" data-value="${p.id}">删除照片</button>` : ''}</figure>`).join('')}</div>` : '<div class="photo-empty"><span>▧</span><p>还没有照片。把今天的光线、笑脸和小确幸，贴在这里。</p></div>'}
      ${!locked ? '<form id="photo-form" class="photo-upload"><label>添加聚会照片<input type="file" name="photos" accept="image/jpeg,image/png,image/webp" multiple required></label><p class="panel-tip">JPG / PNG / WebP，每张不超过 8 MB。保存时自动压缩，每场最多 12 张；仅存于本浏览器。</p><button type="submit" class="button light">＋ 保存选中的照片</button><span id="photo-progress" role="status"></span></form>' : ''}</section>
      <section class="journal-section"><div class="section-heading"><h3>02 / 当时的心情</h3><span>每个人，都有自己的这一页</span></div><div class="feeling-list">${a.journal.feelings.map(f => `<blockquote><p>${esc(f.text)}</p><footer>${esc(name(a, f.memberId))}<span>${timeLabel(f.updatedAt)}</span></footer></blockquote>`).join('') || '<p class="journal-empty-text">等你写下第一段感受。</p>'}</div>${!locked ? `<form id="feeling-form"><label>${mine ? '编辑我的感受' : '写下我的感受'}<textarea name="text" rows="3" maxlength="1000" required placeholder="想记住的，或许只是一个很小的瞬间……">${esc(mine?.text || '')}</textarea></label><button type="submit" class="button primary">${mine ? '保存修改' : '收进手账'} ${icon('check')}</button></form>` : ''}</section>
      <section class="journal-section"><div class="section-heading"><h3>03 / 留给彼此的话</h3><span>${a.journal.comments.length} 条留言</span></div><div class="journal-comments">${a.journal.comments.map(c => `<article class="journal-comment">${avatar({ name: name(a, c.memberId) }, Math.max(0, a.members.findIndex(m => m.id === c.memberId)), true)}<div><header><strong>${esc(name(a, c.memberId))}</strong><time>${timeLabel(c.createdAt)}</time></header><p>${esc(c.text)}</p>${c.memberId === current && !locked ? `<button class="text-button muted" data-action="comment-delete" data-value="${c.id}">删除我的留言</button>` : ''}</div></article>`).join('') || '<p class="journal-empty-text">说一句「下次还要一起」，也很好。</p>'}</div>${!locked ? '<form id="comment-form"><label>给伙伴留句话<textarea name="text" rows="2" maxlength="1000" required placeholder="今天很开心，下次见！"></textarea></label><button type="submit" class="button primary">留下这句话 →</button></form>' : ''}</section></article>`, true);
    document.getElementById('modal').classList.add('journal-modal');
    media.hydrate();
  }
  async function submit(form) {
    if (!['photo-form', 'feeling-form', 'comment-form'].includes(form.getAttribute('id'))) return false;
    const activityId = form.closest('[data-journal-id]').dataset.journalId, actorId = viewer();
    const data = new FormData(form);
    if (busy) return true;
    let stored = [];
    try {
      busy = true;
      const getLatest = () => getState().activities.find(a => a.id === activityId);
      if (form.getAttribute('id') === 'photo-form') {
        const files = data.getAll('photos').filter(f => f.size);
        if (!files.length) throw new Error('请选择至少一张照片');
        if (getLatest().journal.photos.length + files.length > 12) throw new Error('每场聚会最多保留 12 张照片');
        form.querySelector('button[type="submit"]').disabled = true;
        const prepared = [];
        for (let i = 0; i < files.length; i++) {
          const progress = document.getElementById('photo-progress'); if (progress) progress.textContent = `正在处理 ${i + 1} / ${files.length} 张…`;
          prepared.push(await media.prepare(files[i]));
        }
        // Validate ownership/capacity first, then persist files, then atomically replace metadata.
        M.act(getLatest(), actorId, 'photos', { photos: prepared });
        for (const p of prepared) { await media.put(p); stored.push(p.id); }
        replace(M.act(getLatest(), actorId, 'photos', { photos: prepared }));
        stored = [];
      } else replace(M.act(getLatest(), actorId, form.getAttribute('id') === 'feeling-form' ? 'feeling' : 'comment', { text: data.get('text') }));
      render(); open(activityId); toast(form.getAttribute('id') === 'photo-form' ? '照片已收进这一天，刷新后仍可查看' : '已经把这句话好好留下了');
    } catch (error) {
      await Promise.allSettled(stored.map(id => media.remove(id)));
      toast(error.message);
      const button = form.querySelector('button[type="submit"]'); if (button) button.disabled = false;
      const progress = document.getElementById('photo-progress'); if (progress) progress.textContent = '未保存，请检查后重试。';
    } finally { busy = false; }
    return true;
  }
  function shift(delta) {
    const [y, m] = month.split('-').map(Number), d = new Date(y, m - 1 + delta, 1);
    month = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    selectedDate = month + '-01'; render();
  }
  function setDate(value) { if (M.validDate(value)) { selectedDate = value; month = value.slice(0, 7); } }
  const actions = {
    'calendar-date': value => { setDate(value); render(); },
    'month-prev': () => shift(-1), 'month-next': () => shift(1),
    'month-today': () => { setDate(M.dateKey()); render(); },
    'create-on-date': () => create(selectedDate),
    'open-journal': open,
    'journal-planning': id => { document.getElementById('modal').close(); activate(id, 'recommend'); render(); },
    'comment-delete': id => { replace(M.act(active(), viewer(), 'delete-comment', { id })); open(); render(); },
    'photo-delete': async id => {
      if (!confirm('删除这张自己上传的照片？此操作无法撤销。')) return;
      replace(M.act(active(), viewer(), 'delete-photo', { id }));
      await media.remove(id); open(); render();
    },
    'photo-open': async id => {
      const p = active().journal.photos.find(p => p.id === id);
      if (!p || !allowed(active())) return;
      const source = await media.url(id); if (!source) return toast('这张照片的本地文件已不存在');
      openModal('这一刻', `<div class="photo-lightbox"><img src="${esc(source)}" alt="${esc(p.name)}"><p>${esc(p.name)} · ${esc(name(active(), p.memberId))}</p><button class="button light" data-action="open-journal" data-value="${active().id}">返回这一天</button></div>`, true);
    }
  };
  async function change(target) {
    if (target.id === 'calendar-month' && /^\d{4}-\d{2}$/.test(target.value)) { setDate(target.value + '-01'); render(); }
    if (target.id === 'journal-identity') {
      getState().identities[active().id] = target.value; ctx.save(); open();
    }
  }
  return { page, open, submit, actions, change, setDate, hydrate: () => media.hydrate() };
};
