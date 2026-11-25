'use strict';
const policies={
  '聚餐': {keyword:'餐饮服务',pattern:/餐饮|餐厅|餐馆|火锅|烧烤|中餐|西餐|咖啡|甜品|饭店|小吃/,prefixes:['05']},
  '休闲娱乐': {keyword:'公园|电影院|KTV|商场|桌游',pattern:/公园|电影院|影城|KTV|卡拉OK|桌游|商场|购物中心|剧本杀|密室|美甲|手工|写真|拼豆|娱乐|休闲/,prefixes:['0601','080','1101']},
  '线下会面': {keyword:'咖啡厅|茶艺馆|图书馆',pattern:/咖啡|茶艺|茶馆|图书馆|共享办公|会议|会客/,prefixes:['0505','0506','1405']}
};
function suitable(place,type,customKeywords=[]){
  const policy=policies[type];
  if(!policy)return false;
  const category=String(place.category||'');
  // Reject stations, parking lots and residential addresses even if their names contain a preference.
  if(/交通设施|地铁站|停车场|住宅区/.test(category)||/^15/.test(place.typecode||''))return false;
  if(customKeywords.some(keyword=>matches(place,keyword)))return true;
  return category ? policy.pattern.test(category)||policy.prefixes.some(p=>String(place.typecode||'').startsWith(p)) : policy.pattern.test(place.name||'');
}
const aliases={'公园':['公园','风景'], '电影院':['电影院','影城'], '咖啡甜品':['咖啡','甜品','糕点'], 'KTV':['KTV','卡拉OK'], '中餐':['中餐','中式'], '商场':['商场','购物中心'], '安静场所':['咖啡','茶','图书馆'], '学习讨论':['咖啡','图书馆'], '工作交流':['咖啡','茶','会议'], '朋友会面':['咖啡','茶']};
function matches(place,preference){
  const terms=Object.hasOwn(aliases,preference)?aliases[preference]:[preference];
  const description=(place.name+' '+place.category).toLowerCase();
  return terms.some(term=>description.includes(term.toLowerCase()));
}
function searchTerms(preference){
  const semantic={'学习讨论':['咖啡厅','图书馆'],'工作交流':['咖啡厅','茶馆'],'朋友会面':['咖啡厅','茶馆'],'安静场所':['咖啡厅','图书馆'],'交通便利':['咖啡厅','茶馆'],'咖啡甜品':['咖啡厅','甜品店'],'赏风景':['公园'],'逛街':['商场'],'聚餐':['餐饮服务']};
  return Object.hasOwn(semantic,preference)?semantic[preference]:[preference];
}
function customSearchTerms(detail){
  const venue=/清真餐厅|素食餐厅|图书馆|书店|茶艺馆|茶馆|咖啡厅|咖啡馆|咖啡店|甜品店|火锅店|烧烤店|餐厅|餐馆|电影院|影城|剧本杀|密室逃脱|桌游|KTV|博物馆|美术馆|展览馆|体育馆|篮球场|羽毛球馆|公园|商场|购物中心|共享办公/gi;
  return detail.normalize('NFKC').split(/[、,;。/|]+/u).map(part=>part.trim()).filter(Boolean)
    .flatMap(part=>part.match(venue)||[part]);
}
module.exports={policies,suitable,matches,searchTerms,customSearchTerms};
