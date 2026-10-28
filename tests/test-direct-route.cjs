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
for (const id of ['express-count', 'express-active', 'express-completed', 'express-lines', 'express-threshold', 'express-threshold-value']) {
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
    clientWidth: id === 'tree' ? 2025 : 1100, parentElement: { clientWidth: 1100 },
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
    click() { handlers.click?.({ target: this }); }
  };
  elements.set(id, element);
  return element;
}
const document = {
  getElementById: getElement, querySelector: getElement, querySelectorAll() { return []; },
  addEventListener() {}, documentElement: getElement('html'), hidden: false
};
const window = { addEventListener() {} };
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
assert.equal(demo.categories.length, 9);
const productIds = Array.from(demo.products, p => p.id).sort();
assert.equal(new Set(productIds).size, 500);
assert.equal(demo.getState().expressThreshold, 95, 'default direct-leaf threshold');

const expressKinds = ['expressStart', 'expressEntry', 'expressDescend', 'expressLand'];
const isExpress = route => route.some(r => r.kind === 'expressStart');
const ids = entries => Array.from(entries, e => e.product.id).sort();
const expectIds = (actual, expected, message) => assert.deepEqual(ids(actual), ids(expected), message);
const rootNeedsImage = p => !p.textEnough || p.sol[0] < 90;
const qualifies = p => Boolean(p.textEnough && p.sol[0] >= 90 && p.leafConsistent && p.leafScore >= demo.getState().expressThreshold);
const summaries = [];

function checkRoutes() {
  const counts = { express: 0, hierarchicalText: 0, quality: 0, human: 0 };
  for (const p of demo.products) {
    assert.equal(typeof p.leafScore, 'number', `${p.id}: final-leaf evidence score`);
    assert.equal(typeof p.leafConsistent, 'boolean', `${p.id}: parent/leaf consistency evidence`);
    assert.equal(demo.canExpress(p), qualifies(p), `${p.id}: all direct conditions must be required`);
    const route = demo.routeFor(p, 70);
    assert.equal(route[0].kind, 'classify');
    assert.equal(route[0].stage, 0);
    assert.equal(route[0].start, p.rootStart);
    for (let i = 1; i < route.length; i++) assert.equal(route[i].start, route[i - 1].end, `${p.id}: contiguous route`);
    assert.equal(route.at(-1).end, Infinity, `${p.id}: final state persists`);
    if (qualifies(p)) {
      counts.express++;
      assert.deepEqual(Array.from(route, r => r.kind), ['classify', ...expressKinds, 'done'], `${p.id}: direct means skipping every intermediate/image/queue call`);
      assert.equal(route.at(-1).stage, demo.categories[p.cat].path.length - 1, `${p.id}: land in the actual category's final basket`);
    } else if (rootNeedsImage(p)) {
      counts.quality++;
      const quality = route.find(r => r.stage === 0 && r.kind === 'quality');
      assert(quality, `${p.id}: insufficient root text must keep its quality gate`);
      assert(!isExpress(route), `${p.id}: insufficient evidence cannot use the direct route`);
      const image = route.find(r => r.stage === 0 && ['average', 'image'].includes(r.kind));
      if (p.imageBad) {
        assert(!image, `${p.id}: a poor image must not call the image classifier`);
        assert.equal(route.at(-1).kind, 'human');
      } else assert(image && image.start >= quality.end, `${p.id}: image analysis must follow image quality`);
    } else {
      counts.hierarchicalText++;
      assert(route.some(r => r.kind === 'textpass' && r.stage === 0), `${p.id}: keep the text-only hierarchical branch`);
      assert(route.some(r => r.kind === 'classify' && r.stage > 0), `${p.id}: continue intermediate classification`);
      assert(!route.some(r => r.kind === 'quality' && r.stage === 0));
      assert(!isExpress(route));
    }
    if (!qualifies(p) && route.at(-1).kind === 'done') {
      const lastStage = demo.categories[p.cat].path.length - 1;
      const finalImage = route.find(r => r.stage === lastStage && ['image', 'average'].includes(r.kind));
      assert(finalImage, `${p.id}: every non-direct completed product needs final-leaf image validation`);
      assert(route.some(r => r.kind === 'quality' && r.end <= finalImage.start), `${p.id}: final-leaf image validation follows a completed quality check`);
      assert.equal(p.imageBad, false, `${p.id}: bad images cannot auto-complete`);
      assert(p.agree[lastStage], `${p.id}: conflicting final-leaf evidence cannot auto-complete`);
    }
    for (const image of route.filter(r => ['image', 'average'].includes(r.kind))) {
      assert(route.some(r => r.kind === 'quality' && r.end <= image.start), `${p.id}: every image call must follow image quality`);
    }
    if (route.at(-1).kind === 'human') counts.human++;
  }
  assert(counts.express && counts.hierarchicalText && counts.quality, 'all three distinct routing paths must exist');
  return counts;
}

