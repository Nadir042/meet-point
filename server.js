'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { openStore } = require('./shared-store');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };
const allowed = new Set(['index.html', 'styles.css', 'journal.css', 'layout.css', 'core.js', 'app.js', 'journal.js', 'media.js', 'assets/autumn.svg', 'assets/cafe.svg', 'assets/lake.svg']);
const sendJson = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
};
async function bodyJson(req, limit = 16_384) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) { const error = new Error('请求内容过大'); error.status = 413; throw error; }
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { const error = new Error('请求内容不是有效 JSON'); error.status = 400; throw error; }
}
function createServer(store = openStore()) {
  return http.createServer(async (req, res) => {
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html'; }
  catch { return sendJson(res, 400, { error: '无效地址' }); }
  if (name.startsWith('api/')) {
    try {
      store.pruneExpiredGuests();
      const token = /^Bearer ([A-Za-z0-9_-]+)$/.exec(req.headers.authorization || '')?.[1];
      if (name === 'api/account/register' && req.method === 'POST') return sendJson(res, 201, store.register(await bodyJson(req)));
      if (name === 'api/account/login' && req.method === 'POST') return sendJson(res, 200, store.login(await bodyJson(req)));
      if (name === 'api/account' && req.method === 'GET') return sendJson(res, 200, store.account(token));
      if (name === 'api/account/logout' && req.method === 'POST') return sendJson(res, 200, store.logout(token));
      if (name === 'api/account/activities' && req.method === 'GET') return sendJson(res, 200, store.listAccountActivities(token));
      if (name === 'api/activities' && req.method === 'POST') return sendJson(res, 201, store.create(await bodyJson(req), token));
      if (name === 'api/activities/join' && req.method === 'POST') return sendJson(res, 201, store.join(await bodyJson(req), token));
      const claim = /^api\/activities\/([0-9a-f-]{36})\/claim$/.exec(name);
      if (claim && req.method === 'POST') return sendJson(res, 200, store.claim(claim[1], token, (await bodyJson(req)).guestToken));
      const photo = /^api\/activities\/([0-9a-f-]{36})\/photos(?:\/([0-9a-f-]{36}))?$/.exec(name);
      if (photo && !photo[2] && req.method === 'POST') return sendJson(res, 201, store.uploadPhoto(photo[1], token, await bodyJson(req, 12_000_000)));
      if (photo && photo[2] && req.method === 'GET') {
        const record = store.photo(photo[1], token, photo[2]);
        res.writeHead(200, { 'Content-Type': record.mime, 'Content-Length': record.data.length, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
        return res.end(record.data);
      }
      const match = /^api\/activities\/([0-9a-f-]{36})(\/(requirements|actions))?$/.exec(name);
      if (match && !match[2] && req.method === 'GET') return sendJson(res, 200, store.get(match[1], token));
      if (match && match[3] === 'requirements' && req.method === 'PUT') return sendJson(res, 200, store.requirements(match[1], token, await bodyJson(req)));
      if (match && match[3] === 'actions' && req.method === 'POST') return sendJson(res, 200, store.act(match[1], token, await bodyJson(req)));
      return sendJson(res, 404, { error: '接口不存在' });
    } catch (error) { return sendJson(res, error.status || 400, { error: error.message }); }
  }
  if (!allowed.has(name)) { res.writeHead(404); return res.end('Not found'); }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  fs.readFile(path.join(__dirname, name), (error, data) => {
    if (error) { res.writeHead(500); return res.end('Unable to read file'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(name)], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});
}
if (require.main === module) {
  const server = createServer();
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`MeetPoint: http://${host}:${port}`));
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已占用，请设置 PORT 后重试。` : error.message); process.exitCode = 1; });
}
module.exports = { createServer };
