'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createAmap } = require('../amap');
const { createServer } = require('../server');

test('Amap static map returns image bytes and keeps the key inside the provider request', async () => {
  let requested;
  const provider = createAmap({key:'server-only-key',fetchImpl:async url => {
    requested = new URL(url);
    return new Response(Uint8Array.from([137,80,78,71]),{status:200,headers:{'Content-Type':'image/png'}});
  }});
  const image = await provider.staticMap([
    {lng:121.4752,lat:31.2194,label:'1'},
    {lng:121.4505,lat:31.2237,label:'2'}
  ]);
  assert.equal(image.contentType,'image/png');
  assert.deepEqual([...image.body],[137,80,78,71]);
  assert.equal(requested.pathname,'/v3/staticmap');
  assert.equal(requested.searchParams.get('key'),'server-only-key');
  assert.equal(requested.searchParams.get('size'),'640*350');
  assert.equal(requested.searchParams.get('scale'),'2');
  assert.match(requested.searchParams.get('markers'),/^large,0x1F191A,1:/);
  assert.match(requested.searchParams.get('markers'),/\|large,0x1F191A,2:/);
  assert.match(requested.searchParams.get('markers'),/121\.475200,31\.219400/);
});

test('static map provider errors explain failures without exposing upstream secrets', async () => {
  for (const [infocode, expectedCode, message] of [
    ['10002', 'MAP_PROVIDER_ERROR', /静态地图错误 10002.*接口权限/],
    ['10005', 'MAP_PROVIDER_ERROR', /静态地图错误 10005.*IP 白名单/],
    ['10003', 'MAP_QUOTA_EXCEEDED', /今日地图调用配额已用尽/],
    ['10044', 'MAP_QUOTA_EXCEEDED', /静态地图错误 10044/],
    ['secret-key', 'MAP_PROVIDER_ERROR', /静态地图错误 UNKNOWN/]
  ]) {
    const provider = createAmap({key:'secret-key',fetchImpl:async () =>
      Response.json({status:'0',infocode,info:'upstream text with secret-key'})});
    await assert.rejects(provider.staticMap([{lng:121.47,lat:31.22}]), error => {
      assert.equal(error.code, expectedCode);
      assert.match(error.message, message);
      assert.doesNotMatch(error.message, /secret-key|upstream text/);
      return true;
    });
  }
});

test('static map endpoint returns useful errors and retries after provider recovery', async () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const token = 'a'.repeat(43);
  const activity = {id,groups:{fairness:['p1']},candidates:[{id:'p1',lng:121.47,lat:31.22}]};
  const store = {
    pruneExpiredGuests(){},
    get(requestedId,requestedToken){
      assert.equal(requestedId,id);
      assert.equal(requestedToken,token);
      return {activity};
    }
  };
  let calls = 0;
  const provider = createAmap({key:'server-only-key',fetchImpl:async () => {
    if (++calls === 1) return Response.json({status:'0',infocode:'10005'});
    return new Response(Uint8Array.from([137,80,78,71]),{headers:{'Content-Type':'image/png'}});
  }});
  const server = createServer(store,provider);
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve));
  const url = `http://127.0.0.1:${server.address().port}/api/activities/${id}/static-map?group=fairness`;
  const headers = {Authorization:`Bearer ${token}`};
  try {
    const failed = await fetch(url,{headers});
    assert.equal(failed.status,502);
    const failure = await failed.json();
    assert.equal(failure.code,'MAP_PROVIDER_ERROR');
    assert.match(failure.error,/静态地图错误 10005.*IP 白名单/);
    assert.doesNotMatch(JSON.stringify(failure),/server-only-key/);
    const recovered = await fetch(url,{headers});
    assert.equal(recovered.status,200);
    assert.equal(recovered.headers.get('content-type'),'image/png');
    assert.deepEqual([...new Uint8Array(await recovered.arrayBuffer())],[137,80,78,71]);
    assert.equal((await fetch(url,{headers})).status,200);
    assert.equal(calls,2,'failed requests must not block retries; recovered images should be cached');
  } finally { await new Promise(resolve => server.close(resolve)); }
});

test('authenticated static map endpoint selects the requested Top3 and reuses its cache', async () => {
  const id='11111111-1111-4111-8111-111111111111';
  const token='a'.repeat(43);
  const candidates=[
    {id:'p1',name:'甲',lng:121.47,lat:31.22},
    {id:'p2',name:'乙',lng:121.45,lat:31.23},
    {id:'p3',name:'丙',lng:121.49,lat:31.21}
  ];
  const activity={id,groups:{fairness:['p1','p2','p3'],preference:['p2','p1','p3'],convenience:['p3','p2','p1']},candidates,winningCandidateId:null};
  const store={
    pruneExpiredGuests(){},
    get(requestedId,requestedToken){
      if(requestedId!==id||requestedToken!==token){const error=Error('请先以活动成员身份加入');error.status=401;throw error;}
      return {activity};
    }
  };
  let calls=0,received;
  const provider={staticMap:async points=>{calls++;received=points;return {body:Buffer.from([137,80,78,71]),contentType:'image/png'};}};
  const server=createServer(store,provider);
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    const headers={Authorization:`Bearer ${token}`};
    const first=await fetch(`${base}/api/activities/${id}/static-map?group=preference`,{headers});
    const second=await fetch(`${base}/api/activities/${id}/static-map?group=preference`,{headers});
    assert.equal(first.status,200);
    assert.equal(first.headers.get('content-type'),'image/png');
    assert.deepEqual(received.map(point=>point.id),['p2','p1','p3']);
    assert.deepEqual(received.map(point=>point.label),['1','2','3']);
    assert.equal(calls,1);
    assert.equal(second.status,200);
    assert.equal((await fetch(`${base}/api/activities/${id}/static-map?group=unknown`,{headers})).status,400);
    assert.equal((await fetch(`${base}/api/activities/${id}/static-map?group=fairness`)).status,401);
  } finally { await new Promise(resolve=>server.close(resolve)); }
});
