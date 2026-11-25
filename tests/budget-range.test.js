'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const M=require('../core');
const {recommend}=require('../recommendation');
const {openStore}=require('../shared-store');
const {createServer}=require('../server');
const origin={provider:'amap',placeId:'O',name:'出发地',lng:121.2,lat:31.2};
const member=(id,min,max)=>({id,origin:{...origin},mode:'步行',preference:'咖啡甜品',budgetMin:min,budgetMax:max});
const activity=(a=[80,150],b=[100,120])=>({type:'聚餐',round:0,members:[member('a',...a),member('b',...b)]});
const place=(cost,i)=>({placeId:String(i),name:'咖啡厅'+i,category:'餐饮服务;咖啡厅',lng:121.3+i*.001,lat:31.2,venueCost:cost,venueCostStatus:cost===null?'unknown':'known'});
const route=async(o,p)=>({minutes:p.venueCost===null?1:30,distanceMeters:500,cost:null,costStatus:'not_applicable'});

test('budget range validation accepts boundaries and rejects negative, reversed, missing and non-numeric bounds',()=>{
  for(const [min,max] of [[0,0],[0,5000],[5000,5000],[40.5,100.25]])assert.equal(M.budgetRangeError(min,max),'');
  for(const [min,max] of [[-1,100],[100,99],[0,5001],[NaN,100],[0,Infinity],['0',100],[null,100],[0,undefined]])assert.ok(M.budgetRangeError(min,max));
  assert.deepEqual(M.memberBudget({budget:80}),{min:0,max:80});
  assert.equal(M.memberBudget({budget:80,budgetMin:20}),null,'partial range must not fall back silently');
});

test('legacy activities migrate to 0-upper without losing members, votes or saved needs',()=>{
  const old=M.seed(Date.now());
  const before=structuredClone(old);
  old.members.forEach(m=>{delete m.budgetMin;delete m.budgetMax;});
  const migrated=M.migrate(old);
  for(const m of migrated.members){assert.equal(m.budgetMin,0);assert.equal(m.budgetMax,m.budget);}
  assert.deepEqual(migrated.votes,before.votes);
  assert.deepEqual(migrated.members.map(m=>m.id),before.members.map(m=>m.id));
});

test('recommendations respect the intersection, including lower/upper endpoints, and prefer verified prices',async()=>{
  const seen=[];
  const result=await recommend(activity(),{search:async()=>[40,99,100,120,121,160,null].map(place),route:async(o,p)=>{seen.push(p.venueCost);return route(o,p);}});
  assert.deepEqual(new Set(seen),new Set([100,120,null]));
  assert.deepEqual(result.candidates.map(p=>p.venueCost),[100,120,null]);
  for(const ids of Object.values(result.groups))assert.equal(result.candidates.find(p=>p.id===ids[0]).budgetStatus,'within');
  assert.ok(result.candidates.find(p=>p.venueCost===null).reasons.some(r=>r.includes('无法确认')));
  assert.ok(result.candidates[0].reasons.some(r=>r.includes('预算区间内')));
});

test('disjoint budgets reject before any map calls and leave activity unchanged',async()=>{
  const a=activity([0,50],[80,100]);a.round=3;a.votes={a:'old'};
  const before=structuredClone(a);
  await assert.rejects(recommend(a,{search:async()=>assert.fail('must not search'),route}),{code:'BUDGET_CONFLICT'});
  assert.deepEqual(a,before);
});

test('touching ranges allow the common endpoint; every below-minimum venue is rejected',async()=>{
  const r=await recommend(activity([50,100],[100,200]),{search:async()=>[99,100,101].map(place),route});
  assert.deepEqual(r.candidates.map(p=>p.venueCost),[100]);
  await assert.rejects(recommend(activity([100,200],[100,200]),{search:async()=>[40,80].map(place),route}),{code:'NO_CANDIDATES'});
});

test('invalid direct recommendation range is rejected rather than interpreted as unknown budget',async()=>{
  for(const range of [[-1,50],[100,50],[null,50]])await assert.rejects(recommend(activity(range,[0,100]),{search:async()=>assert.fail(),route}),{code:'INVALID_BUDGET'});
});

test('HTTP saves ranges, survives re-login, rejects invalid requests atomically and still accepts old budget clients',async()=>{
  const store=openStore(':memory:'),server=createServer(store,{search:async()=>[],route});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const credentials={username:'range_test',password:'password-123'};
  const token=store.register(credentials).token;
  const a=store.create({title:'区间保存',nickname:'成员',type:'聚餐',date:M.dateKey(),time:'18:00'},token).activity;
  const input={origin,mode:'步行',preference:'咖啡甜品',shared:false};
  const put=async data=>{
    const response=await fetch(base+'/api/activities/'+a.id+'/requirements',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({...input,...data})});
    return {status:response.status,body:await response.json()};
  };
  try{
    for(const [min,max] of [[0,0],[40.5,100.25],[5000,5000]]){
      const result=await put({budgetMin:min,budgetMax:max});assert.equal(result.status,200);
      const self=result.body.data.activity.members[0];
      assert.equal(self.budgetMin,min);assert.equal(self.budgetMax,max);assert.equal(self.budget,max);
    }
    const before=store.get(a.id,token).activity;
    for(const data of [{budgetMin:-1,budgetMax:100},{budgetMin:100,budgetMax:50},{budgetMin:0,budgetMax:5001},{budgetMin:0},{budgetMax:100},{budgetMin:'',budgetMax:100},{budgetMin:'20',budgetMax:100},{budgetMin:null,budgetMax:100}]){
      const result=await put(data);assert.equal(result.status,400,JSON.stringify(data));assert.equal(result.body.error.code,'INVALID_BUDGET');
      assert.deepEqual(store.get(a.id,token).activity,before);
    }
    const again=store.login(credentials).token;
    assert.equal(store.get(a.id,again).activity.members[0].budgetMin,5000);
    assert.equal((await put({budget:80})).status,200);
    const legacy=store.get(a.id,token).activity.members[0];assert.equal(legacy.budgetMin,0);assert.equal(legacy.budgetMax,80);
  }finally{await new Promise(resolve=>server.close(resolve));store.close();}
});

test('disjoint budgets during approval retain original round and pending request',async()=>{
  const store=openStore(':memory:');
  try{
    const host=store.register({username:'range_host',password:'password-123'}).token;
    const other=store.register({username:'range_other',password:'password-123'}).token;
    const a=store.create({title:'区间审批',nickname:'发起者',type:'聚餐',date:M.dateKey(),time:'18:00'},host).activity;
    store.join({code:a.code,nickname:'成员'},other);
    const input={origin,mode:'步行',preference:'咖啡甜品',budgetMin:50,budgetMax:100,shared:false};
    store.requirements(a.id,host,input);store.requirements(a.id,other,input);
    const provider={search:async()=>[place(80,0)],route};
    const first=(await store.recommendLive(a.id,host,provider)).activity;
    store.act(a.id,other,{action:'vote',data:{round:1,candidateId:first.candidates[0].id}});
    const requested=store.act(a.id,other,{action:'request',data:{round:1,reason:'预算变动'}}).activity;
    store.requirements(a.id,other,{...input,budgetMin:150,budgetMax:200});
    const before=store.get(a.id,host).activity;
    const approval={action:'review-request',data:{requestId:requested.requests[0].id,decision:'approved'}};
    await assert.rejects(store.recommendLive(a.id,host,provider,approval),{code:'BUDGET_CONFLICT'});
    assert.deepEqual(store.get(a.id,host).activity,before);
  }finally{store.close();}
});
