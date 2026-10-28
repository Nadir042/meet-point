'use strict';
const { DatabaseSync } = require('node:sqlite');
const { randomBytes, createHash, scryptSync, timingSafeEqual, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const M = require('./core');

const digest = token => createHash('sha256').update(token).digest('hex');
const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
const codePattern = /^[A-Z0-9]{6}$/;

function openStore(filename = process.env.MEETPOINT_DB || path.join(__dirname, 'data', 'meetpoint.sqlite')) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, payload TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, activity_id TEXT NOT NULL, member_id TEXT NOT NULL,
      FOREIGN KEY(activity_id) REFERENCES activities(id)
    );
    CREATE TABLE IF NOT EXISTS photos (
      id TEXT PRIMARY KEY, activity_id TEXT NOT NULL, member_id TEXT NOT NULL,
      mime TEXT NOT NULL, data BLOB NOT NULL
    );
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, salt TEXT NOT NULL, password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_sessions (
      token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_memberships (
      account_id TEXT NOT NULL, activity_id TEXT NOT NULL, member_id TEXT NOT NULL,
      PRIMARY KEY(account_id, activity_id), UNIQUE(activity_id, member_id)
    );`);
  if (db.prepare('PRAGMA foreign_keys').get().foreign_keys !== 1)
    throw new Error('SQLite 外键约束未启用');
  const findByCode = db.prepare('SELECT payload FROM activities WHERE code = ?');
  const findById = db.prepare('SELECT payload FROM activities WHERE id = ?');
  const insert = db.prepare('INSERT INTO activities (id, code, payload) VALUES (?, ?, ?)');
  const update = db.prepare('UPDATE activities SET payload = ? WHERE id = ?');
  const addSession = db.prepare('INSERT INTO sessions (token_hash, activity_id, member_id) VALUES (?, ?, ?)');
  const findSession = db.prepare('SELECT member_id FROM sessions WHERE token_hash = ? AND activity_id = ?');
  const addPhoto = db.prepare('INSERT INTO photos (id, activity_id, member_id, mime, data) VALUES (?, ?, ?, ?, ?)');
  const findPhoto = db.prepare('SELECT mime, data FROM photos WHERE id = ? AND activity_id = ?');
  const deletePhoto = db.prepare('DELETE FROM photos WHERE id = ? AND activity_id = ?');
  const findAccount = db.prepare('SELECT * FROM accounts WHERE username = ?');
  const findAccountSession = db.prepare('SELECT account_id, expires_at FROM account_sessions WHERE token_hash = ?');
  const findAccountMember = db.prepare('SELECT member_id FROM account_memberships WHERE account_id = ? AND activity_id = ?');
  const accountActivities = db.prepare('SELECT a.payload, m.member_id FROM account_memberships m JOIN activities a ON a.id = m.activity_id WHERE m.account_id = ?');
  const guestSessions = db.prepare('SELECT s.token_hash, s.activity_id, s.member_id, a.payload FROM sessions s JOIN activities a ON a.id = s.activity_id');
  const withWrite = operation => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = operation(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  const makeToken = (a, memberId) => {
    const token = randomBytes(32).toString('base64url');
    addSession.run(digest(token), a.id, memberId);
    return token;
  };
  const accountFor = token => {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail(401, '请先登录账号');
    const session = findAccountSession.get(digest(token));
    if (!session || session.expires_at <= Date.now()) fail(401, '账号登录已过期，请重新登录');
    return session.account_id;
  };
  const issueAccountToken = accountId => {
    const token = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO account_sessions VALUES (?, ?, ?)').run(digest(token), accountId, Date.now() + 7 * M.DAY);
    return token;
  };
  const accountInput = input => {
    const username = typeof input?.username === 'string' ? input.username.trim() : '';
    const password = input?.password;
    if (!/^[\p{L}\p{N}_]{3,30}$/u.test(username) || typeof password !== 'string' || password.length < 8 || password.length > 128)
      fail(400, '账号应为 3—30 位文字、数字或下划线，密码应为 8—128 位');
    return { username, password };
  };
  const project = (a, viewerId) => ({
    ...M.migrate(a), viewerId, requirementsReady: M.ready(a),
    members: M.visibleMembers(a, viewerId).map(m => ({
      ...m, ready: !!a.members.find(member => member.id === m.id)?.origin
    }))
  });
  const authenticate = (id, token) => {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail(401, '请先以活动成员身份加入');
    const row = findSession.get(digest(token), id);
    if (!row && !findAccountSession.get(digest(token))) fail(401, '活动身份无效或已过期');
    const accountId = row ? null : accountFor(token);
    const memberId = row?.member_id || findAccountMember.get(accountId, id)?.member_id;
    if (!memberId) fail(403, '该账号尚未加入此活动');
    const stored = findById.get(id);
    if (!stored) fail(404, '活动不存在');
    const activity = M.tick(M.migrate(JSON.parse(stored.payload)));
    if (activity.status !== JSON.parse(stored.payload).status) update.run(JSON.stringify(activity), id);
    if (!M.access(activity, memberId).allowed) {
      if (row) db.prepare('DELETE FROM sessions WHERE token_hash = ? AND activity_id = ?').run(digest(token), id);
      fail(403, '该身份的活动恢复期限已过');
    }
    return { activity, memberId };
  };

  return {
    pruneExpiredGuests() {
      const remove = db.prepare('DELETE FROM sessions WHERE token_hash = ?');
      for (const row of guestSessions.all()) {
        const activity = M.migrate(JSON.parse(row.payload));
        if (!M.access(activity, row.member_id).allowed) remove.run(row.token_hash);
      }
    },
    register(input) {
      const { username, password } = accountInput(input);
      if (findAccount.get(username)) fail(409, '该账号名称已被使用');
      const id = randomUUID(), salt = randomBytes(16).toString('hex');
      db.prepare('INSERT INTO accounts VALUES (?, ?, ?, ?)').run(id, username, salt, scryptSync(password, salt, 64).toString('hex'));
      return { account: { id, username }, token: issueAccountToken(id) };
    },
    login(input) {
      const { username, password } = accountInput(input);
      const account = findAccount.get(username);
      if (!account) fail(401, '账号或密码不正确');
      const supplied = scryptSync(password, account.salt, 64);
      if (!timingSafeEqual(supplied, Buffer.from(account.password_hash, 'hex'))) fail(401, '账号或密码不正确');
      return { account: { id: account.id, username }, token: issueAccountToken(account.id) };
    },
    account(token) {
      const id = accountFor(token);
      const row = db.prepare('SELECT id, username FROM accounts WHERE id = ?').get(id);
      return { account: row };
    },
    logout(token) {
      accountFor(token);
      db.prepare('DELETE FROM account_sessions WHERE token_hash = ?').run(digest(token));
      return { ok: true };
    },
    listAccountActivities(token) {
      const id = accountFor(token);
      return { activities: accountActivities.all(id).flatMap(row => {
        const activity = M.migrate(JSON.parse(row.payload));
        return M.access(activity, row.member_id).allowed ? [project(activity, row.member_id)] : [];
      }) };
    },
    claim(id, accountToken, guestToken) {
      const accountId = accountFor(accountToken);
      return withWrite(() => {
        if (findAccountMember.get(accountId, id)) fail(409, '该账号已经参与此活动');
        const { activity, memberId } = authenticate(id, guestToken);
        if (!findSession.get(digest(guestToken), id)) fail(403, '请使用原游客身份归入账号');
        const member = activity.members.find(item => item.id === memberId);
        member.identityType = 'account';
        member.lastActiveAt = activity.updatedAt = Date.now();
        update.run(JSON.stringify(activity), id);
        db.prepare('INSERT INTO account_memberships VALUES (?, ?, ?)').run(accountId, id, memberId);
        db.prepare('DELETE FROM sessions WHERE token_hash = ? AND activity_id = ?').run(digest(guestToken), id);
        return { activity: project(activity, memberId) };
      });
    },
    create(input, accountToken) {
      if (typeof input.title !== 'string' || typeof input.nickname !== 'string' ||
          input.title.length > 40 || input.nickname.length > 16) fail(400, '请填写有效的活动名称和昵称');
      return withWrite(() => {
        const accountId = accountToken ? accountFor(accountToken) : null;
        const a = M.createActivity(input.title, input.nickname, input.type, Date.now(), { date: input.date, time: input.time, identityType: accountId ? 'account' : 'guest' });
        // Retrying a rare code collision must not overwrite another invitation.
        while (findByCode.get(a.code)) a.code = randomBytes(3).toString('hex').toUpperCase();
        insert.run(a.id, a.code, JSON.stringify(a));
        if (accountId) db.prepare('INSERT INTO account_memberships VALUES (?, ?, ?)').run(accountId, a.id, a.hostId);
        return { activity: project(a, a.hostId), token: accountId ? null : makeToken(a, a.hostId) };
      });
    },
    join(input, accountToken) {
      const code = typeof input.code === 'string' ? input.code.trim().toUpperCase() : '';
      if (!codePattern.test(code) || typeof input.nickname !== 'string' || input.nickname.length > 16) fail(400, '请填写有效的邀请码和昵称');
      return withWrite(() => {
        const stored = findByCode.get(code);
        if (!stored) fail(404, '邀请码不存在');
        const accountId = accountToken ? accountFor(accountToken) : null;
        if (accountId && findAccountMember.get(accountId, JSON.parse(stored.payload).id)) fail(409, '该账号已经参与此活动');
        const a = M.act(JSON.parse(stored.payload), null, 'join', { name: input.nickname, identityType: accountId ? 'account' : 'guest' });
        update.run(JSON.stringify(a), a.id);
        const memberId = a.members.at(-1).id;
        if (accountId) db.prepare('INSERT INTO account_memberships VALUES (?, ?, ?)').run(accountId, a.id, memberId);
        return { activity: project(a, memberId), token: accountId ? null : makeToken(a, memberId) };
      });
    },
    get(id, token) {
      const { activity, memberId } = authenticate(id, token);
      return { activity: project(activity, memberId) };
    },
    requirements(id, token, input) {
      return withWrite(() => {
        const { activity, memberId } = authenticate(id, token);
        const a = M.act(activity, memberId, 'requirements', {
          originIndex: input.originIndex, mode: input.mode,
          preference: input.preference, budget: input.budget, shared: input.shared === true
        });
        update.run(JSON.stringify(a), id);
        return { activity: project(a, memberId) };
      });
    },
    act(id, token, input) {
      const allowed = new Set(['requirements', 'recommend', 'request', 'reject-request', 'schedule', 'vote', 'finish', 'revote', 'pause', 'resume', 'cancel', 'transfer', 'remove', 'leave', 'rename', 'feeling', 'comment', 'delete-comment', 'delete-photo']);
      if (!input || !allowed.has(input.action)) fail(400, '不支持该操作');
      return withWrite(() => {
        const { activity, memberId } = authenticate(id, token);
        const a = M.act(activity, memberId, input.action, input.data || {});
        update.run(JSON.stringify(a), id);
        if (input.action === 'leave' || input.action === 'remove') {
          const departed = input.action === 'leave' ? memberId : input.data.id;
          db.prepare('DELETE FROM account_memberships WHERE activity_id = ? AND member_id = ?').run(id, departed);
          db.prepare('DELETE FROM sessions WHERE activity_id = ? AND member_id = ?').run(id, departed);
        }
        if (input.action === 'delete-photo') deletePhoto.run(input.data.id, id);
        return { activity: project(a, memberId) };
      });
    },
    uploadPhoto(id, token, input) {
      if (!input || typeof input.id !== 'string' || !/^[a-f0-9-]{36}$/.test(input.id) ||
          typeof input.name !== 'string' || input.name.length > 100 ||
          !['image/jpeg', 'image/png', 'image/webp'].includes(input.mime) ||
          typeof input.base64 !== 'string' || input.base64.length > 11_200_000 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64)) fail(400, '照片格式无效');
      const bytes = Buffer.from(input.base64, 'base64');
      if (!bytes.length || bytes.length > 8 * 1024 * 1024) fail(400, '照片不能超过 8 MB');
      return withWrite(() => {
        const { activity, memberId } = authenticate(id, token);
        const a = M.act(activity, memberId, 'photos', { photos: [{ id: input.id, name: input.name }] });
        addPhoto.run(input.id, id, memberId, input.mime, bytes);
        update.run(JSON.stringify(a), id);
        return { activity: project(a, memberId) };
      });
    },
    photo(id, token, photoId) {
      const { activity } = authenticate(id, token);
      if (!activity.journal.photos.some(photo => photo.id === photoId)) fail(404, '照片不存在');
      const row = findPhoto.get(photoId, id);
      if (!row) fail(404, '照片文件不存在');
      return row;
    },
    close() { db.close(); }
  };
}
module.exports = { openStore };
