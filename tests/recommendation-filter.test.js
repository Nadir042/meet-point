'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {recommend}=require('../recommendation');
const {createAmap}=require('../amap');
const {matches,searchTerms,suitable}=require('../place-policy');
const M=require('../core');
const member=(id,budget=100,preferences=['咖啡甜品'])=>({id,budget,preferences,origin:{lng:121.2,lat:31.2},modes:['步行']});
const activity=(members=[member('a'),member('b')],type='聚餐')=>({members,type,round:0});
const place=(placeId,cost=50,name='咖啡厅')=>({placeId,name:name+placeId,category:'餐饮服务;咖啡厅',lng:121.2,lat:31.2,venueCost:cost,venueCostStatus:cost===null?'unknown':'known'});
const route=async()=>({minutes:10,distanceMeters:500,cost:99,costStatus:'known'});

test('known venue prices respect each budget including equality and zero, excluding transport fares',async()=>{
  const queried=[];
  const result=await recommend(activity([member('a',50),member('b',100)]),{
    search:async()=>[place('boundary',50),place('over',51),place('zero',0),place('unknown',null)].map((p,i)=>({...p,lng:121.2+i*0.001})),
    route:async(o,p)=>{queried.push(p.placeId);return route();}
  });
  assert.deepEqual(new Set(queried),new Set(['boundary','zero','unknown']));
  assert.ok(result.candidates.some(p=>p.placeId==='boundary'&&p.budgetStatus==='within'));
  const unknown=result.candidates.find(p=>p.placeId==='unknown');
  assert.equal(unknown.venueCost,null);assert.equal(unknown.budgetStatus,'unknown');
  assert.ok(unknown.reasons.some(s=>s.includes('无法确认')));
  assert.ok(result.warnings.some(s=>s.includes('超出')));
  const zero=await recommend(activity([member('a',0),member('b',0)]),{search:async()=>[place('free',0),place('paid',1)],route});
  assert.deepEqual(zero.candidates.map(p=>p.placeId),['free']);
});

test('all over-budget candidates fail before route queries and do not mutate the activity',async()=>{
  const a=activity();a.votes={a:'old'};a.round=2;a.deadline=123;
  const before=structuredClone(a);
  await assert.rejects(recommend(a,{search:async()=>[place('expensive',101)],route:async()=>assert.fail('no route expected')}),{code:'NO_CANDIDATES'});
  assert.deepEqual(a,before);
});

test('unknown prices keep original scoring; absent legacy budgets do not claim verified affordability',async()=>{
  const a=activity();delete a.members[0].budget;
  const r=await recommend(a,{search:async()=>[place('known'),place('unknown',null)],route});
  assert.equal(r.candidates.find(p=>p.placeId==='known').budgetStatus,'unverified');
  assert.equal(r.candidates[0].score,r.candidates[1].score);
});

test('changing preference changes shortlisted categories and reasons; multi-select preserves both',async()=>{
  const coffee=place('coffee');
  const hotpot={...place('hotpot',50,'火锅'),category:'餐饮服务;火锅店'};
  const provider={search:async()=>[coffee,hotpot],route};
  const hot=await recommend(activity([member('a',100,['火锅']),member('b',100,['火锅'])]),provider);
  assert.deepEqual(hot.candidates.map(p=>p.placeId),['hotpot']);
  assert.ok(hot.candidates[0].reasons.some(s=>s.includes('匹配偏好：火锅')));
  const both=await recommend(activity([member('a',100,['火锅','咖啡甜品']),member('b')]),provider);
  assert.equal(both.candidates.length,2);
  const any=await recommend(activity([member('a',100,['不限']),member('b',100,['火锅'])]),provider);
  assert.equal(any.candidates.length,2);
});

test('custom preference fallback is explicit and never fabricates semantic matches',async()=>{
  const r=await recommend(activity([member('a',100,['可以带宠物']),member('b',100,['可以带宠物'])]),{search:async()=>[place('coffee')],route});
  assert.ok(r.warnings.some(s=>s.includes('不保证满足原偏好')));
  assert.ok(!r.candidates[0].reasons.some(s=>s.includes('匹配偏好：可以带宠物')));
});

