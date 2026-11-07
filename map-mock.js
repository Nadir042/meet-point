'use strict';
const {fail}=require('./recommendation');
// Explicit fault injection only. Never fabricates successful routes or POIs.
function withMapFaults(provider, mode=process.env.MAP_MOCK){
  if(!mode)return provider;
  if(!['timeout','empty','partial','nocost','quota'].includes(mode))throw Error('MAP_MOCK 配置无效');
  let failedPlace;
  return {...provider,
    async search(...args){
      if(mode==='timeout')throw fail('MAP_TIMEOUT','测试：地图超时',true);
      if(mode==='quota')throw fail('MAP_QUOTA_EXCEEDED','测试：地图配额不足');
      if(mode==='empty')return [];
      return provider.search(...args);
    },
    async route(origin,destination,travelMode,...rest){
      if(mode==='partial'){
        failedPlace ||= destination.placeId;
        if(destination.placeId===failedPlace)throw fail('ROUTES_UNAVAILABLE','测试：部分地点路线失败',true);
      }
      const r=await provider.route(origin,destination,travelMode,...rest);
      return mode==='nocost'&&travelMode==='公共交通'?{...r,cost:null,costStatus:'unavailable',costSource:null}:r;
    }
  };
}
module.exports={withMapFaults};
