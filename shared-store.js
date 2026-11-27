'use strict';
const { DatabaseSync } = require('node:sqlite');
const { randomBytes, createHash, createHmac, scryptSync, timingSafeEqual, randomUUID, randomInt } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const M = require('./core');

const digest = token => createHash('sha256').update(token).digest('hex');
const fail = (status, message) => { const error = new Error(message); error.status = status; throw error; };
const GUEST_IDENTITY_TTL = 7 * M.DAY;
const codePattern = /^[A-Z0-9]{6}$/;
const jpegFrames = new Set([0xc0,0xc1,0xc2,0xc3,0xc5,0xc6,0xc7,0xc9,0xca,0xcb,0xcd,0xce,0xcf]);

function validPng(bytes) {
  if (bytes.length < 45 || !bytes.subarray(0, 8).equals(Buffer.from([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))) return false;
  let offset = 8, first = true, hasData = false;
  while (offset + 12 <= bytes.length) {
    const length = bytes.readUInt32BE(offset), type = bytes.toString('ascii', offset + 4, offset + 8);
    const end = offset + 12 + length;
    if (end > bytes.length || (first && (type !== 'IHDR' || length !== 13))) return false;
    if (type === 'IHDR' && (!first || length !== 13 || !bytes.readUInt32BE(offset + 8) || !bytes.readUInt32BE(offset + 12))) return false;
    if (type === 'IDAT') hasData = hasData || length > 0;
    if (type === 'IEND') return length === 0 && hasData && end === bytes.length;
    first = false;
    offset = end;
  }
  return false;
}

function validJpeg(bytes) {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return false;
  let offset = 2, inScan = false, hasFrame = false, hasScan = false;
  while (offset < bytes.length) {
    let marker;
    if (inScan) {
      do { if (bytes[offset++] !== 0xff) continue; while (bytes[offset] === 0xff) offset++; marker = bytes[offset++]; } while (offset <= bytes.length && (marker === undefined || marker === 0x00 || (marker >= 0xd0 && marker <= 0xd7)));
    } else {
      if (bytes[offset++] !== 0xff) return false;
      while (bytes[offset] === 0xff) offset++;
      marker = bytes[offset++];
    }
    if (marker === undefined) return false;
    if (marker === 0xd9) return hasFrame && hasScan && offset === bytes.length;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    inScan = false;
    if (offset + 2 > bytes.length) return false;
    const length = bytes.readUInt16BE(offset), end = offset + length;
    if (length < 2 || end > bytes.length) return false;
    if (jpegFrames.has(marker)) {
      if (length < 8 || !bytes.readUInt16BE(offset + 3) || !bytes.readUInt16BE(offset + 5)) return false;
      hasFrame = true;
    }
    if (marker === 0xda) {
      if (length < 6) return false;
      hasScan = true;
      inScan = true;
    }
    offset = end;
  }
  return false;
}

function validWebp(bytes) {
  if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'RIFF' || bytes.toString('ascii', 8, 12) !== 'WEBP' || bytes.readUInt32LE(4) !== bytes.length - 8) return false;
  let offset = 12, extended = false, hasImage = false;
  const imageChunk = (type, data, length) =>
    (type === 'VP8 ' && length >= 10 && bytes[data + 3] === 0x9d && bytes[data + 4] === 0x01 && bytes[data + 5] === 0x2a) ||
    (type === 'VP8L' && length >= 5 && bytes[data] === 0x2f);
  const animationFrame = (start, end) => {
    let frameOffset = start + 16, found = false;
    while (frameOffset + 8 <= end) {
      const type = bytes.toString('ascii', frameOffset, frameOffset + 4), length = bytes.readUInt32LE(frameOffset + 4);
      const data = frameOffset + 8, chunkEnd = data + length, paddedEnd = chunkEnd + (length % 2);
      if (paddedEnd > end) return false;
      found = found || imageChunk(type, data, length);
      frameOffset = paddedEnd;
    }
    return frameOffset === end && found;
  };
  while (offset + 8 <= bytes.length) {
    const type = bytes.toString('ascii', offset, offset + 4), length = bytes.readUInt32LE(offset + 4);
    const data = offset + 8, end = data + length, paddedEnd = end + (length % 2);
    if (paddedEnd > bytes.length) return false;
    if (type === 'VP8X') { if (length !== 10) return false; extended = true; }
    hasImage = hasImage || imageChunk(type, data, length) || (type === 'ANMF' && extended && length >= 16 && animationFrame(data, end));
    offset = paddedEnd;
  }
  return offset === bytes.length && hasImage;
}

const validPhotoContent = (mime, bytes) => ({ 'image/png': validPng, 'image/jpeg': validJpeg, 'image/webp': validWebp })[mime]?.(bytes) === true;