const base = demo.products.find(p => qualifies(p));
assert(base, 'the synthetic data must include a direct-route product');

// Even an all-high-score hierarchical route still validates its final leaf by image.
const finalStage = demo.categories[base.cat].path.length - 1;
const leafProbe = {
  ...base, leafScore: 94, textEnough: true, imageBad: false,
  sol: Array.from(base.sol, () => 99), image: Array.from(base.image, () => 98),
  agree: Array.from(base.agree, () => true)
};
const validatedLeafRoute = demo.routeFor(leafProbe, 70);
assert.equal(validatedLeafRoute.at(-1).kind, 'done');
assert(validatedLeafRoute.some(r => r.stage === finalStage && r.kind === 'quality'));
assert(validatedLeafRoute.some(r => r.stage === finalStage && r.kind === 'image'));
const badLeafRoute = demo.routeFor({ ...leafProbe, imageBad: true }, 70);
assert.equal(badLeafRoute.at(-1).kind, 'human', 'a bad final-leaf image stops hierarchical automatic completion');
assert.equal(badLeafRoute.at(-1).stage, finalStage);
assert(!badLeafRoute.some(r => ['image', 'average'].includes(r.kind)), 'a failed quality check prevents all image-model calls');
const conflictAgree = Array.from(leafProbe.agree);
conflictAgree[finalStage] = false;
const conflictLeafRoute = demo.routeFor({ ...leafProbe, agree: conflictAgree }, 70);
assert.equal(conflictLeafRoute.at(-1).kind, 'human', 'conflicting final-leaf image evidence stops automatic completion');
assert.equal(conflictLeafRoute.at(-1).stage, finalStage);
assert(conflictLeafRoute.some(r => r.stage === finalStage && r.kind === 'image'));

// A high root score alone never establishes the final leaf.
for (const [label, patch] of [
  ['missing text', { textEnough: false }],
  ['inconsistent leaf', { leafConsistent: false }],
  ['weak leaf', { leafScore: 94 }],
  ['weak root', { sol: [89, ...base.sol.slice(1)] }]
]) {
  const synthetic = { ...base, sol: [99, ...base.sol.slice(1)], ...patch };
  assert.equal(demo.canExpress(synthetic), false, label);
  assert(!isExpress(demo.routeFor(synthetic, 70)), `${label}: must not secretly take the direct route`);
}

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
    expectIds(stats.image, entries.filter(e => e.route.some(r => r.stage === 0 && ['image', 'average'].includes(r.kind) && r.start <= t)), `t=${t}: actual image-call counter`);
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
      assert.equal(e.state.stage, demo.categories[e.product.cat].path.length - 1);
      previousDone.add(e.product.id);
    });
    sawExpress ||= entries.some(e => expressKinds.includes(e.state.kind));
    sawHierarchy ||= entries.some(e => e.state.stage > 0 && e.state.kind === 'classify');
    sawImage ||= entries.some(e => e.state.stage === 0 && ['image', 'average'].includes(e.state.kind));
    sawConcurrent ||= entries.some(e => e.state.stage === 0 && e.state.kind === 'classify') && entries.some(e => expressKinds.includes(e.state.kind) || e.state.stage > 0 && e.state.kind === 'classify');
    if (renderEveryFrame) {
      demo.seek(t);
      assert.equal(String(getElement('express-count').textContent), String(stats.express.length));
      assert.equal(String(getElement('express-active').textContent), String(entries.filter(e => expressKinds.includes(e.state.kind)).length));
      assert.equal(String(getElement('express-completed').textContent), String(completed.filter(e => isExpress(e.route)).length));
      assert.equal(+getElement('express-count').textContent, +getElement('express-active').textContent + +getElement('express-completed').textContent, 'all decided direct products are either moving or in final baskets');
      assert.equal(String(getElement('root-text-count').textContent), stats.direct.length + '개');
      assert.equal(String(getElement('root-need-count').textContent), stats.needs.length + '개');
      assert(getElement('root-image-counts').textContent.includes('이미지 모델 호출 ' + stats.image.length));
      assert.equal(+getElement('scale-queued').textContent, snapshot.queued.length);
      assert.equal(+getElement('scale-busy').textContent, snapshot.busy);
      for (let c = 0; c < demo.categories.length; c++) {
        const basketIds = completed.filter(e => e.product.cat === c).map(e => e.product.id).sort();
        const renderedIds = [...getElement('basket-list-' + c).innerHTML.matchAll(/<li>(P\d+)\s*·/g)].map(m => m[1]).sort();
        assert.deepEqual(renderedIds, Array.from(basketIds), `basket ${c} at scene ${t}: exact IDs are preserved in real DOM list`);
      }
    }
  }
  assert(sawExpress && sawHierarchy && sawImage && sawConcurrent, 'all routes are visible while upstream and downstream work overlap');
  const final = demo.simulate(demo.maxTime, 70);
  assert(final.every(e => ['done', 'human'].includes(e.state.kind)), 'the actual last scene must show all 500 terminal states');
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
const categoryX = demo.categories[moving.cat].x / 100 * getElement('tree').clientWidth;
assert(Math.abs(positions.at(-1).x + 62 - categoryX) < 100, 'completed token must align with its own actual category basket');
assert(Math.abs(positions[3].y - positions.at(-1).y) < 200, 'landing animation must reach the actual final basket area');

