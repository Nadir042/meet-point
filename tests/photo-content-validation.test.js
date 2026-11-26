'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { randomUUID } = require('node:crypto');
const { openStore } = require('../shared-store');

const png = fs.readFileSync(path.join(__dirname, '..', 'assets', 'workspace-graduate.png'));
const jpeg = Buffer.from([
  0xff, 0xd8,
  0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01, 0x00, 0x01, 0x01, 0x01, 0x11, 0x00,
  0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
  0x00, 0xff, 0xd9
]);
const webp = (() => {
  const chunk = Buffer.concat([Buffer.from('VP8L'), Buffer.from([5, 0, 0, 0]), Buffer.from([0x2f, 0, 0, 0, 0]), Buffer.alloc(1)]);
  const bytes = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBP'), chunk]);
  bytes.writeUInt32LE(bytes.length - 8, 4);
  return bytes;
})();

function setup() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'meetpoint-photo-validation-'));
  const filename = path.join(directory, 'test.sqlite');
  const store = openStore(filename);
  const session = store.register({ username: `photo_${randomUUID().replaceAll('-', '').slice(0, 12)}`, password: 'test-password-123' });
  const created = store.create({ title: '照片校验', nickname: '上传者', type: '聚餐', date: '2026-11-26', time: '18:30' }, session.token);
  return { filename, store, token: session.token, activityId: created.activity.id };
}

function input(mime, bytes) {
  const extension = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }[mime];
  return { id: randomUUID(), name: `photo.${extension}`, mime, base64: bytes.toString('base64') };
}

test('complete PNG, JPEG and WebP structures are accepted', () => {
  const { store, token, activityId } = setup();
  store.uploadPhoto(activityId, token, input('image/png', png));
  store.uploadPhoto(activityId, token, input('image/jpeg', jpeg));
  const result = store.uploadPhoto(activityId, token, input('image/webp', webp));
  assert.equal(result.activity.journal.photos.length, 3);
});

test('truncated and MIME-disguised images are rejected without stored residue', () => {
  const { filename, store, token, activityId } = setup();
  const attempts = [
    input('image/png', png.subarray(0, 8)),
    input('image/jpeg', jpeg.subarray(0, -2)),
    input('image/webp', webp.subarray(0, -2)),
    input('image/jpeg', png)
  ];
  for (const attempt of attempts) assert.throws(() => store.uploadPhoto(activityId, token, attempt), { status: 400 });
  assert.deepEqual(store.get(activityId, token).activity.journal.photos, []);
  const db = new DatabaseSync(filename, { readOnly: true });
  try { assert.equal(db.prepare('SELECT COUNT(*) AS count FROM photos').get().count, 0); }
  finally { db.close(); }
});
