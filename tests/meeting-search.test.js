'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {recommend}=require('../recommendation');
const a={type:'线下会面',round:0,members:Array.from({length:4},(_,i)=>({id:String(i),origin:{lng:121.21,lat:31.28},mode:'步行',preference:'学习讨论'}))};
const p={placeId:'P',name:'咖啡馆',category:'餐饮服务;咖啡厅',lng:121.21,lat:31.28};
const route=async()=>({minutes:10,distanceMeters:500,cost:null,costStatus:'not_applicable'});
test('four same-area members search venue terms instead of meeting intent',async()=>{let keyword;const r=await recommend(a,{search:async k=>{keyword=k;return [p]},route});assert.equal(keyword,'咖啡厅|图书馆');assert.equal(r.candidates.length,1);assert.equal(r.candidates[0].routes.length,4);});
test('filtered empty preference search falls back to activity categories',async()=>{const calls=[];const r=await recommend({...a,members:a.members.map(m=>({...m,preference:'特别偏好'}))},{search:async k=>{calls.push(k);return calls.length===1?[]:[p]},route});assert.equal(calls.length,2);assert.equal(r.candidates.length,1);assert.ok(r.warnings.some(w=>w.includes('扩大搜索')));});

test('nine identical origins reuse routes but preserve nine member records',async()=>{let count=0;const nine={...a,members:Array.from({length:9},(_,i)=>({...a.members[0],id:String(i)}))};const r=await recommend(nine,{search:async()=>[p],route:async()=>{count++;return route();}});assert.equal(count,1);assert.equal(r.candidates[0].routes.length,9);});
test('provider spaces requests and retries rate-limit errors',async()=>{const {createAmap}=require('../amap');const starts=[];let count=0;const api=createAmap({key:'rate-test',qps:10,fetchImpl:async()=>{starts.push(Date.now());return {ok:true,status:200,json:async()=>++count===1?{status:'0',infocode:'10021'}:{status:'1',pois:[]}};}});await Promise.all([api.search('a'),api.search('b')]);assert.equal(count,3);assert.ok(starts[1]-starts[0]>=100);});

test('around search sends one keyword per request and merges POI IDs',async()=>{
 const {createAmap}=require('../amap');const words=[];
 const api=createAmap({key:'single-keyword-test',qps:20,fetchImpl:async url=>{
   const term=url.searchParams.get('keywords');words.push(term);assert.ok(!term.includes('|'));
   return {ok:true,status:200,json:async()=>({status:'1',pois:[{id:'same',name:'咖啡馆',type:'餐饮服务;咖啡厅',location:'121.21,31.28'}]})};
 }});
 const result=await api.search('咖啡厅|茶馆',{lng:121.21,lat:31.28});assert.deepEqual(words,['咖啡厅','茶馆']);assert.equal(result.length,1);
});
test('friends meeting preference maps to venues, not intent text',async()=>{
 let k;await recommend({...a,members:a.members.map(m=>({...m,preference:'朋友会面'}))},{search:async word=>{k=word;return [p]},route});assert.equal(k,'咖啡厅|茶馆');
});

test('custom venue keywords and presets both reach AMap, with per-person prices preserved',async()=>{
 const {createAmap}=require('../amap');
 const words=[];
 const api=createAmap({key:'custom-venue-test',qps:20,fetchImpl:async url=>{
   const term=url.searchParams.get('keywords');
   words.push(term);
   const book={id:'book',name:'社区书店',type:'购物服务;专卖店;书店',location:'121.21,31.28',biz_ext:{cost:[]}};
   const cafe={id:'cafe',name:'社区咖啡厅',type:'餐饮服务;咖啡厅',location:'121.21,31.28',biz_ext:{cost:'50.50'}};
   return {ok:true,status:200,json:async()=>({status:'1',pois:term==='书店'?[book]:[cafe]})};
 }});
 const members=a.members.map(m=>({...m,preferences:['学习讨论','安静的书店'],preferenceSelections:['学习讨论','其他'],preferenceDetail:'安静的书店'}));
 const result=await recommend({...a,members},{search:api.search,route});
 assert.deepEqual(words,['书店','咖啡厅','图书馆']);
 assert.deepEqual(Object.fromEntries(result.candidates.map(place=>[place.placeId,place.pricePerPerson])),{book:null,cafe:50.5});
});

test('budget filters known venue prices at inclusive endpoints and retains unknown prices',async()=>{
 const members=[{...a.members[0],budgetMin:50,budgetMax:175},{...a.members[1],budget:150}];
 const places=[49.99,50,150,150.01,null].map((price,index)=>({...p,placeId:String(index),name:'咖啡馆'+index,lng:p.lng+index*0.001,pricePerPerson:price}));
 const routed=[];
 const result=await recommend({...a,members},{search:async()=>places,route:async(o,place)=>{
   routed.push(place.placeId);
   return {...await route(),cost:200,costStatus:'known'};
 }});
 assert.deepEqual([...new Set(routed)].sort(),['1','2','4']);
 assert.deepEqual(result.candidates.map(place=>place.pricePerPerson).sort((x,y)=>x-y),[null,50,150]);
});
