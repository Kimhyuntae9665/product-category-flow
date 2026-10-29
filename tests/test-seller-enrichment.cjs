'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

// Run the actual deliverable, including its rendering and event handlers.
const file = path.resolve(__dirname, '../index.html');
const html = fs.readFileSync(file, 'utf8');
const inline = html.match(/<script>([\s\S]*?)<\/script>/);
assert(inline, 'deliverable includes its inline application');
const markup = html.slice(0, inline.index);
const staticIds = [...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
assert.equal(new Set(staticIds).size, staticIds.length, 'static IDs are unique');
const staticTags = new Map([...markup.matchAll(/<[^>]*\bid="([^"]+)"[^>]*>/g)].map(m => [m[1], m[0]]));
const elements = new Map();
function getElement(id) {
  if (elements.has(id)) return elements.get(id);
  const handlers = {}, classes = new Set();
  const element = {
    id, handlers, innerHTMLWrites: 0, textContent: '', className: '', value: 0,
    checked: /\bchecked(?:\s|=|>)/.test(staticTags.get(id) || ''),
    disabled: false, clientWidth: id === 'tree' ? 5250 : 1100,
    offsetHeight: id === 'tree' ? 1640 : id === 'flow-toolbar' ? 80 : 32,
    parentElement: { clientWidth: 1100 }, style: { setProperty(k, v) { this[k] = v; } },
    classList: {
      toggle(k, enabled) { if (enabled ?? !classes.has(k)) classes.add(k); else classes.delete(k); },
      add(...names) { names.forEach(k => classes.add(k)); },
      remove(...names) { names.forEach(k => classes.delete(k)); },
      contains(k) { return classes.has(k); }
    },
    addEventListener(type, fn) { handlers[type] = fn; },
    setAttribute(name, value) { this[name] = value; },
    querySelector(selector) { return getElement(id + '|' + selector); },
    click() { handlers.click?.({ target: this }); }
  };
  let innerHTML = '';
  Object.defineProperty(element, 'innerHTML', {
    get() { return innerHTML; },
    set(value) { innerHTML = value; this.innerHTMLWrites++; }
  });
  elements.set(id, element);
  return element;
}
const document = {
  getElementById: getElement, querySelector: getElement, querySelectorAll() { return []; },
  addEventListener() {}, documentElement: getElement('html'), hidden: false
};
const window = { innerHeight:720, addEventListener() {} };
const context = vm.createContext({
  document, window, location: { search: '' }, URLSearchParams, console, Map, Set,
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  requestAnimationFrame() {}, cancelAnimationFrame() {}, performance: { now: () => 0 }
});
new vm.Script(inline[1], { filename: file }).runInContext(context);
const demo = window.classificationDemo;
assert(demo && window.__ready, 'actual application initializes');
for (const name of ['setSellerIncentive', 'getSellerStats', 'simulate', 'routeFor', 'seek']) {
  assert.equal(typeof demo[name], 'function', `missing API: ${name}`);
}
assert.equal(demo.products.length, 500);
const ids = products => Array.from(products, p => p.id).sort();
const productIds = ids(demo.products);
assert.equal(new Set(productIds).size, 500);
const isExpress = route => route.some(r => r.kind === 'expressStart');
const identitySnapshot = () => Array.from(demo.products, p => ({
  id: p.id, start: p.start, rootStart: p.rootStart, worker: p.worker, rootWorker: p.rootWorker
}));
const originalIdentity = identitySnapshot();
const scheduleSnapshot = () => JSON.stringify(demo.getScalePlan());
const originalSchedule = scheduleSnapshot();

function checkProducts(enabled) {
  const groups = { baseline: [], catalog: [], supplemented: [], missing: [] };
  for (const p of demo.products) {
    const s = p.seller;
    assert(s, `${p.id}: seller evidence is present`);
    for (const key of ['baseTextEnough', 'lookupMatched', 'catalogFilled', 'promptShown', 'responded', 'supplemented', 'rewardGranted']) {
      assert.equal(typeof s[key], 'boolean', `${p.id}: seller.${key} is boolean`);
    }
    assert(['barcode', 'model', 'none'].includes(s.inputType), `${p.id}: known input type`);
    assert.equal(p.textEnough, s.baseTextEnough || s.catalogFilled || s.supplemented, `${p.id}: complete text comes from actual evidence`);
    assert(!s.catalogFilled || s.lookupMatched, `${p.id}: autofill requires an actual lookup match`);
    assert(!s.lookupMatched || s.inputType !== 'none', `${p.id}: no identifier means no lookup match`);
    assert(!s.supplemented || s.promptShown && s.responded, `${p.id}: a supplemented case has a prompt and seller response`);
    assert.equal(s.promptShown, !s.baseTextEnough && !s.catalogFilled, `${p.id}: only remaining missing text prompts a seller`);
    assert.equal(s.supplemented, s.responded && s.responseUseful, `${p.id}: a response must actually supply useful information`);
    assert(!s.rewardGranted || s.supplemented && enabled, `${p.id}: rewards only accompany enabled supplementation`);
    assert.equal(s.rewardGranted, enabled && s.supplemented, `${p.id}: each eligible supplemented case receives exactly one reward`);
    if (!enabled) assert.equal(s.rewardGranted, false, `${p.id}: disabled incentive cannot grant a reward`);
    if (!s.responded) {
      assert.equal(s.supplemented, false, `${p.id}: no response cannot add text`);
      assert.equal(s.rewardGranted, false, `${p.id}: no response cannot earn a reward`);
    }
    const group = s.baseTextEnough ? 'baseline' : s.catalogFilled ? 'catalog' : s.supplemented ? 'supplemented' : 'missing';
    groups[group].push(p);
  }
  assert.equal(Object.values(groups).flat().length, 500, 'completeness groups cover all products');
  assert.equal(new Set(ids(Object.values(groups).flat())).size, 500, 'completeness groups are disjoint');
  assert(groups.baseline.length && groups.catalog.length && groups.missing.length, 'baseline, catalog and remaining-missing cases all exist');
  assert(demo.products.some(p => p.seller.lookupMatched && !p.seller.catalogFilled), 'catalog match and useful field completion are distinct');
  return groups;
}

function verifyTerminalAndBaskets() {
  const previouslyDone = new Set();
  for (let t = 0; t <= demo.maxTime; t++) {
    const entries = demo.simulate(t, 70);
    assert.equal(entries.length, 500, `scene ${t}: product count is conserved`);
    assert.deepEqual(ids(entries.map(e => e.product)), productIds, `scene ${t}: exact product IDs are conserved`);
    const completed = entries.filter(e => e.state.kind === 'done');
    const doneIds = new Set(ids(completed.map(e => e.product)));
    for (const id of previouslyDone) assert(doneIds.has(id), `scene ${t}: ${id} remains in its output basket`);
    for (const e of completed) {
      previouslyDone.add(e.product.id);
      assert.equal(e.state.stage, e.product.path.length - 1);
    }
  }
  const final = demo.simulate(demo.maxTime, 70);
  assert(final.every(e => ['done', 'human'].includes(e.state.kind)), 'all 500 reach done or human by the actual final scene');
  const late = demo.simulate(demo.maxTime + 100, 70);
  assert.deepEqual(ids(late.filter(e => e.state.kind === 'done').map(e => e.product)), ids(final.filter(e => e.state.kind === 'done').map(e => e.product)), 'terminal baskets persist beyond timeline');
  demo.seek(demo.maxTime);
  for (const leaf of demo.leaves) {
    const c=leaf.id;
    const expected = ids(final.filter(e => e.state.kind === 'done' && e.product.leafId === c).map(e => e.product));
    const rendered = [...getElement('basket-list-' + c).innerHTML.matchAll(/<li>(P\d+)\s*·/g)].map(m => m[1]).sort();
    assert.deepEqual(rendered, expected, `basket ${c}: rendered IDs exactly match completed products`);
  }
}

const counterFields = {
  'seller-arrived': 'arrived', 'seller-originally-complete': 'originallyComplete',
  'seller-matched': 'lookupMatched', 'seller-autofill': 'catalogFilled',
  'seller-supplemented': 'supplemented', 'seller-insufficient': 'insufficient',
  'seller-rewarded': 'rewarded'
};
for (const id of ['seller-incentive', 'seller-current', 'seller-selected-inline', 'seller-reward-won', ...Object.keys(counterFields)]) {
  assert(staticIds.includes(id), `seller UI exists: ${id}`);
}
const uiNumber = id => Number(String(getElement(id).textContent).replace(/[^\d.-]/g, ''));
function verifyStatsAndRender(t) {
  const expected = {
    arrived: demo.products.filter(p => p.start <= t),
    originallyComplete: demo.products.filter(p => p.start <= t && p.seller.baseTextEnough),
    lookupMatched: demo.products.filter(p => p.start <= t && p.seller.lookupMatched),
    catalogFilled: demo.products.filter(p => p.start <= t && p.seller.catalogFilled),
    prompted: demo.products.filter(p => p.start <= t && p.seller.promptShown),
    supplemented: demo.products.filter(p => p.start <= t && p.seller.supplemented),
    insufficient: demo.products.filter(p => p.start <= t && !p.textEnough),
    rewarded: demo.products.filter(p => p.start <= t && p.seller.rewardGranted)
  };
  const stats = demo.getSellerStats(t);
  for (const [field, products] of Object.entries(expected)) {
    assert(Array.isArray(stats[field]), `stats.${field} is a product array`);
    assert.deepEqual(ids(stats[field]), ids(products), `scene ${t}: stats.${field} is exact and arrival-limited`);
  }
  const partition = [...stats.originallyComplete, ...stats.catalogFilled, ...stats.supplemented, ...stats.insufficient];
  assert.deepEqual(ids(partition), ids(stats.arrived), `scene ${t}: completeness groups are a disjoint exact partition`);
  assert.equal(stats.rewardWon, stats.rewarded.reduce(sum => sum + 1, 0), `scene ${t}: one fictional won per actually rewarded case`);
  assert.equal(Number.isInteger(stats.rewardWon), true);
  assert(stats.rewarded.every(p => p.seller.supplemented && p.seller.responded), `scene ${t}: reward recipients actually supplied missing text`);
  if (t >= 0 && t <= demo.maxTime) {
    demo.seek(t);
    for (const [id, field] of Object.entries(counterFields)) assert.equal(uiNumber(id), stats[field].length, `scene ${t}: ${id} matches exact products`);
    assert.equal(uiNumber('seller-reward-won'), stats.rewardWon, `scene ${t}: displayed budget matches awarded won`);
    const cards = [...getElement('seller-current').innerHTML.matchAll(/data-focus="(P\d+)"[^>]*><strong>([\s\S]*?)<\/strong><span>([\s\S]*?)<\/span><em>([\s\S]*?)<\/em>/g)];
    const incoming = demo.products.filter(p => p.start === t);
    assert.deepEqual(cards.map(m => m[1]).sort(), ids(incoming), `scene ${t}: seller cards show exactly this scene's original arrivals`);
    for (const card of cards) {
      const p = incoming.find(p => p.id === card[1]), s = p.seller;
      const input = s.inputType === 'none' ? '식별 정보 없음' : (s.inputType === 'barcode' ? '바코드' : '모델명') + ' · ' + (s.lookupMatched ? '기존 정보 일치' : '일치 항목 없음');
      const outcome = s.catalogFilled ? '부족 정보 자동 채움' : s.supplemented ? (s.rewardGranted ? '판매자 보강 · 가상 1원' : '판매자 보강') : s.baseTextEnough ? '기존 정보 충분' : s.responded ? '답변 후에도 정보 부족' : '응답 없음 · 정보 부족';
      assert.equal(card[3], input, `${p.id}: identifier match label matches actual data`);
      assert.equal(card[4], outcome, `${p.id}: completion/reward label matches actual data`);
    }
    assert.equal(demo.products.length, 500, `scene ${t}: seek does not create products`);
  }
  return stats;
}

assert.equal(getElement('seller-incentive').checked, true, 'fictional seller reward defaults to enabled');
const enabledGroups = checkProducts(true);
assert(enabledGroups.supplemented.length, 'enabled data includes successful seller supplementation');
const enabledEvidence = new Map(Array.from(demo.products, p => [p.id, {
  textEnough: p.textEnough, seller: { ...p.seller }, express: isExpress(demo.routeFor(p, 70))
}]));
const enabledRoutes = new Map(Array.from(demo.products, p => [p.id, JSON.stringify(demo.routeFor(p, 70))]));
const reports = [];
function verifyMode(enabled) {
  const groups = checkProducts(enabled);
  for (let t = 0; t <= demo.maxTime; t++) verifyStatsAndRender(t);
  verifyStatsAndRender(-1);
  verifyStatsAndRender(demo.maxTime + 100);
  verifyTerminalAndBaskets();
  assert.deepEqual(identitySnapshot(), originalIdentity, 'seller policy preserves IDs, arrivals and replica assignments');
  assert.equal(scheduleSnapshot(), originalSchedule, 'seller policy preserves complete autoscale scheduling');
  const stats = demo.getSellerStats(demo.maxTime);
  reports.push({ enabled, originallyComplete: groups.baseline.length, catalogFilled: groups.catalog.length,
    supplemented: groups.supplemented.length, insufficient: groups.missing.length,
    direct: demo.products.filter(p => isExpress(demo.routeFor(p, 70))).length, rewardWon: stats.rewardWon });
  return groups;
}
verifyMode(true);

demo.setSellerIncentive(false);
assert.equal(getElement('seller-incentive').checked, false, 'API updates the actual control');
const disabledGroups = verifyMode(false);
assert(enabledGroups.supplemented.length > disabledGroups.supplemented.length, 'incentive changes actual supplementation outcomes');
const incremental = demo.products.filter(p => !p.textEnough && enabledEvidence.get(p.id).textEnough);
assert(incremental.length, 'incentive adds complete text to at least one identical product');
assert(incremental.some(p => enabledEvidence.get(p.id).express && !isExpress(demo.routeFor(p, 70))), 'at least one incremental product genuinely reaches the direct final-leaf route');
const trueNonresponders = demo.products.filter(p => !p.seller.baseTextEnough && !p.seller.catalogFilled && !p.seller.responded && !enabledEvidence.get(p.id).seller.responded);
assert(trueNonresponders.length, 'true nonresponders remain in the sample');
for (const p of trueNonresponders) {
  const on = enabledEvidence.get(p.id);
  assert.equal(on.textEnough, false, `${p.id}: enabled incentives preserve true no-response missing text`);
  assert.equal(p.textEnough, false, `${p.id}: disabled incentives preserve true no-response missing text`);
  assert.equal(on.seller.rewardGranted, false, `${p.id}: no response never gets paid when enabled`);
  assert.equal(p.seller.rewardGranted, false, `${p.id}: no response never gets paid when disabled`);
  const route = demo.routeFor(p, 70);
  assert(!isExpress(route), `${p.id}: true missing text cannot skip to the leaf`);
  assert(route.some(r => r.kind === 'quality' && r.stage === 0), `${p.id}: true missing text keeps image-quality fallback`);
  assert(['done', 'human'].includes(route.at(-1).kind), `${p.id}: fallback reaches a terminal route`);
  assert.equal(JSON.stringify(route), enabledRoutes.get(p.id), `${p.id}: true no-response routing is unchanged by the incentive`);
}
const uselessResponses = demo.products.filter(p => p.seller.responded && !p.seller.responseUseful);
assert(uselessResponses.length, 'sample includes a response that still lacks useful information');
for (const p of uselessResponses) {
  assert.equal(p.textEnough, false, `${p.id}: unusable answer remains insufficient`);
  assert.equal(p.seller.rewardGranted, false, `${p.id}: unusable answer earns no reward`);
  assert(!isExpress(demo.routeFor(p, 70)), `${p.id}: unusable answer keeps the fallback route`);
}

const toggle = getElement('seller-incentive');
assert.equal(typeof toggle.handlers.change, 'function', 'actual checkbox has its change handler');
toggle.handlers.change({ target: { checked: true } });
assert.equal(toggle.checked, true, 'actual checkbox enables incentive outcomes');
checkProducts(true);
for (const p of demo.products) assert.deepEqual({ textEnough: p.textEnough, seller: { ...p.seller }, express: isExpress(demo.routeFor(p, 70)) }, enabledEvidence.get(p.id), `${p.id}: toggling back is deterministic`);
for (const t of [0, 10, 49, demo.maxTime, 0, demo.maxTime]) verifyStatsAndRender(t);
// Exercise the real delegated card click, including a nested text target.
const cardClick = getElement('seller-current').handlers.click;
assert.equal(typeof cardClick, 'function', 'seller cards have their actual delegated click handler');
function selectSellerCard(p, expectedText) {
  assert(p, 'the synthetic data contains the requested seller case');
  demo.seek(p.start);
  assert(getElement('seller-current').innerHTML.includes('data-focus="' + p.id + '"'), `${p.id}: selected card is a real current arrival`);
  const writesBeforeClick = getElement('seller-current').innerHTMLWrites;
  cardClick({ target: { closest(selector) {
    assert.equal(selector, '[data-focus]');
    return { dataset: { focus: p.id } };
  } } });
  assert.equal(getElement('seller-current').innerHTMLWrites, writesBeforeClick, `${p.id}: selection must preserve the focused button DOM`);
  const detail = String(getElement('seller-selected-inline').textContent);
  assert(detail.startsWith('선택 ' + p.id + ' · '), `${p.id}: click updates inline selection`);
  assert(String(getElement('selected-id').textContent).startsWith(p.id + ' · '), `${p.id}: sidebar follows the same selection`);
  for (const text of expectedText) {
    assert(detail.includes(text), `${p.id}: inline detail includes ${text}`);
    assert(String(getElement('selected-seller').textContent).includes(text), `${p.id}: sidebar detail includes ${text}`);
  }
  if (p.seller.inputValue) assert(detail.includes(p.seller.inputValue + ' (가상)'), `${p.id}: actual fictional identifier is visible`);
  return detail;
}
selectSellerCard(demo.products.find(p => p.seller.inputType === 'barcode'), ['바코드']);
selectSellerCard(demo.products.find(p => p.seller.inputType === 'model'), ['모델명']);
const filledCase=demo.products.find(p => p.seller.catalogFilled);
selectSellerCard(filledCase, ['자동 채움: '+filledCase.attribute.name+' = '+filledCase.attribute.value, '부족 정보 자동 채움']);
const supplementedCase=demo.products.find(p => p.seller.supplemented);
selectSellerCard(supplementedCase, ['판매자 답변: '+supplementedCase.attribute.name+' = '+supplementedCase.attribute.value, '판매자 보강 · 가상 1원']);
selectSellerCard(demo.products.find(p => p.seller.promptShown && !p.seller.responded), ['질문:', '답변을 받지 못함', '응답 없음 · 정보 부족']);
selectSellerCard(demo.products.find(p => p.seller.responded && !p.seller.responseUseful), ['질문:', '답변: 모름', '답변 후에도 정보 부족']);
selectSellerCard(demo.products.find(p => p.seller.baseTextEnough), ['추가 질문 없이 정보가 충분한 예시', '기존 정보 충분']);
// Re-rendering the same scene and policy must not replace keyboard targets.
const sellerCards = getElement('seller-current');
demo.seek(0);
const stableWrites = sellerCards.innerHTMLWrites, stableMarkup = sellerCards.innerHTML;
demo.seek(0);
demo.setSellerIncentive(true);
assert.equal(sellerCards.innerHTMLWrites, stableWrites, 'same-scene/same-policy renders do not reassign seller card HTML');
assert.equal(sellerCards.innerHTML, stableMarkup);
const focusin = sellerCards.handlers.focusin;
assert.equal(typeof focusin, 'function', 'seller cards listen for keyboard focus entering a card');
const focusedTarget = { closest(selector) {
  assert.equal(selector, '[data-focus]');
  return { dataset: { focus: demo.products[0].id } };
} };
getElement('play').click();
assert.equal(demo.getState().playing, true, 'focus regression starts with actual playback enabled');
focusin({ target: focusedTarget });
assert.equal(demo.getState().playing, false, 'focus entering a seller card pauses actual playback');
assert.equal(demo.getState().time, 0, 'focus pause preserves the displayed scene');
assert.equal(sellerCards.innerHTMLWrites, stableWrites, 'focus-triggered render does not replace the focused card DOM');
getElement('play').click();
assert.equal(demo.getState().playing, true);
cardClick({ target: focusedTarget });
assert.equal(demo.getState().playing, false, 'selecting a seller card also pauses actual playback');
assert.equal(sellerCards.innerHTMLWrites, stableWrites, 'selection-triggered pause also preserves the card DOM');
assert.deepEqual(identitySnapshot(), originalIdentity);
assert.equal(scheduleSnapshot(), originalSchedule);
console.log(JSON.stringify({ passed: true, products: 500, incrementalProducts: incremental.length,
  incrementalDirect: incremental.filter(p => enabledEvidence.get(p.id).express).length,
  trueNonresponders: trueNonresponders.length, scenarios: reports }, null, 2));
console.log('PASS: real inline application; seller completeness partitions; arrived-only exact counters; fictional one-won rewards; deterministic policy toggle; stable IDs/replica schedule; incremental direct routes; true no-response fallback; persistent rendered output baskets; actual seller-card click, fictional IDs, autofill/answer/no-response/unknown details; stable card DOM and focus/selection playback pause.');
