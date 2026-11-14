'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { openStore } = require('./shared-store');
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png' };
const allowed = new Set(['index.html', 'styles.css', 'journal.css', 'layout.css', 'core.js', 'app.js', 'journal.js', 'media.js', 'assets/autumn.svg', 'assets/cafe.svg', 'assets/lake.svg', 'assets/landing-people.png', 'assets/landing-routes.png', 'assets/landing-routes-complete.png', 'assets/landing-vote.png', 'assets/landing-vote-orange.png', 'assets/landing-vote-black.png', 'assets/landing-city-paris.png', 'assets/landing-city-sydney.png', 'assets/workspace-graduate.png', 'assets/workspace-idea.png', 'assets/workspace-ticket.png', 'assets/calendar-companion.png', 'assets/members-meeting.png', 'assets/recommend-companion.png', 'assets/feedback-idea.png']);
const sendJson = (res, status, body) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
  res.end(JSON.stringify(body));
};
const sendSuccess = (res, status, data, message) => sendJson(res, status, { success: true, ...(message ? { message } : {}), data });
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
function createServer(store = openStore(), mapProvider = require('./amap').createAmap()) {
  mapProvider = require('./map-mock').withMapFaults(mapProvider);
  const staticMapCache = new Map();
  const server = http.createServer(async (req, res) => {
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).slice(1) || 'index.html'; }
  catch { return sendJson(res, 400, { error: '无效地址' }); }
  if (name.startsWith('api/')) {
    try {
      store.pruneExpiredGuests();
      const token = /^Bearer ([A-Za-z0-9_-]+)$/.exec(req.headers.authorization || '')?.[1];
      if(name==='api/locations/search'||name==='api/locations/reverse'){
        const q=new URL(req.url,'http://localhost').searchParams;
        store.authorizeLocation(token);
        if(name.endsWith('search')){
          const keyword=q.get('keyword')?.trim();
          if(!keyword||keyword.length>80){const error=Error('请输入 1—80 个字符的搜索词');error.status=400;throw error;}
          return sendSuccess(res,200,{items:(await mapProvider.search(keyword,null,q.get('city')||'上海')).slice(0,10)});
        }
        const rawLng=q.get('lng'),rawLat=q.get('lat'),lng=Number(rawLng),lat=Number(rawLat);
        if(!rawLng?.trim()||!rawLat?.trim()||!require('./recommendation').valid({lng,lat})){const error=Error('坐标无效');error.status=400;throw error;}
        return sendSuccess(res,200,await mapProvider.reverse(lng,lat));
      }
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
      const staticMap = /^api\/activities\/([0-9a-f-]{36})\/static-map$/.exec(name);
      if (staticMap && req.method === 'GET') {
        const group = new URL(req.url, 'http://localhost').searchParams.get('group') || 'fairness';
        if (!['fairness', 'preference', 'convenience'].includes(group)) { const error = new Error('推荐分组无效'); error.status = 400; throw error; }
        const activity = store.get(staticMap[1], token).activity;
        let ids = [...(activity.groups[group] || [])].slice(0, 3);
        if (activity.winningCandidateId && !ids.includes(activity.winningCandidateId)) ids = [activity.winningCandidateId, ...ids].slice(0, 3);
        const points = ids.map(id => activity.candidates.find(candidate => candidate.id === id)).filter(candidate => candidate && Number.isFinite(candidate.lng) && Number.isFinite(candidate.lat));
        if (!points.length) { const error = new Error('暂无可展示的候选地点'); error.status = 404; throw error; }
        if (typeof mapProvider.staticMap !== 'function') { const error = new Error('地图图片服务尚未配置'); error.status = 503; throw error; }
        const cacheKey = JSON.stringify(['static-map-v3', ...points.map(point => [point.id, point.lng, point.lat])]);
        let entry = staticMapCache.get(cacheKey);
        if (!entry || entry.expiresAt <= Date.now()) {
          const request = mapProvider.staticMap(points.map((point, index) => ({...point,label:String(index + 1)})));
          entry = {request,expiresAt:Date.now()+5*60*1000};
          staticMapCache.set(cacheKey,entry);
          if (staticMapCache.size > 100) staticMapCache.delete(staticMapCache.keys().next().value);
        }
        let image;
        try { image = entry.image || await entry.request; entry.image = image; }
        catch (error) { staticMapCache.delete(cacheKey); throw error; }
        res.writeHead(200, { 'Content-Type': image.contentType, 'Content-Length': image.body.length, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' });
        return res.end(image.body);
      }
      const match = /^api\/activities\/([0-9a-f-]{36})(\/(requirements|actions|vote-history))?$/.exec(name);
      if (match && !match[2] && req.method === 'GET') return sendJson(res, 200, { success: true, data: store.get(match[1], token) });
      if (match && match[3] === 'vote-history' && req.method === 'GET')
        return sendJson(res, 200, { success: true, data: store.history(match[1], token) });
      if (match && match[3] === 'requirements' && req.method === 'PUT') return sendSuccess(res, 200, store.requirements(match[1], token, await bodyJson(req)), '出行需求已保存');
      if (match && match[3] === 'actions' && req.method === 'POST') {
        const input = await bodyJson(req);
        const generate = input.action === 'recommend' || (input.action === 'review-request' && input.data?.decision === 'approved');
        const data = generate ? await store.recommendLive(match[1], token, mapProvider, input) : store.act(match[1], token, input);
        return sendJson(res, 200, { success: true, data });
      }
      return sendJson(res, 404, { error: '接口不存在' });
    } catch (error) {
      const status = error.status || ({ MAP_TIMEOUT: 504, MAP_QUOTA_EXCEEDED: 429, MAP_PROVIDER_ERROR: 502 }[error.code]) || 400;
      if (/^api\/locations\/(?:search|reverse)$/.test(name) || /^api\/activities\/[^/]+(?:\/(?:requirements|actions|vote-history))?$/.test(name)) {
        const code = error.code || ({ 401: 'UNAUTHORIZED', 403: 'NOT_ACTIVITY_MEMBER', 404: 'ACTIVITY_NOT_FOUND' })[status] || 'INVALID_REQUEST';
        return sendJson(res, status, { success: false, error: { code, message: error.message, retryable: !!error.retryable } });
      }
      return sendJson(res, status, { error: error.message, ...(error.code ? { code: error.code, retryable: !!error.retryable } : {}) });
    }
  }
  if (!allowed.has(name)) { res.writeHead(404); return res.end('Not found'); }
  if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405); return res.end(); }
  fs.readFile(path.join(__dirname, name), (error, data) => {
    if (error) { res.writeHead(500); return res.end('Unable to read file'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(name)], 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  });
});
  let timer;
  server.on('listening', () => {
    const settle = () => {
      try { store.settleExpiredRounds?.(); }
      catch (error) { console.error('轮次计票失败', error.message); }
    };
    settle();
    timer = setInterval(settle, 1000).unref();
  });
  server.on('close', () => clearInterval(timer));
  return server;
}
if (require.main === module) {
  const server = createServer();
  const port = Number(process.env.PORT) || 3000;
  const host = process.env.HOST || '127.0.0.1';
  server.listen(port, host, () => console.log(`MeetPoint: http://${host}:${port}`));
  server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已占用，请设置 PORT 后重试。` : error.message); process.exitCode = 1; });
}
module.exports = { createServer };