// Both API and actual slider must recalculate routes from unchanged products.
const crossing = demo.products.find(p => p.textEnough && p.sol[0] >= 90 && p.leafConsistent && p.leafScore >= 90 && p.leafScore < 99);
assert(crossing, 'the sample set must include a threshold-sensitive leaf');
demo.setExpressThreshold(90);
assert.equal(demo.getState().expressThreshold, 90);
assert(isExpress(demo.routeFor(crossing, 70)));
const slider = getElement('express-threshold');
assert.equal(typeof slider.handlers.input, 'function');
slider.handlers.input({ target: { value: '99' } });
assert.equal(demo.getState().expressThreshold, 99);
assert(!isExpress(demo.routeFor(crossing, 70)), 'raising the slider threshold must actually change the route');
assert(String(getElement('express-threshold-value').textContent).includes('99'));
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
assert.equal(getElement('hero-play')['aria-pressed'], 'true');
assert.match(getElement('hero-play-label').textContent, /일시정지/);
getElement('hero-play').click();
assert.equal(demo.getState().playing, false);
demo.seek(35);
assert.equal(getElement('hero-time').textContent, getElement('quick-time').textContent);
assert.equal(+getElement('hero-done').textContent, +getElement('count-done').textContent);
assert.equal(+getElement('hero-human').textContent, +getElement('count-human').textContent);
assert.equal(+getElement('hero-active').textContent, +getElement('count-active').textContent + +getElement('count-review').textContent);
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
assert.match(getElement('debate-result').textContent, /보호 케이스/);
getElement('case-missing').click();
assert.equal(getElement('debate-stage-0')['aria-pressed'], 'true');
getElement('debate-stage-2').click();
assert.match(getElement('debate-result').textContent, /사람 확인 대기.*미확정/);
getElement('debate-next').click();
assert.equal(getElement('debate-stage-0')['aria-pressed'], 'true');
assert.equal(JSON.stringify(demo.getState()), unchangedState);
// Model turns advance separately, stop after the final turn, and reset on scenario changes.
getElement('case-supported').click();
const speakerNames = ['Qwen3.8 27B', 'Nemotron 3 Ultra', 'North Mini Code'];
for (let turn = 0; turn < 9; turn++) {
  assert(getElement('debate-turn-label').textContent.includes(`${turn + 1} / 9`));
  assert(getElement('debate-turn-label').textContent.includes(speakerNames[turn % 3]));
  for (let speaker = 0; speaker < 3; speaker++) {
    assert.equal(getElement(`speech-${speaker}`).classList.contains('current-speaker'), speaker === turn % 3);
    assert.equal(getElement(`model-card-${speaker}`).classList.contains('current-speaker'), speaker === turn % 3);
  }
  if (turn < 8) getElement('debate-speaker-next').click();
}
getElement('debate-autoplay').click();
assert.equal(getElement('debate-autoplay')['aria-pressed'], 'true');
assert.match(getElement('debate-turn-label').textContent, /1 \/ 9/);
for (let tick = 1; tick <= 9; tick++) animationFrames.at(-1)(tick * 4200);
assert.equal(getElement('debate-autoplay')['aria-pressed'], 'false');
assert.match(getElement('debate-turn-label').textContent, /9 \/ 9/);
getElement('debate-autoplay').click();
getElement('case-missing').click();
assert.equal(getElement('debate-autoplay')['aria-pressed'], 'false');
assert.match(getElement('debate-turn-label').textContent, /1 \/ 9/);
assert.equal(JSON.stringify(demo.getState()), unchangedState);
console.log('PASS: nine model turns; one active speaker/card; autoplay completes; case changes stop and reset dialogue; product engine unchanged.');
console.log('PASS: landing play/pause/replay/reset shares engine; hero counters match; both authored discussion outcomes and reset; discussion does not mutate simulated products.');
console.log(JSON.stringify({ passed: true, products: 500, positions, scenarios: summaries }, null, 2));
console.log('PASS: real inline application; three routes; evidence gates; exact product IDs and counters; persistent final baskets; ten inputs per scene; autoscale 10/15/20 on/off; threshold slider; actual DOM movement.');
