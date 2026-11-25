'use strict';
const {customPreferenceError}=require('./core');
const policies={
  '聚餐': {keyword:'餐饮服务',pattern:/餐饮|餐厅|餐馆|火锅|烧烤|中餐|西餐|咖啡|甜品|饭店|小吃/,prefixes:['05']},
  '休闲娱乐': {keyword:'公园|电影院|KTV|商场|桌游',pattern:/公园|电影院|影城|KTV|卡拉OK|桌游|桌面游戏|商场|购物中心|剧本杀|密室|美甲|手工|陶艺|DIY|写真|摄影|拼豆|娱乐|休闲/i,prefixes:['0601','080','1101']},
  '线下会面': {keyword:'咖啡厅|茶艺馆|图书馆',pattern:/咖啡|茶艺|茶馆|图书馆|共享办公|会议|会客|商场|购物中心/,prefixes:['0505','0506','1405','0601']}
};
const customCategories={
  '线下会面': new Map([['书店', /书店|书城|书局|图书销售/]]),
  '休闲娱乐': new Map([['博物馆', /博物馆/], ['美术馆', /美术馆/], ['展览馆', /展览馆|展览中心/]])
};
function suitable(place,type,customKeywords=[]){
  const policy=policies[type];
  if(!policy)return false;
  const category=String(place.category||'');
  // Reject stations, parking lots and residential addresses even if their names contain a preference.
  if(/交通设施|地铁站|停车场|住宅区/.test(category)||/^15/.test(place.typecode||''))return false;
  const matchesType=category ? policy.pattern.test(category)||policy.prefixes.some(p=>String(place.typecode||'').startsWith(p)) : policy.pattern.test(place.name||'');
  return matchesType || customKeywords.some(keyword=>customCategories[type]?.get(keyword)?.test(category));
}
// Match supported venue aliases in POI names and categories.
const aliases={'公园':['公园','风景'], '赏风景':['公园','风景'], '电影院':['电影院','影城'], '咖啡甜品':['咖啡','甜品','糕点'], 'KTV':['KTV','卡拉OK'], '中餐':['中餐','中式'], '西餐':['西餐','意大利菜','法国菜','牛排'], '商场':['商场','购物中心'], '逛街':['商场','购物中心'], '安静场所':['咖啡','茶','图书馆'], '学习讨论':['咖啡','图书馆'], '工作交流':['咖啡','茶','会议','共享办公'], '朋友会面':['咖啡','茶'], '交通便利':['咖啡','茶'], '桌游':['桌游','桌面游戏'], '密室逃脱':['密室','逃脱'], '手工':['手工','陶艺','DIY','拼豆'], '写真':['写真','摄影'], '聚餐':['餐饮','餐厅','餐馆']};
Object.assign(aliases, {
  '书店': ['书店','书城','书局','图书销售'],
  '咖啡厅': ['咖啡厅','咖啡馆','咖啡店'],
  '展览馆': ['展览馆','展览中心']
});
function matches(place,preference){
  const terms=Object.hasOwn(aliases,preference)?aliases[preference]:[preference];
  const description=(place.name+' '+place.category).toLowerCase();
  return terms.some(term=>description.includes(term.toLowerCase()));
}
function searchTerms(preference){
  const semantic={'学习讨论':['咖啡厅','图书馆'],'工作交流':['咖啡厅','茶馆'],'朋友会面':['咖啡厅','茶馆'],'安静场所':['咖啡厅','图书馆'],'交通便利':['咖啡厅','茶馆'],'咖啡甜品':['咖啡厅','甜品店'],'赏风景':['公园'],'逛街':['商场'],'聚餐':['餐饮服务'],'电影院':['电影院','影城'],'桌游':['桌游'],'密室逃脱':['密室逃脱'],'手工':['手工','陶艺','拼豆'],'写真':['写真','摄影']};
  return Object.hasOwn(semantic,preference)?semantic[preference]:[preference];
}
function customSearchTerms(detail){
  if(customPreferenceError(detail))return [];
  const venues=/清真餐厅|素食餐厅|图书馆|书店|书城|书局|茶艺馆|茶馆|咖啡厅|咖啡馆|咖啡店|甜品店|火锅店|烧烤店|餐厅|餐馆|电影院|影城|剧本杀|密室逃脱|桌游|KTV|博物馆|美术馆|展览馆|展览中心|体育馆|篮球场|羽毛球馆|公园|商场|购物中心|共享办公/giu;
  const venueAliases=new Map([['书城','书店'],['书局','书店'],['咖啡馆','咖啡厅'],['咖啡店','咖啡厅'],['展览中心','展览馆']]);
  return detail.normalize('NFKC').split(/[、,;。/|]+/u).map(part=>part.trim()).filter(Boolean)
    .flatMap(part=>part.match(venues)||[part]).map(term=>venueAliases.get(term)||term);
}
module.exports={policies,suitable,matches,searchTerms,customSearchTerms};