function openStore(filename = process.env.MEETPOINT_DB || path.join(__dirname, 'data', 'meetpoint.sqlite')) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec(`PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 2000;
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
    CREATE TABLE IF NOT EXISTS administrators (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS disabled_accounts (
      account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE
    );
    CREATE TABLE IF NOT EXISTS account_sessions (
      token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id),
      category TEXT NOT NULL, content TEXT NOT NULL, created_at INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT '待处理'
    );
    CREATE TABLE IF NOT EXISTS account_memberships (
      account_id TEXT NOT NULL, activity_id TEXT NOT NULL, member_id TEXT NOT NULL,
      PRIMARY KEY(account_id, activity_id), UNIQUE(activity_id, member_id)
    );`);
  if (db.prepare('PRAGMA foreign_keys').get().foreign_keys !== 1)
    throw new Error('SQLite 外键约束未启用');
  // Keep the expiry index in sync with membership writes, including legacy sessions.
  const expiryForMember = `COALESCE((SELECT json_extract(m.value, '$.lastActiveAt')
    FROM json_each(a.payload, '$.members') m WHERE json_extract(m.value, '$.id') = s.member_id),
    json_extract(a.payload, '$.updatedAt'), 0) + ${M.DAY}`;
  db.exec(`CREATE INDEX IF NOT EXISTS sessions_by_activity ON sessions(activity_id, member_id);
    CREATE TABLE IF NOT EXISTS guest_expiry (
      token_hash TEXT PRIMARY KEY REFERENCES sessions(token_hash) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS guest_expiry_due ON guest_expiry(expires_at);
    CREATE TRIGGER IF NOT EXISTS index_new_guest AFTER INSERT ON sessions BEGIN
      INSERT INTO guest_expiry SELECT s.token_hash, ${expiryForMember}
      FROM sessions s JOIN activities a ON a.id = s.activity_id WHERE s.token_hash = NEW.token_hash;
    END;
    CREATE TRIGGER IF NOT EXISTS refresh_guest_expiry AFTER UPDATE OF payload ON activities BEGIN
      INSERT OR REPLACE INTO guest_expiry SELECT s.token_hash, ${expiryForMember}
      FROM sessions s JOIN activities a ON a.id = s.activity_id WHERE s.activity_id = NEW.id;
    END;
    INSERT INTO guest_expiry SELECT s.token_hash, ${expiryForMember}
      FROM sessions s JOIN activities a ON a.id = s.activity_id
      WHERE NOT EXISTS (SELECT 1 FROM guest_expiry e WHERE e.token_hash = s.token_hash);
    CREATE TABLE IF NOT EXISTS guest_identities (
      token_hash TEXT PRIMARY KEY, expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS guest_identity_due ON guest_identities(expires_at);
    CREATE TABLE IF NOT EXISTS guest_memberships (
      identity_hash TEXT NOT NULL REFERENCES guest_identities(token_hash) ON DELETE CASCADE,
      activity_id TEXT NOT NULL,
      session_hash TEXT NOT NULL UNIQUE REFERENCES sessions(token_hash) ON DELETE CASCADE,
      PRIMARY KEY (identity_hash, activity_id)
    );
    CREATE TABLE IF NOT EXISTS activity_create_requests (
      owner TEXT NOT NULL, request_id TEXT NOT NULL, payload_hash TEXT NOT NULL,
      activity_id TEXT NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      member_id TEXT NOT NULL,
      PRIMARY KEY (owner, request_id)
    );
    CREATE TABLE IF NOT EXISTS guest_claims (
      token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL, activity_id TEXT NOT NULL, member_id TEXT NOT NULL,
      FOREIGN KEY(account_id, activity_id) REFERENCES account_memberships(account_id, activity_id) ON DELETE CASCADE
    );`);
  const findByCode = db.prepare('SELECT payload FROM activities WHERE code = ?');
  const findById = db.prepare('SELECT payload FROM activities WHERE id = ?');
  const insert = db.prepare('INSERT INTO activities (id, code, payload) VALUES (?, ?, ?)');
  const update = db.prepare('UPDATE activities SET payload = ? WHERE id = ?');
  const addSession = db.prepare('INSERT INTO sessions (token_hash, activity_id, member_id) VALUES (?, ?, ?)');
  const findGuestIdentity = db.prepare('SELECT expires_at FROM guest_identities WHERE token_hash = ?');
  const addGuestMembership = db.prepare('INSERT INTO guest_memberships VALUES (?, ?, ?)');
  const findGuestMembership = db.prepare(`SELECT s.member_id FROM guest_memberships m
    JOIN sessions s ON s.token_hash = m.session_hash WHERE m.identity_hash = ? AND m.activity_id = ?`);
  const findSession = db.prepare('SELECT s.member_id, e.expires_at FROM sessions s JOIN guest_expiry e ON e.token_hash = s.token_hash WHERE s.token_hash = ? AND s.activity_id = ?');
  const addPhoto = db.prepare('INSERT INTO photos (id, activity_id, member_id, mime, data) VALUES (?, ?, ?, ?, ?)');
  const findPhoto = db.prepare('SELECT mime, data FROM photos WHERE id = ? AND activity_id = ?');
  const deletePhoto = db.prepare('DELETE FROM photos WHERE id = ? AND activity_id = ?');
  const guestActivity = db.prepare('SELECT activity_id FROM sessions WHERE token_hash = ?');
  const findAccount = db.prepare('SELECT * FROM accounts WHERE username = ?');
  const findAccountSession = db.prepare('SELECT account_id, expires_at FROM account_sessions WHERE token_hash = ?');
  const findAccountMember = db.prepare('SELECT member_id FROM account_memberships WHERE account_id = ? AND activity_id = ?');
  const accountActivities = db.prepare('SELECT a.payload, m.member_id FROM account_memberships m JOIN activities a ON a.id = m.activity_id WHERE m.account_id = ?');
  const expiredGuestMember = db.prepare(`SELECT 1 FROM sessions s
    JOIN guest_expiry e ON e.token_hash = s.token_hash
    WHERE s.activity_id = ? AND s.member_id = ? AND e.expires_at <= ?`);
  const guestSessions = db.prepare('SELECT s.token_hash, s.activity_id, s.member_id, a.payload FROM guest_expiry e JOIN sessions s ON s.token_hash = e.token_hash JOIN activities a ON a.id = s.activity_id WHERE e.expires_at <= ?');
  const withWrite = operation => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = operation(); db.exec('COMMIT'); return result; }
    catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  withWrite(() => {
    if (db.prepare('PRAGMA user_version').get().user_version === 0) {
      // Existing deadlines represent last visit + one day. Keep expired identities expired.
      db.prepare('UPDATE guest_identities SET expires_at = expires_at + ? WHERE expires_at > ?')
        .run(GUEST_IDENTITY_TTL - M.DAY, Date.now());
      db.exec('PRAGMA user_version = 1');
    }
  });
  const accountFor = token => {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail(401, '请先登录账号');
    const session = findAccountSession.get(digest(token));
    if (!session || session.expires_at <= Date.now()) fail(401, '账号登录已过期，请重新登录');
    return session.account_id;
  };
  const isAdmin = id => !!db.prepare('SELECT 1 FROM administrators WHERE account_id = ?').get(id);
  const isDisabled = id => !!db.prepare('SELECT 1 FROM disabled_accounts WHERE account_id = ?').get(id);
  const requireAdmin = token => {
    if (!isAdmin(accountFor(token))) fail(403, '需要系统管理员权限');
  };
  const targetAccount = username => {
    const target = typeof username === 'string' && findAccount.get(username.trim());
    if (!target) fail(404, '未找到该账号');
    return target;
  };
  const accountStatus = target => ({ username: target.username, disabled: isDisabled(target.id), admin: isAdmin(target.id) });
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
  const disabledMembers = db.prepare(`SELECT m.member_id FROM account_memberships m
    JOIN disabled_accounts d ON d.account_id = m.account_id WHERE m.activity_id = ?`);
  function effectiveMembers(activity, now = Date.now()) {
    const disabled = new Set(disabledMembers.all(activity.id).map(row => row.member_id));
    return activity.members.filter(m => !disabled.has(m.id) && M.access(activity, m.id, now).allowed);
  }
  const project = (a, viewerId) => {
    const activity = M.migrate(a);
    const eligible = effectiveMembers(activity);
    const participants = { ...activity, members: eligible };
    const voteStatus = M.voteStatus(activity, viewerId, eligible);
    const visibleRoutes = new Set(a.members.filter(m => m.shared || m.id === viewerId).map(m => m.id));
    return {
      ...activity, viewerId, ...(viewerId === a.hostId ? { successorIds: eligible.filter(m => m.id !== a.hostId).map(m => m.id) } : {}), requirementsReady: M.ready(participants), recommendationProgress: M.recommendationProgress(participants), voteStatus,
      votes: voteStatus.myVote ? { [viewerId]: voteStatus.myVote } : {},
      candidates: activity.candidates.map(p => ({ ...p, routes: (p.routes || []).filter(r => visibleRoutes.has(r.memberId)) })),
      members: M.visibleMembers(a, viewerId).map((m, i) => ({
        ...m, ready: !!a.members[i].origin, originReady: !!a.members[i].origin
      }))
    };
  };
  const authenticate = (id, token) => {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail(401, '请先以活动成员身份加入');
    const row = findSession.get(digest(token), id);
    if (!row && !findAccountSession.get(digest(token))) fail(401, '活动身份无效或已过期');
    const accountId = row ? null : accountFor(token);
    const memberId = row?.member_id || findAccountMember.get(accountId, id)?.member_id;
    if (!memberId) fail(403, '该账号尚未加入此活动');
    const stored = findById.get(id);
    if (!stored) fail(404, '活动不存在');
    const before = JSON.parse(stored.payload);
    const activity = M.tick(before);
    if (activity.status !== before.status) update.run(JSON.stringify(activity), id);
    if (!M.access(activity, memberId).allowed || (row && row.expires_at <= Date.now())) {
      fail(403, '该身份的活动恢复期限已过');
    }
    const eligible = effectiveMembers(activity);
    if (!['completed', 'cancelled'].includes(activity.status) && eligible.length &&
        !eligible.some(member => member.id === activity.hostId)) {
      activity.hostId = eligible[randomInt(eligible.length)].id;
      update.run(JSON.stringify(activity), id);
    }
    return { activity, memberId };
  };

  function validateGuestIdentity(token) {
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) fail(401, '请先初始化游客身份');
    const hash = digest(token);
    const identity = findGuestIdentity.get(hash);
    if (!identity || identity.expires_at <= Date.now()) fail(410, '游客身份已到期');
    return hash;
  }

  // A retry can recover the same token without storing it in plaintext.
  function guestMemberToken(guestToken, activityId, memberId) {
    return createHmac('sha256', guestToken)
      .update(`meetpoint:activity-membership:v1:${activityId}:${memberId}`).digest('base64url');
  }

  function issueMembership(accountId, activityId, memberId, guestToken, guestHash) {
    if (accountId) {
      db.prepare('INSERT INTO account_memberships VALUES (?, ?, ?)').run(accountId, activityId, memberId);
      return null;
    }
    const token = guestHash ? guestMemberToken(guestToken, activityId, memberId) : randomBytes(32).toString('base64url');
    const hash = digest(token);
    addSession.run(hash, activityId, memberId);
    if (guestHash) addGuestMembership.run(guestHash, activityId, hash);
    return token;
  }

  const due = db.prepare(`SELECT payload FROM activities
    WHERE json_extract(payload, '$.status') = 'voting'
      AND json_extract(payload, '$.paused') = 0
      AND json_extract(payload, '$.deadline') <= ?`);
  return {
    settleExpiredRounds(now = Date.now()) {
      if (!due.get(now)) return;
      return withWrite(() => {
        for (const row of due.all(now)) {
          const activity = M.tick(JSON.parse(row.payload), now);
          update.run(JSON.stringify(activity), activity.id);
        }
      });
    },
    visitGuestIdentity(token) {
      const now = Date.now(), expiresAt = now + GUEST_IDENTITY_TTL;
      if (token !== undefined) {
        const result = db.prepare('UPDATE guest_identities SET expires_at = ? WHERE token_hash = ? AND expires_at > ?')
          .run(expiresAt, digest(token), now);
        if (!result.changes) fail(410, '游客身份已到期');
        return { expiresAt };
      }
      const issued = randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO guest_identities VALUES (?, ?)').run(digest(issued), expiresAt);
      return { token: issued, expiresAt };
    },
    guestActivityStatus(id, token) {
      const { activity, memberId } = authenticate(id, token);
      if (!findSession.get(digest(token), id)) fail(403, '请使用游客活动凭证');
      return { lastActiveAt: activity.members.find(m => m.id === memberId).lastActiveAt };
    },
    pruneExpiredGuests(now = Date.now()) {
      db.prepare('DELETE FROM guest_identities WHERE expires_at <= ?').run(now);
      if (!db.prepare('SELECT 1 FROM guest_expiry WHERE expires_at <= ? LIMIT 1').get(now)) return;
      return withWrite(() => {
        const expired = new Map();
        const lastExpiry = new Map();
        for (const row of guestSessions.all(now)) {
          const activity = expired.get(row.activity_id) || JSON.parse(row.payload);
          const member = activity.members.find(m => m.id === row.member_id);
          if (member && now < (member.lastActiveAt ?? activity.updatedAt) + M.DAY) continue;
          db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(row.token_hash);
          if (member) {
            activity.formerMembers ||= {};
            activity.formerMembers[member.id] = member.name;
            activity.members = activity.members.filter(m => m.id !== member.id);
            for (const candidate of activity.candidates) {
              if (candidate.routes) candidate.routes = candidate.routes.filter(r => r.memberId !== member.id);
            }
            expired.set(activity.id, activity);
            lastExpiry.set(activity.id, Math.max(lastExpiry.get(activity.id) || 0, (member.lastActiveAt ?? activity.updatedAt) + M.DAY));
          }
        }
        for (const activity of expired.values()) {
          if (!activity.members.length && Object.keys(activity.formerMembers).length === 1 && !activity.hadMultipleMembers) {
            db.prepare('DELETE FROM photos WHERE activity_id = ?').run(activity.id);
            db.prepare('DELETE FROM activities WHERE id = ?').run(activity.id);
            continue;
          }
          if (!activity.members.some(m => m.id === activity.hostId)) {
            const eligible = effectiveMembers(activity, now);
            activity.hostId = eligible.length ? eligible[randomInt(eligible.length)].id : null;
            if (!eligible.length && !['completed', 'cancelled'].includes(activity.status)) {
              // A round that ended before the last guest expired already has a result.
              if (activity.status === 'voting' && !activity.paused && activity.deadline <= lastExpiry.get(activity.id)) {
                Object.assign(activity, M.tick(activity, lastExpiry.get(activity.id)));
              }
              if (activity.status !== 'completed') {
                activity.status = 'cancelled';
                activity.paused = false;
              }
            }
          }
          update.run(JSON.stringify(activity), activity.id);
        }
      });
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
      return withWrite(() => {
        if (isDisabled(account.id)) fail(403, '账号已停用');
        return { account: { id: account.id, username, admin: isAdmin(account.id) }, token: issueAccountToken(account.id) };
      });
    },
    account(token) {
      const id = accountFor(token);
      const row = db.prepare('SELECT id, username FROM accounts WHERE id = ?').get(id);
      return { account: { ...row, admin: isAdmin(id) } };
    },
    grantAdmin(username) {
      return withWrite(() => {
        const target = targetAccount(username);
        if (isDisabled(target.id)) fail(409, '请先恢复该账号');
        db.prepare('INSERT OR IGNORE INTO administrators VALUES (?)').run(target.id);
      });
    },
    submitFeedback(token, input) {
      const accountId = accountFor(token);
      const categories = ['功能建议', '体验问题', '推荐结果', '其他反馈'];
      const category = input?.category;
      const content = typeof input?.content === 'string' ? input.content.trim() : '';
      if (!categories.includes(category) || !content || content.length > 1000)
        fail(400, '请选择反馈类型并填写 1—1000 字内容');
      const item = { id: randomUUID(), category, content, createdAt: Date.now(), status: '待处理' };
      db.prepare('INSERT INTO feedback VALUES (?, ?, ?, ?, ?, ?)').run(item.id, accountId, category, content, item.createdAt, item.status);
      return item;
    },
    listMyFeedback(token) {
      const accountId = accountFor(token);
      return { items: db.prepare('SELECT id, category, content, created_at AS createdAt, status FROM feedback WHERE account_id = ? ORDER BY created_at DESC, id DESC').all(accountId) };
    },
    listAdminFeedback(token) {
      requireAdmin(token);
      return { items: db.prepare('SELECT f.id, a.username, f.category, f.content, f.created_at AS createdAt, f.status FROM feedback f JOIN accounts a ON a.id = f.account_id ORDER BY f.created_at DESC, f.id DESC').all() };
    },
    lookupAccount(token, username) {
      requireAdmin(token);
      return accountStatus(targetAccount(username));
    },
    reviewAccountActivities(token, username) {
      requireAdmin(token);
      const target = targetAccount(username);
      return { activities: accountActivities.all(target.id).map(row => {
        const activity = M.tick(JSON.parse(row.payload));
        const { id, title, date, time, type, status, paused, journal } = activity;
        const member = activity.members.find(item => item.id === row.member_id);
        const byTarget = entry => entry.memberId === row.member_id;
        return {
          id, title, date, time, type, status, paused, nickname: member?.name,
          feelings: journal.feelings.filter(byTarget).map(({ text }) => ({ text })),
          comments: journal.comments.filter(byTarget).map(({ text }) => ({ text })),
          photos: journal.photos.filter(byTarget).map(({ id, name }) => ({ id, name }))
        };
      }) };
    },
    reviewAccountPhoto(token, username, activityId, photoId) {
      requireAdmin(token);
      const target = targetAccount(username);
      const membership = findAccountMember.get(target.id, activityId);
      const stored = membership && findById.get(activityId);
      if (!stored) fail(404, '活动不存在');
      const activity = M.migrate(JSON.parse(stored.payload));
      if (!activity.journal.photos.some(photo => photo.id === photoId && photo.memberId === membership.member_id))
        fail(404, '照片不存在');
      const row = findPhoto.get(photoId, activityId);
      if (!row) fail(404, '照片文件不存在');
      return row;
    },
    setAccountDisabled(token, username, disabled) {
      return withWrite(() => {
        requireAdmin(token);
        const target = targetAccount(username);
        if (isAdmin(target.id)) fail(403, '只能管理普通账号');
        if (typeof disabled !== 'boolean') fail(400, '账号状态无效');
        if (disabled) {
          db.prepare('INSERT OR IGNORE INTO disabled_accounts VALUES (?)').run(target.id);
          db.prepare('DELETE FROM account_sessions WHERE account_id = ?').run(target.id);
        } else {
          if (isDisabled(target.id)) {
            for (const row of accountActivities.all(target.id)) {
              const activity = M.tick(JSON.parse(row.payload));
              if (['completed', 'cancelled'].includes(activity.status)) continue;
              if (M.access(activity, row.member_id).allowed && effectiveMembers(activity).length >= 10)
                fail(409, `活动「${activity.title}」已有 10 位有效成员，腾出名额后才能恢复该账号`);
            }
          }
          db.prepare('DELETE FROM disabled_accounts WHERE account_id = ?').run(target.id);
        }
        return accountStatus(target);
      });
    },
    logout(token) {
      accountFor(token);
      db.prepare('DELETE FROM account_sessions WHERE token_hash = ?').run(digest(token));
      return { ok: true };
    },
    listAccountActivities(token) {
      const id = accountFor(token);
      return { activities: accountActivities.all(id).flatMap(row => {
        const activity = M.tick(JSON.parse(row.payload));
        return M.access(activity, row.member_id).allowed ? [project(activity, row.member_id)] : [];
      }) };
    },
    claim(id, accountToken, guestToken) {
      const accountId = accountFor(accountToken);
      return withWrite(() => {
        if (typeof guestToken !== 'string') fail(401, '游客凭证无效');
        const hash = digest(guestToken);
        const membership = findAccountMember.get(accountId, id);
        if (membership) {
          const receipt = db.prepare('SELECT 1 FROM guest_claims WHERE token_hash = ? AND account_id = ? AND activity_id = ? AND member_id = ?');
          if (receipt.get(hash, accountId, id, membership.member_id)) {
            const { activity, memberId } = authenticate(id, accountToken);
            return { activity: project(activity, memberId) };
          }
          fail(409, '该账号已经参与此活动');
        }
        const { activity, memberId } = authenticate(id, guestToken);
        if (!findSession.get(digest(guestToken), id)) fail(403, '请使用原游客身份归入账号');
        const member = activity.members.find(item => item.id === memberId);
        member.identityType = 'account';
        member.lastActiveAt = activity.updatedAt = Date.now();
        update.run(JSON.stringify(activity), id);
        db.prepare('INSERT INTO account_memberships VALUES (?, ?, ?)').run(accountId, id, memberId);
        db.prepare('INSERT INTO guest_claims VALUES (?, ?, ?, ?)').run(hash, accountId, id, memberId);
        db.prepare('DELETE FROM sessions WHERE token_hash = ? AND activity_id = ?').run(hash, id);
        return { activity: project(activity, memberId) };
      });
    },
    create(input, accountToken, guestToken) {
      const accountId = accountToken === undefined ? null : accountFor(accountToken);
      if (typeof input.title !== 'string' || typeof input.nickname !== 'string' ||
          input.title.length > 40 || input.nickname.length > 16) fail(400, '请填写有效的活动名称和昵称');
      return withWrite(() => {
        const guestHash = !accountId && guestToken !== undefined ? validateGuestIdentity(guestToken) : null;
        const requestId = input.requestId;
        if (requestId !== undefined &&
            (typeof requestId !== 'string' || !/^[a-zA-Z0-9-]{12,64}$/.test(requestId)))
          fail(400, '创建请求编号无效');
        const owner = accountId ? `account:${accountId}` : guestHash ? `guest:${guestHash}` : null;
        const payloadHash = digest(JSON.stringify([input.title, input.nickname, input.type, input.date, input.time]));
        if (requestId && owner) {
          const prior = db.prepare('SELECT * FROM activity_create_requests WHERE owner = ? AND request_id = ?').get(owner, requestId);
          if (prior) {
            if (prior.payload_hash !== payloadHash) fail(409, '本次创建请求已保存，请重新打开表单创建新活动');
            const token = accountId ? accountToken : guestMemberToken(guestToken, prior.activity_id, prior.member_id);
            const { activity, memberId } = authenticate(prior.activity_id, token);
            return { activity: project(activity, memberId), token: accountId ? null : token };
          }
        }
        const a = M.createActivity(input.title, input.nickname, input.type, Date.now(), { date: input.date, time: input.time, identityType: accountId ? 'account' : 'guest' });
        // Retrying a rare code collision must not overwrite another invitation.
        while (findByCode.get(a.code)) a.code = randomBytes(3).toString('hex').toUpperCase();
        insert.run(a.id, a.code, JSON.stringify(a));
        const token = issueMembership(accountId, a.id, a.hostId, guestToken, guestHash);
        if (owner && requestId) db.prepare('INSERT INTO activity_create_requests VALUES (?, ?, ?, ?, ?)').run(owner, requestId, payloadHash, a.id, a.hostId);
        return { activity: project(a, a.hostId), token };
      });
    },
    join(input, accountToken, guestToken) {
      const accountId = accountToken === undefined ? null : accountFor(accountToken);
      const code = typeof input.code === 'string' ? input.code.trim().toUpperCase() : '';
      if (!codePattern.test(code) || typeof input.nickname !== 'string' || input.nickname.length > 16) fail(400, '请填写有效的邀请码和昵称');
      return withWrite(() => {
        const guestHash = !accountId && guestToken !== undefined ? validateGuestIdentity(guestToken) : null;
        const stored = findByCode.get(code);
        if (!stored) fail(404, '邀请码不存在');
        const activity = JSON.parse(stored.payload);
        const now = Date.now();
        // An invitation cannot turn a solo activity that is due for deletion into a shared one.
        const [soleMember] = activity.members;
        if (!activity.hadMultipleMembers && !Object.keys(activity.formerMembers || {}).length &&
            activity.members.length === 1 && expiredGuestMember.get(activity.id, soleMember.id, now))
          fail(410, '该活动已到期，邀请码已失效');
        if (accountId && findAccountMember.get(accountId, activity.id)) fail(409, '该账号已经参与此活动');
        const existing = guestHash && findGuestMembership.get(guestHash, activity.id);
        if (existing) {
          const token = guestMemberToken(guestToken, activity.id, existing.member_id);
          const { activity: current, memberId } = authenticate(activity.id, token);
          return { activity: project(current, memberId), token, alreadyJoined: true };
        }
        const a = M.act(activity, null, 'join', { name: input.nickname, identityType: accountId ? 'account' : 'guest' }, now, effectiveMembers(activity, now));
        a.hadMultipleMembers = true;
        update.run(JSON.stringify(a), a.id);
        const memberId = a.members.at(-1).id;
        const token = issueMembership(accountId, a.id, memberId, guestToken, guestHash);
        return { activity: project(a, memberId), token };
      });
    },
    get(id, token) {
      return withWrite(() => {
        const { activity, memberId } = authenticate(id, token);
        return { activity: project(activity, memberId) };
      });
    },
    history(id, token) {
      return withWrite(() => {
        const { activity } = authenticate(id, token);
        return { items: activity.roundHistory };
      });
    },
    requirements(id, token, input) {
      return withWrite(() => {
        const { activity, memberId } = authenticate(id, token);
        const origin = input?.origin;
        if (!origin || origin.provider !== 'amap' || typeof origin.placeId !== 'string' || !origin.placeId.trim() ||
            typeof origin.name !== 'string' || !origin.name.trim() || !require('./recommendation').valid(origin))
          fail(400, '请从高德搜索结果或当前位置中确认出发地');
        const a = M.act(activity, memberId, 'requirements', {
          origin: input.origin, modes: input.modes, mode: input.mode,
          preferences: input.preferences, preference: input.preference, preferenceDetail: input.preferenceDetail,
          budget: input.budget, budgetMin: input.budgetMin, budgetMax: input.budgetMax, shared: input.shared === true
        });
        update.run(JSON.stringify(a), id);
        return { activity: project(a, memberId) };
      });
    },
    async recommendLive(id, token, provider, input = { action: 'recommend' }) {
      const {activity,memberId}=authenticate(id,token);
      if(memberId!==activity.hostId) fail(403,'只有发起者可以推荐');
      if(activity.paused||['completed','cancelled'].includes(activity.status)) fail(409,'当前活动不能推荐');
      const participants = { ...activity, members: effectiveMembers(activity) };
      if (!M.ready(participants)) fail(400, '需要至少两位有效成员，且均已填写需求');
      M.act(participants, memberId, input.action, input.data || {});
      // Presence renewals do not change the inputs or workflow of a recommendation.
      const revision = value => JSON.stringify(value, (key, item) => key === 'lastActiveAt' ? undefined : item);
      const version = revision(participants);
      const signal=AbortSignal.timeout(300000);
      const bounded={search:(...args)=>provider.search(args[0],args[1],undefined,signal),route:(...args)=>provider.route(...args,signal)};
      const result=await require('./recommendation').recommend(participants,bounded);
      return withWrite(()=>{
        const current=authenticate(id,token);
        if(revision({ ...current.activity, members: effectiveMembers(current.activity) })!==version) fail(409,'活动已更新，请重新推荐');
        const a=M.act(current.activity,memberId,input.action,{...input.data,recommendation:result});
        update.run(JSON.stringify(a),id);
        return {activity:project(a,memberId)};
      });
    },
    authorizeLocation(token) {
      const guest = typeof token === 'string' && guestActivity.get(digest(token));
      if (guest) authenticate(guest.activity_id, token);
      else accountFor(token);
    },
    act(id, token, input) {
      const allowed = new Set(['requirements', 'recommend', 'request', 'review-request', 'reject-request', 'schedule', 'vote', 'finish', 'revote', 'pause', 'resume', 'cancel', 'transfer', 'remove', 'leave', 'rename', 'feeling', 'comment', 'delete-comment', 'delete-photo']);
      if (!input || !allowed.has(input.action)) fail(400, '不支持该操作');
      const data = input.data ?? {};
      if (typeof data !== 'object' || Array.isArray(data)) fail(400, '操作数据格式无效');
      if (['vote', 'request', 'finish', 'revote'].includes(input.action) &&
          (!Number.isSafeInteger(data.round) || data.round < 1)) fail(400, '请提交有效轮次');
      if (input.action === 'vote' && (typeof data.candidateId !== 'string' || !data.candidateId))
        fail(400, '请提交候选地点 ID');
      return withWrite(() => {
        const { activity, memberId } = authenticate(id, token);
        if (input.action === 'rename' && activity.members.find(m => m.id === memberId)?.identityType !== 'account')
          fail(403, '游客昵称在创建或加入活动时确定');
        if (input.action === 'transfer' && memberId === activity.hostId && !effectiveMembers(activity).some(m => m.id === data.id && m.id !== memberId))
          fail(409, '该成员当前不能接任，请重新选择');
        if(input.action==='recommend'||input.data?.recommendation) fail(400,'推荐数据只能由服务端生成');
        const now = Date.now();
        const eligible = ['finish', 'revote'].includes(input.action) ? effectiveMembers(activity, now) : activity.members;
        const a = M.act(activity, memberId, input.action, data, now, eligible);
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
      authenticate(id, token);
      if (!input || typeof input.id !== 'string' || !/^[a-f0-9-]{36}$/.test(input.id) ||
          typeof input.name !== 'string' || input.name.length > 100 ||
          !['image/jpeg', 'image/png', 'image/webp'].includes(input.mime) ||
          typeof input.base64 !== 'string' || input.base64.length > 11_200_000 ||
          !/^[A-Za-z0-9+/]+={0,2}$/.test(input.base64)) fail(400, '照片格式无效');
      const bytes = Buffer.from(input.base64, 'base64');
      if (!bytes.length || bytes.length > 8 * 1024 * 1024) fail(400, '照片不能超过 8 MB');
      if (!validPhotoContent(input.mime, bytes)) fail(400, '照片内容不完整或与文件类型不一致');
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
    replaceDemoAccount(input) {
      const { username, password } = accountInput(input);
      const marker = typeof input?.marker === 'string' ? input.marker : '';
      const entries = Array.isArray(input?.entries) ? input.entries : [];
      if (!marker || !entries.length) fail(400, '演示数据无效');
      return withWrite(() => {
        const existing = findAccount.get(username);
        if (existing) {
          const rows = db.prepare(`SELECT a.id, a.payload FROM account_memberships m
            JOIN activities a ON a.id = m.activity_id WHERE m.account_id = ?`).all(existing.id);
          if (!rows.length || rows.some(row => JSON.parse(row.payload).demoSeed !== marker))
            fail(409, '同名账号不是可替换的演示账号，已停止写入');
          for (const row of rows) {
            db.prepare('DELETE FROM photos WHERE activity_id = ?').run(row.id);
            db.prepare('DELETE FROM sessions WHERE activity_id = ?').run(row.id);
            db.prepare('DELETE FROM account_memberships WHERE activity_id = ?').run(row.id);
            db.prepare('DELETE FROM activities WHERE id = ?').run(row.id);
          }
          db.prepare('DELETE FROM account_sessions WHERE account_id = ?').run(existing.id);
          db.prepare('DELETE FROM accounts WHERE id = ?').run(existing.id);
        }

        const accountId = randomUUID(), salt = randomBytes(16).toString('hex');
        db.prepare('INSERT INTO accounts VALUES (?, ?, ?, ?)').run(
          accountId, username, salt, scryptSync(password, salt, 64).toString('hex')
        );
        const codes = new Set();
        for (const entry of entries) {
          const activity = M.migrate(entry?.activity);
          if (activity.demoSeed !== marker || !activity.members.some(member => member.id === entry.viewerId))
            fail(400, '演示活动身份无效');
          while (codes.has(activity.code) || findByCode.get(activity.code))
            activity.code = randomBytes(3).toString('hex').toUpperCase();
          codes.add(activity.code);
          insert.run(activity.id, activity.code, JSON.stringify(activity));
          db.prepare('INSERT INTO account_memberships VALUES (?, ?, ?)').run(accountId, activity.id, entry.viewerId);
        }
        return { username, activities: entries.length };
      });
    },
    close() { db.close(); }
  };
}
module.exports = { openStore };