test('shortlist reserves minority preferences rather than spending every route request on nearer cafes',async()=>{
  const cafes=Array.from({length:11},(_,i)=>({...place('c'+i),lng:121.2+i*0.0001}));
  const hotpot={...place('hot',50,'火锅'),lng:121.21,category:'餐饮服务;火锅店'};
  const queried=new Set();
  await recommend(activity([member('a',100,['咖啡甜品','火锅']),member('b')]),{search:async()=>[...cafes,hotpot],route:async(o,p)=>{queried.add(p.placeId);return route();}});
  assert.equal(queried.size,10);assert.ok(queried.has('hot'));
});

test('all selectable specific preferences have usable search terms and matching representative venues',()=>{
  for(const [type,options] of Object.entries(M.OPTIONS))for(const preference of options.filter(s=>!['不限','其他'].includes(s))){
    assert.ok(searchTerms(preference).length);
    const term=searchTerms(preference)[0];
    const p={name:term,category:term};
    assert.ok(matches(p,preference),type+': '+preference);
    assert.ok(suitable(p,type),type+': '+term);
  }
  assert.ok(matches({name:'XX影城',category:'电影院'},'电影院'));
  assert.ok(matches({name:'购物中心',category:'购物服务'},'逛街'));
  assert.ok(!suitable({name:'火锅地铁站',category:'交通设施服务',typecode:'150500'},'聚餐'));
});

test('cached provider data is re-filtered for new budgets and retains member privacy',async()=>{
  let calls=0;
  const provider=createAmap({key:'filter-cache-test',qps:20,fetchImpl:async url=>{
    calls++;
    return {ok:true,status:200,json:async()=>url.pathname.includes('/place/')?{
      status:'1',pois:[{id:'P',name:'咖啡厅',type:'餐饮服务;咖啡厅',location:'121.2,31.2',biz_ext:{cost:'50'}}]
    }:{status:'1',route:{paths:[{duration:'600',distance:'1000'}]}}};
  }});
  const a=activity();const first=await recommend(a,provider);const count=calls;
  a.round=1;a.members=a.members.map((m,i)=>({...m,id:'new'+i}));
  const second=await recommend(a,provider);
  assert.equal(calls,count);assert.equal(second.round,2);
  assert.notEqual(first.candidates[0].id,second.candidates[0].id);
  assert.deepEqual(second.candidates[0].routes.map(r=>r.memberId),['new0','new1']);
  a.members[0].budget=49;
  await assert.rejects(recommend(a,provider),{code:'NO_CANDIDATES'});assert.equal(calls,count);
});

test('budget rejection during approval preserves votes, candidates, deadline and pending request',async()=>{
  const {openStore}=require('../shared-store');
  const store=openStore(':memory:');
  try{
    const host=store.register({username:'budget_host',password:'password-123'}).token;
    const guest=store.register({username:'budget_member',password:'password-123'}).token;
    const created=store.create({title:'预算回归',nickname:'发起者',type:'聚餐',date:M.dateKey(),time:'18:00'},host).activity;
    const id=created.id;
    store.join({code:created.code,nickname:'成员'},guest);
    const input={origin:{provider:'amap',placeId:'O',name:'出发地',lng:121.2,lat:31.2},mode:'步行',preference:'咖啡甜品',budget:100,shared:false};
    store.requirements(id,host,input);store.requirements(id,guest,input);
    const provider={search:async()=>[place('P',50)],route};
    const first=(await store.recommendLive(id,host,provider)).activity;
    store.act(id,guest,{action:'vote',data:{round:1,candidateId:first.candidates[0].id}});
    const requested=store.act(id,guest,{action:'request',data:{round:1,reason:'调整预算'}}).activity;
    const approval={action:'review-request',data:{requestId:requested.requests[0].id,decision:'approved'}};
    store.requirements(id,guest,{...input,budget:49});
    const before=store.get(id,host).activity;
    await assert.rejects(store.recommendLive(id,host,provider,approval),{code:'NO_CANDIDATES'});
    const after=store.get(id,host).activity;
    for(const field of ['round','candidates','votes','deadline','requests','voteStatus'])assert.deepEqual(after[field],before[field]);
    store.requirements(id,guest,{...input,budget:50});
    const approved=(await store.recommendLive(id,host,provider,approval)).activity;
    assert.equal(approved.round,2);assert.equal(approved.voteStatus.votedMembers,0);
    assert.ok(store.get(id,host).activity.candidates.every(p=>p.routes.every(r=>r.memberId===approved.viewerId)));
  }finally{store.close();}
});
