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
