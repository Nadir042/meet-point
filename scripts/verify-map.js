'use strict';
const { createAmap } = require('../amap');

async function main(){
  if(!process.env.AMAP_KEY)throw Error('请先设置 AMAP_KEY，再运行 npm run verify:map');
  const image=await createAmap().staticMap([
    {lng:121.4752,lat:31.2194,label:'1'},
    {lng:121.4505,lat:31.2237,label:'2'},
    {lng:121.4753,lat:31.2322,label:'3'}
  ],{width:750,height:420});
  if(!image.contentType.startsWith('image/')||image.body.length<100)throw Error('高德静态地图响应无效');
  console.log(`高德静态地图连接正常：${image.contentType}，${image.body.length} bytes`);
}

main().catch(error=>{console.error(error.message);process.exitCode=1;});
