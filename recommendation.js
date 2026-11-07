'use strict';
const {createHash}=require('node:crypto');
const {policies,suitable,matches:matchesPreference}=require('./place-policy');
const fail = (code, message, retryable = false) => Object.assign(new Error(message), { code, retryable });
const valid = p => p && Number.isFinite(p.lng) && Number.isFinite(p.lat) && Math.abs(p.lng) <= 180 && Math.abs(p.lat) <= 90;
const distance = (a,b) => Math.hypot((a.lng-b.lng)*Math.cos(a.lat*Math.PI/180)*111320,(a.lat-b.lat)*111320);
const score = n => Math.round(Math.max(0,Math.min(10,n))*10)/10;
function rank(activity, places, round) {
  const pool = places.map(p => {
    const times = p.routes.map(r=>r.minutes), minMinutes=Math.min(...times), maxMinutes=Math.max(...times);
    const averageMinutes=times.reduce((a,b)=>a+b,0)/times.length, gapMinutes=maxMinutes-minMinutes;
    const matches=activity.members.map(m=> m.preference==='不限' ? (p.rating == null ? null : score(p.rating*2)) : matchesPreference(p,m.preference)?10:4).filter(Number.isFinite);
    const dimensions={fairness:score(10-gapMinutes/6),time:score(10-averageMinutes/9),preference:matches.length?score(matches.reduce((a,b)=>a+b,0)/matches.length):null,convenience:score(10-maxMinutes/9-Math.max(...p.routes.map(r=>r.transfers||0)))};
    const values=Object.values(dimensions).filter(Number.isFinite);
    return {...p,id:`c_${round}_${p.placeId}`,round,average:Math.round(averageMinutes),gap:gapMinutes,area:p.address,subtitle:p.category,line:'高德路线',illustration:'building',x:50,y:50,routeSummary:{averageMinutes:Math.round(averageMinutes),minMinutes,maxMinutes,gapMinutes},dimensions,score:score(values.reduce((a,b)=>a+b,0)/values.length),reasons:[gapMinutes<=12?'全体成员预计出行时间较接近':'已综合比较全体成员的出行时间', ...(dimensions.preference>=8?['地点类别或名称较符合成员偏好']:[]),...(dimensions.convenience>=7?['整体出行较方便']:[]),'评分按可获取的有效维度等权计算']};
  }).sort((a,b)=>b.score-a.score||a.placeId.localeCompare(b.placeId));
  pool.forEach((p,i)=>p.overallRank=i+1);
  const groups=Object.fromEntries(['fairness','preference','convenience'].map(k=>[k,[...pool].sort((a,b)=>(b.dimensions[k]??-1)-(a.dimensions[k]??-1)||b.score-a.score||a.placeId.localeCompare(b.placeId)).slice(0,3).map(p=>p.id)]));
  const ids=new Set(Object.values(groups).flat());
  return {round,groups,candidates:pool.filter(p=>ids.has(p.id)),warnings:pool.length<3?['可用候选不足三个，已返回实际数量']:[]};
}
async function recommend(activity, provider) {
  if(activity.members.length<2||activity.members.length>10||!activity.members.every(m=>valid(m.origin))) throw fail('INSUFFICIENT_ORIGINS','需要 2—10 名成员提交有效出发地');
  const center={lng:activity.members.reduce((s,m)=>s+m.origin.lng,0)/activity.members.length,lat:activity.members.reduce((s,m)=>s+m.origin.lat,0)/activity.members.length};
  const keywords=[...new Set(activity.members.map(m=>m.preference).filter(p=>p&&p!=='不限'))];
  const found=await provider.search(keywords.join('|')||policies[activity.type]?.keyword,center);
  const unique=[];
  for(const p of found) if(valid(p)&&suitable(p,activity.type)&&!unique.some(q=>p.placeId&&q.placeId===p.placeId||p.name===q.name&&distance(p,q)<50)) unique.push({...p,placeId:p.placeId||'geo_'+createHash('sha256').update(p.name+'|'+p.lng.toFixed(5)+'|'+p.lat.toFixed(5)).digest('hex').slice(0,16)});
  if(!unique.length) throw fail('NO_CANDIDATES','没有搜索到适合的地点');
  const selected=unique.sort((a,b)=>distance(a,center)-distance(b,center)).slice(0,10);
  const jobs=selected.flatMap(p=>activity.members.map(m=>({p,m}))), results=new Map(selected.map(p=>[p,[]]));
  let cursor=0;
  const failures=[];
  await Promise.all(Array.from({length:Math.min(5,jobs.length)},async()=>{while(cursor<jobs.length){const {p,m}=jobs[cursor++];try{const r=await provider.route(m.origin,p,m.mode);if(!Number.isFinite(r.minutes)||r.minutes<0||!Number.isFinite(r.distanceMeters)||r.distanceMeters<0)throw Error('无效路线');results.get(p).push({...r,cost:r.costStatus==='known'&&Number.isFinite(r.cost)&&r.cost>=0?r.cost:null,costStatus:r.costStatus==='known'&&(!Number.isFinite(r.cost)||r.cost<0)?'unavailable':r.costStatus,memberId:m.id,mode:m.mode});}catch(error){failures.push(error);results.get(p).push(null);}}}));
  const complete=selected.filter(p=>results.get(p).length===activity.members.length&&results.get(p).every(Boolean)).map(p=>({...p,routes:results.get(p)}));
  if(!complete.length && failures.some(e=>['MAP_TIMEOUT','MAP_QUOTA_EXCEEDED','MAP_PROVIDER_ERROR'].includes(e.code))) throw failures.find(e=>['MAP_TIMEOUT','MAP_QUOTA_EXCEEDED','MAP_PROVIDER_ERROR'].includes(e.code));
  if(!complete.length) throw fail('ROUTES_UNAVAILABLE','所有候选均有成员路线不可用',true);
  const result=rank(activity,complete,activity.round+1);
  if(complete.length<selected.length)result.warnings.push('部分地点路线不可用，已从本轮候选中排除');
  return result;
}
module.exports={recommend,rank,valid,fail};

