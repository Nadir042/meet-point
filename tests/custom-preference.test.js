'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../core');
const { createAmap } = require('../amap');
const { customSearchTerms, suitable } = require('../place-policy');
const { recommend } = require('../recommendation');
const { openStore } = require('../shared-store');

const origin = { provider: 'amap', placeId: 'origin', name: '出发地', lng: 121.2, lat: 31.2 };
const bookshop = { placeId: 'bookshop', name: '新华书店', category: '购物服务;专卖店;书店', lng: 121.21, lat: 31.2 };
const cafe = { placeId: 'cafe', name: '社区咖啡馆', category: '餐饮服务;咖啡厅', lng: 121.22, lat: 31.2, venueCost: 50, venueCostStatus: 'known' };
const route = async () => ({ minutes: 10, distanceMeters: 500, cost: null, costStatus: 'not_applicable' });
const member = (id, options = {}) => ({ id, origin, mode: '步行', budgetMin: 50, budgetMax: 100, ...options });

test('custom venue terms narrow descriptions and discard unsupported exclusion phrases', () => {
  assert.deepEqual(customSearchTerms('安静的书店、咖啡馆'), ['书店', '咖啡厅']);
  for (const detail of ['不要咖啡厅', '书店，不想去咖啡馆', '排除咖啡厅']) {
    assert.deepEqual(customSearchTerms(detail), []);
    assert.match(M.customPreferenceError(detail), /暂不支持排除条件/);
  }
});

test('only explicit compatible custom POI categories may extend the activity policy', () => {
  assert.equal(suitable(bookshop, '线下会面'), false);
  assert.equal(suitable(bookshop, '线下会面', ['书店']), true);
  assert.equal(suitable(bookshop, '聚餐', ['书店']), false);
  assert.equal(suitable({ name: '书店', category: '交通设施服务;书店' }, '线下会面', ['书店']), false);
  assert.equal(suitable({ name: '书店', category: '生活服务' }, '线下会面', ['书店']), false);
  assert.equal(suitable({ name: '博物馆', category: '科教文化服务;博物馆' }, '休闲娱乐', ['博物馆']), true);
});

test('custom and preset searches share the AMap and route caches and preserve budget priority', async () => {
  const words = [];
  let routeRequests = 0;
  const provider = createAmap({ key: 'custom-venue-cache-test', qps: 20, fetchImpl: async url => {
    const keyword = url.searchParams.get('keywords');
    if (keyword) {
      words.push(keyword);
      const pois = keyword === '书店'
        ? [{ id: bookshop.placeId, name: bookshop.name, type: bookshop.category, location: '121.21,31.2' }]
        : keyword === '咖啡厅'
          ? [{ id: cafe.placeId, name: cafe.name, type: cafe.category, location: '121.22,31.2', biz_ext: { cost: '50' } }]
          : [];
      return { ok: true, status: 200, json: async () => ({ status: '1', pois }) };
    }
    routeRequests++;
    return { ok: true, status: 200, json: async () => ({ status: '1', route: { paths: [{ duration: '600', distance: '500' }] } }) };
  } });
  const activity = {
    type: '线下会面', round: 0, members: [
      member('a', { preferenceSelections: ['学习讨论', '其他'], preferenceDetail: '安静的书店' }),
      member('b', { preference: '学习讨论' })
    ]
  };
  const result = await recommend(activity, provider);
  assert.deepEqual(words, ['书店', '咖啡厅', '图书馆']);
  assert.equal(routeRequests, 2);
  assert.deepEqual(result.candidates.map(p => [p.placeId, p.budgetStatus]), [['cafe', 'within'], ['bookshop', 'unknown']]);
  assert.ok(result.candidates[1].reasons.some(reason => reason.includes('匹配偏好：书店')));
  assert.ok(result.warnings.some(warning => warning.includes('人均消费未知')));
  assert.deepEqual(await recommend(activity, provider), result);
  assert.equal(words.length, 3);
  assert.equal(routeRequests, 2);
});

test('dining excludes bookstore matches and legacy exclusion text does not create a search keyword', async () => {
  const activity = {
    type: '聚餐', round: 0, members: [
      member('a', { preferenceSelections: ['其他'], preferenceDetail: '安静的书店' }),
      member('b', { preferences: ['不要咖啡厅'] })
    ]
  };
  const words = [];
  const provider = {
    search: async keyword => { words.push(keyword); return keyword === '书店' ? [bookshop] : [cafe]; },
    route
  };
  const result = await recommend(activity, provider);
  assert.deepEqual(words, ['书店', '餐饮服务']);
  assert.deepEqual(result.candidates.map(p => p.placeId), ['cafe']);
  assert.ok(result.warnings.some(warning => warning.includes('不保证满足原偏好')));
});

test('requirements round-trip custom selection through storage and clear it on deselection', async () => {
  const store = openStore(':memory:');
  try {
    const host = store.register({ username: 'custom_host', password: 'test-password' }).token;
    const guest = store.register({ username: 'custom_guest', password: 'test-password' }).token;
    const { activity } = store.create({ title: '偏好', nickname: '发起人', type: '线下会面' }, host);
    store.join({ code: activity.code, nickname: '伙伴' }, guest);
    const input = { origin, modes: ['步行'], preferences: ['学习讨论', '其他'], preferenceDetail: '安静的书店', budgetMin: 50, budgetMax: 100 };
    const readHost = () => store.get(activity.id, host).activity.members[0];
    store.requirements(activity.id, host, input);
    assert.deepEqual(M.memberPreferenceSelection(readHost(), activity.type), { selections: ['学习讨论', '其他'], detail: '安静的书店' });
    const before = readHost();
    for (const detail of ['不要咖啡厅', '   ']) {
      assert.throws(() => store.requirements(activity.id, host, { ...input, preferenceDetail: detail }), { status: 400 });
      assert.deepEqual(readHost(), before);
    }
    store.requirements(activity.id, host, { ...input, preferenceDetail: '学习讨论' });
    assert.deepEqual(M.memberPreferenceSelection(readHost(), activity.type), { selections: ['学习讨论', '其他'], detail: '学习讨论' });
    store.requirements(activity.id, host, { ...input, preferences: ['学习讨论'] });
    assert.deepEqual(M.memberPreferenceSelection(readHost(), activity.type), { selections: ['学习讨论'], detail: '' });
    assert.deepEqual(M.memberBudget(readHost()), { min: 50, max: 100 });
    store.requirements(activity.id, guest, { origin, mode: '步行', preference: '不限', budget: 100 });
    const words = [];
    await store.recommendLive(activity.id, host, {
      search: async keyword => { words.push(keyword); return [cafe]; },
      route
    });
    assert.deepEqual(words, ['咖啡厅|图书馆']);
  } finally {
    store.close();
  }
});
