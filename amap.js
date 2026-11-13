'use strict';
const {fail}=require('./recommendation');
const number=v=>v!==null&&v!==undefined&&v!==''&&!Array.isArray(v)&&Number.isFinite(Number(v))?Number(v):null;
function createAmap({key=process.env.AMAP_KEY,fetchImpl=fetch}={}){
  async function request(path,params,signal){
    if(!key)throw fail('MAP_PROVIDER_ERROR','请配置后端 AMAP_KEY');
    for(let attempt=0;attempt<2;attempt++){
      try{
        const url=new URL('https://restapi.amap.com/'+path);url.search=new URLSearchParams({...params,key});
        const response=await fetchImpl(url,{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(8000)]):AbortSignal.timeout(8000)});
        if(response.status>=500&&attempt===0)continue;
        if(!response.ok)throw fail('MAP_PROVIDER_ERROR','地图服务请求失败',true);
        const body=await response.json();
        if(body.status!=='1'&&body.errcode!==0){
          const code=String(body.infocode ?? body.errcode ?? 'UNKNOWN');
          const hints={
            '10001':'Key 无效或已过期，请检查 AMAP_KEY',
            '10002':'当前 Key 没有该接口权限，请检查服务授权',
            '10003':'今日调用配额已用尽',
            '10005':'服务器出口 IP 不在 Key 的 IP 白名单中',
            '10009':'Key 平台不匹配，请使用 Web 服务类型的 Key'
          };
          // Do not echo provider text or request URLs: these may contain secrets.
          throw fail(['10003','10044'].includes(code)?'MAP_QUOTA_EXCEEDED':'MAP_PROVIDER_ERROR',
            `高德错误 ${/^\d{1,10}$/.test(code)?code:'UNKNOWN'}：${hints[code]||'请在高德控制台检查接口授权、配额和安全设置'}`,false);
        }
        return body;
      }catch(e){if(['TimeoutError','AbortError'].includes(e.name)){if(!attempt&&!signal?.aborted)continue;throw fail('MAP_TIMEOUT','地图服务超时',true);}if(e.code)throw e;throw fail('MAP_PROVIDER_ERROR','地图连接失败，请检查网络后重试',true);}
    }
  }
  const location=p=>{const [lng,lat]=String(p.location).split(',').map(Number);return {provider:'amap',placeId:p.id,name:p.name,address:typeof p.address==='string'?p.address:'',category:p.type||'',typecode:p.typecode||'',lng,lat};};
  return {
    async search(keyword,center,city='上海',signal){
      const body=await request(center?'v3/place/around':'v3/place/text',{keywords:keyword,city,offset:'20',extensions:'all',...(center?{location:`${center.lng.toFixed(6)},${center.lat.toFixed(6)}`,radius:'20000'}:{citylimit:'true'})},signal);
      return (body.pois||[]).map(p=>({...location(p),rating:number(p.biz_ext?.rating)}));
    },
    async reverse(lng,lat){const b=await request('v3/geocode/regeo',{location:`${lng},${lat}`,extensions:'all'});const p=b.regeocode?.pois?.[0];if(!p)throw fail('NO_CANDIDATES','当前位置附近没有可确认地点');return location(p);},
    async route(origin,destination,mode,signal){
      const paths={'公共交通':'v3/direction/transit/integrated','驾车':'v3/direction/driving','步行':'v3/direction/walking','骑行':'v4/direction/bicycling'};
      if(!paths[mode])throw fail('MAP_PROVIDER_ERROR','交通方式无效');
      const b=await request(paths[mode],{origin:`${origin.lng.toFixed(6)},${origin.lat.toFixed(6)}`,destination:`${destination.lng.toFixed(6)},${destination.lat.toFixed(6)}`,city:origin.city||'上海',cityd:destination.city||'上海',extensions:'all'},signal);
      const r=mode==='公共交通'?b.route?.transits?.[0]:(b.route||b.data)?.paths?.[0];
      if(!r||number(r.duration)===null||number(r.distance)===null)throw fail('ROUTES_UNAVAILABLE','路线不可用',true);
      const rawCost=mode==='公共交通'?number(r.cost):null;
      const cost=rawCost!==null&&rawCost>=0?rawCost:null;
      if(Number(r.duration)<0||Number(r.distance)<0)throw fail('ROUTES_UNAVAILABLE','路线数据无效',true);
      return {costSource:cost!==null?'amap.transit.cost':null,minutes:Math.ceil(Number(r.duration)/60),distanceMeters:Number(r.distance),cost,costStatus:mode==='公共交通'?(cost===null?'unavailable':'known'):mode==='驾车'?'unknown':'not_applicable',transfers:Math.max(0,(r.segments||[]).filter(s=>s.bus?.buslines?.length).length-1)};
    },
    async staticMap(points,{width=640,height=350}={},signal){
      if(!key)throw fail('MAP_PROVIDER_ERROR','请配置后端 AMAP_KEY');
      const places=(points||[]).filter(p=>Number.isFinite(p?.lng)&&Number.isFinite(p?.lat)).slice(0,3);
      if(!places.length)throw fail('NO_CANDIDATES','暂无可展示的候选地点');
      const size=`${Math.max(200,Math.min(1024,Math.round(width)))}*${Math.max(200,Math.min(1024,Math.round(height)))}`;
      const markers=places.map((p,index)=>`large,0x1F191A,${/^[0-9A-Z]$/.test(p.label)?p.label:String(index+1)}:${Number(p.lng).toFixed(6)},${Number(p.lat).toFixed(6)}`).join('|');
      const url=new URL('https://restapi.amap.com/v3/staticmap');
      url.search=new URLSearchParams({size,scale:'2',markers,key});
      try{
        const timeout=AbortSignal.timeout(5000);
        const response=await fetchImpl(url,{signal:signal?AbortSignal.any([signal,timeout]):timeout});
        if(!response.ok)throw fail('MAP_PROVIDER_ERROR','地图图片请求失败',true);
        const contentType=(response.headers.get('content-type')||'').split(';')[0].trim().toLowerCase();
        if(!contentType.startsWith('image/')){
          let code='UNKNOWN';
          try{const body=await response.json();code=String(body.infocode??body.errcode??'UNKNOWN');}catch{}
          throw fail(['10003','10044'].includes(code)?'MAP_QUOTA_EXCEEDED':'MAP_PROVIDER_ERROR',code==='10003'?'今日地图调用配额已用尽':'地图图片暂时不可用',false);
        }
        const body=Buffer.from(await response.arrayBuffer());
        if(!body.length||body.length>5*1024*1024)throw fail('MAP_PROVIDER_ERROR','地图图片响应无效',true);
        return {body,contentType};
      }catch(e){
        if(['TimeoutError','AbortError'].includes(e.name))throw fail('MAP_TIMEOUT','地图图片加载超时',true);
        if(e.code)throw e;
        throw fail('MAP_PROVIDER_ERROR','地图图片连接失败，请稍后重试',true);
      }
    }
  };
}
module.exports={createAmap};
