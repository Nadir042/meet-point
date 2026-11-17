'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {recommend}=require('../recommendation');
const modes=['公共交通','驾车','步行','骑行'];
const place={placeId:'P',name:'咖啡馆',category:'餐饮服务;咖啡厅',lng:121.2,lat:31.28};
const member=(id,chosen=modes)=>({id,origin:{lng:121.2,lat:31.28},modes:chosen,preferences:['学习讨论','工作交流']});
const activity=(members)=>({type:'线下会面',round:0,members});
const minutes={'公共交通':30,'驾车':10,'步行':60,'骑行':20};
const route=async(o,p,mode)=>({minutes:minutes[mode],distanceMeters:1000,cost:mode==='公共交通'?4:null,costStatus:mode==='公共交通'?'known':mode==='驾车'?'unknown':'not_applicable'});
for(let mask=1;mask<16;mask++){
 const chosen=modes.filter((_,i)=>mask&(1<<i));
 test('fastest route and corresponding fare: '+chosen.join(','),async()=>{
  const r=await recommend(activity([member('a',chosen),member('b',chosen)]),{search:async()=>[place],route});
  const expected=[...chosen].sort((a,b)=>minutes[a]-minutes[b])[0];
  for(const record of r.candidates[0].routes){assert.equal(record.mode,expected);assert.equal(record.minutes,minutes[expected]);assert.equal(record.cost,expected==='公共交通'?4:null);}
 });
}
test('nine members, all modes, reuse identical route requests',async()=>{let count=0;let keyword;const r=await recommend(activity(Array.from({length:9},(_,i)=>member(String(i)))),{search:async k=>{keyword=k;return [place]},route:async(...args)=>{count++;return route(...args)}});assert.equal(count,4);assert.equal(r.candidates[0].routes.length,9);assert.ok(!keyword.includes('学习讨论'));});
test('one mode failure retains another valid mode',async()=>{const r=await recommend(activity([member('a'),member('b')]),{search:async()=>[place],route:async(...args)=>{if(args[2]==='驾车')throw Error('no route');return route(...args)}});assert.equal(r.candidates[0].routes[0].mode,'骑行');});
test('legacy single mode/preferences remain supported',async()=>{const r=await recommend(activity(['a','b'].map(id=>({id,origin:member(id).origin,mode:'步行',preference:'朋友会面'}))),{search:async()=>[place],route});assert.equal(r.candidates[0].routes[0].mode,'步行');});
test('custom preference without match falls back to suitable meeting venue',async()=>{let calls=0;const r=await recommend(activity([member('a'),{...member('b'),preferences:['需要安静插座']}]),{search:async()=>++calls===1?[]:[place],route});assert.equal(calls,2);assert.equal(r.candidates.length,1);});
test('all route failures preserve meaningful rate limit code',async()=>{await assert.rejects(recommend(activity([member('a'),member('b')]),{search:async()=>[place],route:async()=>{throw Object.assign(Error('rate'),{code:'MAP_RATE_LIMITED'})}}),{code:'MAP_RATE_LIMITED'});});

test('nine distinct origins, ten places and all four modes complete with <=5 route jobs',async()=>{
 let count=0,running=0,max=0;
 const members=Array.from({length:9},(_,i)=>({...member(String(i)),origin:{lng:121.2+i*0.001,lat:31.28}}));
 const places=Array.from({length:10},(_,i)=>({...place,placeId:'P'+i,lng:121.3+i*0.001,name:'咖啡馆'+i}));
 const result=await recommend(activity(members),{search:async()=>places,route:async(...args)=>{count++;max=Math.max(max,++running);await new Promise(r=>setTimeout(r,1));running--;return route(...args);}});
 assert.equal(count,360);assert.ok(max<=5);assert.ok(result.candidates.length>0);assert.ok(result.candidates.every(p=>p.routes.length===9));
});
