'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {createAmap}=require('../amap');
const origin={lng:121.2,lat:31.2},destination={lng:121.3,lat:31.3};
const response=body=>({ok:true,status:200,json:async()=>body});
const poi=(id,cost)=>({id,name:'咖啡厅'+id,type:'餐饮服务;咖啡厅',location:'121.3,31.3',biz_ext:{cost}});
const routeBody={status:'1',route:{paths:[{duration:'600',distance:'1000'}]}};
function provider(options={}){return createAmap({key:crypto.randomUUID(),qps:20,...options});}

test('POI prices distinguish real zero from missing, whitespace, invalid and negative data',async()=>{
  const values=['25','0',[],null,undefined,'','  ','免费',-1,false,{}];
  const api=provider({fetchImpl:async()=>response({status:'1',pois:values.map((v,i)=>poi(String(i),v))})});
  const found=await api.search('咖啡');
  assert.deepEqual(found.map(p=>p.venueCost),[25,0,...Array(9).fill(null)]);
  assert.equal(found[0].venueCostSource,'amap.biz_ext.cost');
  assert.ok(found.slice(2).every(p=>p.venueCostStatus==='unknown'&&p.venueCostSource===null));
});

test('search cache uses full query, clones results, expires, and stays bounded',async()=>{
  let time=0,calls=0;
  const api=provider({now:()=>time,searchTtlMs:100,cacheMaxEntries:2,fetchImpl:async()=>{
    calls++;return response({status:'1',pois:[poi('p','25')]});
  }});
  const first=await api.search('咖啡',origin);first[0].name='changed';
  assert.equal((await api.search('咖啡',origin))[0].name,'咖啡厅p');assert.equal(calls,1);
  await api.search('咖啡',{...origin,lng:121.21});assert.equal(calls,2);
  await api.search('咖啡',origin,'北京');assert.equal(calls,3);
  await api.search('咖啡',origin);assert.equal(calls,4,'oldest entry was evicted');
  time=100;await api.search('咖啡',origin);assert.equal(calls,5,'expired entry refetched');
  await api.search('茶馆',origin);assert.equal(calls,6);
});

test('route cache separates endpoints, modes and cities and does not expose cached mutations',async()=>{
  let time=0,calls=0;
  const api=provider({now:()=>time,routeTtlMs:100,fetchImpl:async()=>{calls++;return response(routeBody);}});
  const first=await api.route(origin,destination,'步行');first.minutes=999;first.memberId='private';
  const second=await api.route(origin,destination,'步行');
  assert.equal(second.minutes,10);assert.equal(second.memberId,undefined);assert.equal(calls,1);
  await api.route(origin,destination,'驾车');
  await api.route({...origin,lng:121.21},destination,'步行');
  await api.route(origin,{...destination,lng:121.31},'步行');
  await api.route({...origin,city:'北京'},destination,'步行');assert.equal(calls,5);
  time=100;await api.route(origin,destination,'步行');assert.equal(calls,6);
});

test('failed and invalid routes are not cached; aborted callers cannot consume cache hits',async()=>{
  let calls=0;
  const api=provider({fetchImpl:async()=>response(++calls===1?{status:'1',route:{paths:[]}}:routeBody)});
  await assert.rejects(api.route(origin,destination,'步行'),{code:'ROUTES_UNAVAILABLE'});
  await api.route(origin,destination,'步行');assert.equal(calls,2);
  const c=new AbortController();c.abort();
  await assert.rejects(api.route(origin,destination,'步行',c.signal),{name:'AbortError'});
  await api.route(origin,destination,'步行');assert.equal(calls,2);
});

test('provider instances do not share cached data or failures',async()=>{
  let calls=0;
  const fetchImpl=async()=>{calls++;return response({status:'1',pois:[]});};
  await provider({fetchImpl}).search('咖啡');await provider({fetchImpl}).search('咖啡');
  assert.equal(calls,2);
  let failures=0;
  const bad=provider({fetchImpl:async()=>response(++failures===1?{status:'0',infocode:'10001'}:{status:'1',pois:[]})});
  await assert.rejects(bad.search('咖啡'),{code:'MAP_PROVIDER_ERROR'});
  await bad.search('咖啡');assert.equal(failures,2);
});

test('keyword searches overlap without losing keyword order or POI deduplication',async()=>{
  let release;
  const gate=new Promise(resolve=>release=resolve);
  const api=provider({fetchImpl:async url=>{
    const word=url.searchParams.get('keywords');
    if(word==='咖啡')await gate;else release();
    return response({status:'1',pois:[poi(word,'10'),poi('shared','10')]});
  }});
  const places=await api.search('咖啡|茶馆',origin,'上海',AbortSignal.timeout(3000));
  assert.deepEqual(places.map(p=>p.placeId),['咖啡','shared','茶馆']);
});

test('one caller cancellation does not cancel another request for the same route',async()=>{
  const c=new AbortController();let entered;
  const start=new Promise(resolve=>entered=resolve);
  let calls=0;
  const api=provider({fetchImpl:async(url,{signal})=>{
    if(++calls===1){entered();await new Promise((resolve,reject)=>{
      if(signal.aborted)reject(signal.reason);
      else signal.addEventListener('abort',()=>reject(signal.reason),{once:true});
    });}
    return response(routeBody);
  }});
  const first=api.route(origin,destination,'步行',c.signal);
  const rejected=assert.rejects(first,{code:'MAP_TIMEOUT'});
  await start;
  const second=api.route(origin,destination,'步行');c.abort();
  assert.equal((await second).minutes,10);await rejected;
});
