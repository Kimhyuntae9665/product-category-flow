'use strict';
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

// Execute the shipped inline application, rather than a copied routing function.
const file = path.resolve(__dirname, '../index.html');
const html = fs.readFileSync(file, 'utf8');
const inline = html.match(/<script>([\s\S]*?)<\/script>/);
assert(inline, 'the deliverable must contain its runnable inline application');
const markup = html.slice(0, inline.index);
const staticIds = [...markup.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
assert.equal(new Set(staticIds).size, staticIds.length, 'HTML IDs must be unique');
for (const id of ['express-count', 'express-active', 'express-completed', 'express-lines']) {
  assert(staticIds.includes(id), `missing direct-route control: ${id}`);
}
for (const match of inline[1].matchAll(/\$\('([^']+)'\)/g)) {
  assert(staticIds.includes(match[1]), `missing static element: ${match[1]}`);
}

const elements = new Map();
function getElement(id) {
  if (elements.has(id)) return elements.get(id);
  const handlers = {};
  const classes = new Set();
  const element = {
    id, handlers, innerHTML: '', textContent: '', className: '', value: 0, disabled: false,
    clientWidth: id === 'tree' ? 5250 : 1100, parentElement: { clientWidth: 1100 },
    offsetHeight: id === 'tree' ? 1640 : id === 'flow-toolbar' ? 80 : 32,
    style: { setProperty(k, v) { this[k] = v; } },
    classList: {
      toggle(k, enabled) { if (enabled ?? !classes.has(k)) classes.add(k); else classes.delete(k); },
      add(...names) { names.forEach(k => classes.add(k)); },
      remove(...names) { names.forEach(k => classes.delete(k)); },
      contains(k) { return classes.has(k); }
    },
    addEventListener(type, fn) { handlers[type] = fn; },
    setAttribute(name, value) { this[name] = value; },
    querySelector(selector) { return getElement(id + '|' + selector); },
    scrollIntoView(options) { this.lastScroll = options; },
    focus(options) { this.lastFocus = options; },
    click() { handlers.click?.({ target: this }); }
  };
  elements.set(id, element);
  return element;
}
const document = {
  getElementById: getElement, querySelector: getElement, querySelectorAll() { return []; },
  addEventListener() {}, documentElement: getElement('html'), hidden: false
};
const window = { innerHeight: 720, addEventListener() {} };
const animationFrames = [];
const context = vm.createContext({
  document, window, location: { search: '' }, URLSearchParams, console, Map, Set,
  matchMedia: () => ({ matches: false, addEventListener() {} }),
  requestAnimationFrame(fn) { animationFrames.push(fn); },
  cancelAnimationFrame() {}, performance: { now: () => 0 }
});
new vm.Script(inline[1], { filename: file }).runInContext(context);
const demo = window.classificationDemo;
assert(demo && window.__ready, 'the real application must initialize');
for (const name of ['simulate', 'routeFor', 'canExpress', 'rootDecisionStats', 'getState', 'setExpressThreshold', 'getScalePlan', 'setScaleOptions', 'seek']) {
  assert.equal(typeof demo[name], 'function', `missing demo API: ${name}`);
}
assert.equal(demo.products.length, 500);
assert.equal(demo.categories.length, 10);
const productIds = Array.from(demo.products, p => p.id).sort();
assert.equal(new Set(productIds).size, 500);
assert.equal(demo.getState().expressThreshold, 95, 'default direct-leaf threshold');

const expressKinds = ['expressStart', 'expressEntry', 'expressDescend', 'expressLand'];
const isExpress = route => route.some(r => r.kind === 'expressStart');
const ids = entries => Array.from(entries, e => e.product.id).sort();
const expectIds = (actual, expected, message) => assert.deepEqual(ids(actual), ids(expected), message);
const rootNeedsImage = p => !demo.canExpress(p);
const qualifies = p => Boolean(p.textEnough && p.leafConsistent && p.leafScore >= demo.getState().expressThreshold && demo.validLeaf(p));
const summaries=[];
function checkRoutes(){
 const counts={express:0,quality:0,specialist:0,frontier:0,blind:0,human:0};
 for(const p of demo.products){
  assert.equal(demo.canExpress(p),qualifies(p));
  const r=demo.routeFor(p,70);assert.equal(r[0].kind,'classify');assert.equal(r[0].start,p.rootStart);
  for(let i=1;i<r.length;i++)assert.equal(r[i].start,r[i-1].end,'contiguous route');
  assert.equal(r.at(-1).end,Infinity);
  if(qualifies(p)){counts.express++;assert.deepEqual(Array.from(r,s=>s.kind),['classify',...expressKinds,'done']);}
  else{counts.quality++;assert.equal(r[1].kind,'quality');
   if(p.imageBad){assert.equal(r.at(-1).kind,'human');assert(!r.some(s=>s.kind==='specialist'));}
   else {assert.equal(r[2].kind,'specialist');assert.equal(r.filter(s=>s.kind==='specialist').length,1);counts.specialist++;}
  }
  for(const k of ['frontier','blind'])if(r.some(s=>s.kind===k))counts[k]++;
  if(r.at(-1).kind==='human')counts.human++;
  if(r.at(-1).kind==='done'){assert.equal(r.at(-1).stage,p.path.length-1);assert(r.at(-1).reviewScore<2);assert.equal(r.at(-1).candidateLeafId,p.leafId);}
  assert(!r.some(s=>s.kind==='average'),'raw scores must never be averaged');
 }
 for(const n of Object.values(counts))assert(n>0,'all routes are represented');return counts;
}
const base=demo.products.find(qualifies);assert(base);
for(const patch of [{textEnough:false},{leafConsistent:false},{leafScore:94},{leafId:'missing-leaf'}])assert(!demo.canExpress({...base,...patch}));
// High top-level evidence is insufficient without actual final-leaf evidence.
assert(!demo.canExpress({...base,leafScore:94,sol:[99,99,99,99]}));
function verifyTimeline(renderEveryFrame) {
  const plan = demo.getScalePlan();
  const previousDone = new Set();
  let sawExpress = false, sawHierarchy = false, sawImage = false, sawConcurrent = false;
  for (let t = 0; t <= demo.maxTime; t++) {
    const entries = demo.simulate(t, 70);
    assert.equal(entries.length, 500);
    assert.deepEqual(ids(entries), productIds, `t=${t}: conserve all product IDs`);
    assert(entries.every(e => e.state), `t=${t}: every product has a state`);
    const stats = demo.rootDecisionStats(entries, t);
    for (const key of ['decided', 'direct', 'needs', 'express', 'hierText', 'quality', 'image']) assert(Array.isArray(stats[key]), `stats.${key} must be an array`);
    const decided = entries.filter(e => e.route[0].end <= t);
    expectIds(stats.decided, decided, `t=${t}: root decisions`);
    expectIds(stats.express, decided.filter(e => qualifies(e.product)), `t=${t}: direct-leaf counter`);
    expectIds(stats.hierText, decided.filter(e => !qualifies(e.product) && !rootNeedsImage(e.product)), `t=${t}: hierarchy text counter`);
    expectIds(stats.needs, decided.filter(e => rootNeedsImage(e.product)), `t=${t}: image-needed counter`);
    expectIds(stats.quality, entries.filter(e => e.route.some(r => r.stage === 0 && r.kind === 'quality' && r.start <= t)), `t=${t}: quality counter`);
    expectIds(stats.image, entries.filter(e => e.route.some(r => r.stage === 0 && ['specialist'].includes(r.kind) && r.start <= t)), `t=${t}: actual image-call counter`);
    assert.equal(stats.direct.length, stats.express.length + stats.hierText.length);
    assert.equal(stats.decided.length, stats.direct.length + stats.needs.length);
    assert.equal(new Set([...ids(stats.direct), ...ids(stats.needs)]).size, stats.decided.length);
    const snapshot = plan.snapshots[t];
    assert(snapshot, `scale plan covers scene ${t}`);
    const arrived = entries.filter(e => e.product.start <= t);
    const pendingIds = Array.from(arrived.filter(e => e.product.rootStart > t), e => e.product.id);
    assert.deepEqual(Array.from(snapshot.queued), pendingIds, `t=${t}: exact FIFO queue matches animation`);
    assert.equal(entries.filter(e => e.state.kind === 'rootwait').length, snapshot.queued.length);
    assert.equal(entries.filter(e => e.state.kind === 'classify' && e.state.stage === 0).length, snapshot.busy);
    assert(snapshot.busy <= snapshot.replicas);
    assert(snapshot.replicas + snapshot.warming <= demo.getState().autoscaleMax);
    if (!demo.getState().autoscaleEnabled) assert.equal(snapshot.replicas, 10);
    if (t < 50) {
      assert.equal(entries.filter(e => e.product.start === t).length, 10, `scene ${t}: ten new inputs`);
      assert.equal(snapshot.arrivals.length, 10);
    } else assert.equal(snapshot.arrivals.length, 0);
    const completed = entries.filter(e => e.state.kind === 'done');
    const doneIds = new Set(ids(completed));
    for (const id of previousDone) assert(doneIds.has(id), `${id} disappeared from its final basket at scene ${t}`);
    completed.forEach(e => {
      assert.equal(e.state.stage, e.product.path.length - 1);
      previousDone.add(e.product.id);
    });
    sawExpress ||= entries.some(e => expressKinds.includes(e.state.kind));
    sawHierarchy ||= entries.some(e => e.state.stage > 0 && e.state.kind === 'descend');
    sawImage ||= entries.some(e => e.state.stage === 0 && ['specialist'].includes(e.state.kind));
    sawConcurrent ||= entries.some(e => e.state.stage === 0 && e.state.kind === 'classify') && entries.some(e => expressKinds.includes(e.state.kind) || e.state.stage > 0 && e.state.kind === 'descend');
    if (renderEveryFrame) {
      demo.seek(t);
      assert.equal(String(getElement('express-count').textContent), String(stats.express.length));
      assert.equal(String(getElement('express-active').textContent), String(entries.filter(e => expressKinds.includes(e.state.kind)).length));
      assert.equal(String(getElement('express-completed').textContent), String(completed.filter(e => isExpress(e.route)).length));
      assert.equal(+getElement('express-count').textContent, +getElement('express-active').textContent + +getElement('express-completed').textContent, 'all decided direct products are either moving or in final baskets');
      assert.equal(String(getElement('root-text-count').textContent), stats.direct.length + '개');
      assert.equal(String(getElement('root-need-count').textContent), stats.needs.length + '개');
      assert(getElement('root-image-counts').textContent.includes('전용 이미지 ' + stats.image.length));
      assert.equal(+getElement('scale-queued').textContent, snapshot.queued.length);
      assert.equal(+getElement('scale-busy').textContent, snapshot.busy);
      for (const leaf of demo.leaves) {
        const c=leaf.id;
        const basketIds = completed.filter(e => e.product.leafId === c).map(e => e.product.id).sort();
        const renderedIds = [...getElement('basket-list-' + c).innerHTML.matchAll(/<li>(P\d+)\s*·/g)].map(m => m[1]).sort();
        assert.deepEqual(renderedIds, Array.from(basketIds), `basket ${c} at scene ${t}: exact IDs are preserved in real DOM list`);
      }
    }
  }
  assert(sawExpress && sawHierarchy && sawImage && sawConcurrent, 'all routes are visible while upstream and downstream work overlap');
  const final = demo.simulate(demo.maxTime, 70);
  assert(final.every(e => ['done', 'human'].includes(e.state.kind)), 'the actual last scene must show all 500 terminal states');
  for(const e of final.filter(e=>e.state.kind==='human')){
    assert(demo.maxTime>=e.state.start+demo.treeGeometry.humanTransitFrames,'every autoscale mode includes the last human arrival');
    assert(demo.humanTransferFor(e,demo.treeGeometry.width,demo.maxTime).arrived,'no human flight is left unfinished at the final scene');
  }
  expectIds(demo.simulate(demo.maxTime + 100, 70).filter(e => e.state.kind === 'done'), final.filter(e => e.state.kind === 'done'), 'final baskets persist after the timeline');
}

summaries.push({ mode: 'default', routes: checkRoutes(), maxTime: demo.maxTime });
verifyTimeline(true);

// Read real token transforms at each direct-route waypoint, not just route labels.
const moving = demo.products.find(p => qualifies(p));
const route = demo.routeFor(moving, 70);
const positions = [];
for (const kind of [...expressKinds, 'done']) {
  const segment = route.find(r => r.kind === kind);
  demo.seek(segment.start);
  const entry = demo.simulate(segment.start, 70).find(e => e.product.id === moving.id);
  assert.equal(entry.state.kind, kind);
  const token = getElement('token-' + moving.id);
  if (kind !== 'done') assert(!token.className.split(/\s+/).includes('hidden'), `${moving.id} must remain genuinely visible during ${kind}`);
  const transform = token.style.transform;
  const match = transform?.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
  assert(match, `${kind}: real token DOM must receive a finite translate transform`);
  const point = { kind, x: +match[1], y: +match[2] };
  assert(Number.isFinite(point.x) && Number.isFinite(point.y));
  positions.push(point);
}
assert(new Set(positions.slice(0, 4).map(p => p.x + ',' + p.y)).size >= 3, 'direct-route animation must visibly move through distinct waypoints');
assert(positions[3].y > positions[1].y, 'direct route must descend from its entry lane to the final basket');
const categoryX = demo.leaves.find(leaf=>leaf.id===moving.leafId).x / demo.treeGeometry.width * getElement('tree').clientWidth;
assert(Math.abs(positions.at(-1).x + 44 - categoryX) < 100, 'completed token must align with its own actual category basket');
assert(Math.abs(positions[3].y - positions.at(-1).y) < 200, 'landing animation must reach the actual final basket area');

// Both API and actual slider must recalculate routes from unchanged products.
const crossing = demo.products.find(p => p.textEnough && p.sol[0] >= 90 && p.leafConsistent && p.leafScore >= 90 && p.leafScore < 99);
assert(crossing, 'the sample set must include a threshold-sensitive leaf');
demo.setExpressThreshold(90);
assert.equal(demo.getState().expressThreshold, 90);
assert(isExpress(demo.routeFor(crossing, 70)));
demo.setExpressThreshold(99);
assert.equal(demo.getState().expressThreshold,99);
assert(!isExpress(demo.routeFor(crossing,70)), 'raising the model threshold must change the route');
demo.setExpressThreshold(95);

for (const enabled of [true, false]) {
  for (const max of [10, 15, 20]) {
    demo.setScaleOptions(enabled, max);
    assert.equal(demo.getState().autoscaleEnabled, enabled);
    assert.equal(demo.getState().autoscaleMax, max);
    assert.equal(+getElement('quick-timeline').max, demo.maxTime);
    checkRoutes();
    verifyTimeline(false);
    summaries.push({ enabled, max, drainFrame: demo.getScalePlan().drainFrame, maxTime: demo.maxTime });
  }
}
demo.setScaleOptions(true, 20);
demo.setExpressThreshold(95);
demo.seek(demo.maxTime);
// The landing must operate the same engine, including replay and paused seeking.
assert.match(getElement('hero-play-label').textContent, /다시 재생/);
getElement('hero-play').click();
assert.equal(demo.getState().time, 0);
assert.equal(demo.getState().playing, true);
assert.equal(getElement('simulation-panel').classList.contains('flow-fit'), true);
assert.equal(getElement('flow-fit-toggle')['aria-pressed'], 'true');
assert.equal(getElement('simulation-panel').lastScroll.block, 'start');
assert.equal(getElement('quick-play').lastFocus.preventScroll, true);
const fittedScale=+getElement('tree').style['--fit-scale'];
assert(fittedScale*demo.treeGeometry.width<=1100 && fittedScale*1640+80+32+32+44<=720.001, 'whole flow must fit in both viewport dimensions');
assert.equal(getElement('hero-play')['aria-pressed'], 'true');
assert.match(getElement('hero-play-label').textContent, /일시정지/);
getElement('hero-play').click();
assert.equal(demo.getState().playing, false);
const viewState=JSON.stringify(demo.getState());
getElement('flow-fit-toggle').click();
assert.equal(getElement('simulation-panel').classList.contains('flow-fit'), true);
assert.equal(+getElement('tree').style['--fit-scale'],fittedScale);
getElement('flow-fit-toggle').click();
assert.equal(+getElement('tree').style['--fit-scale'],fittedScale);
assert.equal(JSON.stringify(demo.getState()),viewState,'view changes must preserve playback and product state');
demo.seek(35);
assert.equal(getElement('hero-time').textContent, getElement('quick-time').textContent);
const currentEntries=demo.simulate(demo.getState().time,demo.getState().threshold);
assert.equal(+getElement('hero-done').textContent,currentEntries.filter(e=>e.state.kind==='done').length);
assert.equal(+getElement('hero-human').textContent,currentEntries.filter(e=>e.state.kind==='human').length);
getElement('hero-reset').click();
assert.equal(demo.getState().time, 0);
assert.equal(demo.getState().playing, false);
assert.equal(getElement('hero-progress').style.width, '0%');

// Authored discussion scenes remain independent from the classification engine.
const unchangedState = JSON.stringify(demo.getState());
getElement('case-supported').click();
getElement('debate-next').click();
assert.equal(getElement('debate-stage-1')['aria-pressed'], 'true');
getElement('debate-next').click();
assert.match(getElement('debate-result').textContent, /불확실 \+1.*해결 \+0 = 누적 1점.*최종 분류/);
getElement('case-missing').click();
assert.equal(getElement('debate-stage-0')['aria-pressed'], 'true');
getElement('debate-stage-2').click();
assert.match(getElement('debate-result').textContent, /불확실 \+1.*미해결 \+2 = 누적 3점.*사람 검수/);
getElement('debate-next').click();
assert.equal(getElement('debate-stage-0')['aria-pressed'], 'true');
assert.equal(JSON.stringify(demo.getState()), unchangedState);
// The removed UI must not remain as hidden controls or disclosures.
for(const id of ['play','step','reset','timeline','speed','threshold','express-threshold','count-done','human-queue-list','debate-autoplay','debate-turn-label']) assert(!staticIds.includes(id), `removed UI remains: ${id}`);
assert(!html.includes('class="br-transcript"'));
assert(!html.includes('class="pal-evidence"'));
getElement('quick-reset').click();
getElement('quick-step').click();
assert.equal(demo.getState().time,1);
getElement('quick-timeline').handlers.input({target:{value:'20'}});
assert.equal(demo.getState().time,20);
getElement('quick-reset').click();
assert.equal(demo.getState().time,0);
console.log('PASS: landing play/pause/replay/reset shares engine; hero counters match; both authored discussion outcomes and reset; discussion does not mutate simulated products.');
console.log(JSON.stringify({ passed: true, products: 500, positions, scenarios: summaries }, null, 2));
console.log('PASS: real inline application; text / specialist / frontier / blind cascade; evidence gates; exact product IDs and counters; persistent final baskets; ten inputs per scene; autoscale 10/15/20 on/off; threshold policy; actual DOM movement.');
