'use strict';
const policies={
  '聚餐': {keyword:'餐饮服务',pattern:/餐饮|餐厅|餐馆|火锅|烧烤|中餐|西餐|咖啡|甜品|饭店|小吃/,prefixes:['05']},
  '休闲娱乐': {keyword:'公园|电影院|KTV|商场|桌游',pattern:/公园|电影院|影城|KTV|卡拉OK|桌游|商场|购物中心|剧本杀|密室|美甲|手工|写真|拼豆|娱乐|休闲/,prefixes:['0601','080','1101']},
  '线下会面': {keyword:'咖啡厅|茶艺馆|图书馆',pattern:/咖啡|茶艺|茶馆|图书馆|共享办公|会议|会客/,prefixes:['0505','0506','1405']}
};
function suitable(place,type){
  const policy=policies[type];
  if(!policy)return false;
  const category=String(place.category||'');
  // Reject stations, parking lots and residential addresses even if their names contain a preference.
  if(/交通设施|地铁站|停车场|住宅区/.test(category)||/^15/.test(place.typecode||''))return false;
  return category ? policy.pattern.test(category)||policy.prefixes.some(p=>String(place.typecode||'').startsWith(p)) : policy.pattern.test(place.name||'');
}
const aliases={'公园':['公园','风景'], '电影院':['电影院','影城'], '咖啡甜品':['咖啡','甜品','糕点'], 'KTV':['KTV','卡拉OK'], '中餐':['中餐','中式'], '商场':['商场','购物中心'], '安静场所':['咖啡','茶','图书馆'], '学习讨论':['咖啡','图书馆'], '工作交流':['咖啡','茶','会议'], '朋友会面':['咖啡','茶']};
function matches(place,preference){return (aliases[preference]||[preference]).some(v=>(place.name+' '+place.category).toLowerCase().includes(v.toLowerCase()));}
module.exports={policies,suitable,matches};
