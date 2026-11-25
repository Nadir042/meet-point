'use strict';
// Deterministic simulated HTTP latency. No AMAP_KEY, public network or database.
// Optional argument: path to a pre-change amap module for before/after comparison.
const {performance}=require('node:perf_hooks');
const path=require('node:path');
const {recommend}=require('../recommendation');
const current=require('../amap').createAmap;
const baseline=process.argv[2]?require(path.resolve(process.argv[2])).createAmap:null;
const latencyMs=120;
const pois=Array.from({length:3},(_,i)=>({id:'P'+i,name:'咖啡厅'+i,type:'餐饮服务;咖啡厅',location:`${121.3+i*.001},31.3`,biz_ext:{cost:'30',rating:'4'}}));
const median=values=>[...values].sort((a,b)=>a-b)[Math.floor(values.length/2)];
async function measure(factory,scenario){
  const cold=[],warm=[];
  for(let repeat=0;repeat<3;repeat++){
    let calls=0;
    const provider=factory({key:crypto.randomUUID(),qps:20,fetchImpl:async url=>{
      calls++;await new Promise(resolve=>setTimeout(resolve,latencyMs));
      const body=url.pathname.includes('/place/')?{status:'1',pois}:
        url.pathname.includes('/bicycling')?{errcode:0,data:{paths:[{duration:'600',distance:'1000'}]}}:
        {status:'1',route:{paths:[{duration:'600',distance:'1000'}],transits:[{duration:'900',distance:'1000',cost:'4',segments:[]}]}};
      return {ok:true,status:200,json:async()=>body};
    }});
    const a={type:'线下会面',round:0,members:Array.from({length:scenario.members},(_,i)=>({
      id:String(i),origin:{lng:121.2+i*.001,lat:31.2},modes:scenario.modes,preferences:['学习讨论','朋友会面'],budget:100
    }))};
    for(const bucket of [cold,warm]){
      const count=calls,start=performance.now();
      const result=await recommend(a,provider);
      bucket.push({ms:Math.round(performance.now()-start),requests:calls-count,candidates:result.candidates.length});
      a.round++;
    }
  }
  return {cold:{medianMs:median(cold.map(v=>v.ms)),requests:cold.map(v=>v.requests)},warm:{medianMs:median(warm.map(v=>v.ms)),requests:warm.map(v=>v.requests)}};
}
(async()=>{
  console.log(JSON.stringify({simulated:true,latencyMs,qps:20,repeats:3,note:'Same recommendation logic for both providers; isolates provider scheduling/cache changes.'}));
  for(const scenario of [{members:2,modes:['步行']},{members:4,modes:['步行','公共交通']},{members:9,modes:['公共交通','驾车','步行','骑行']}]){
    const before=baseline?await measure(baseline,scenario):undefined;
    const after=await measure(current,scenario);
    console.log(JSON.stringify({scenario,before,after}));
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
