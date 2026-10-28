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
    offsetHeight: id === 'tree' ? 1540 : id === 'flow-toolbar' ? 80 : 32,
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
assert.equal(demo.categories.length, 9);
const productIds = Array.from(demo.products, p => p.id).sort();
assert.equal(new Set(productIds).size, 500);
assert.equal(demo.getState().expressThreshold, 95, 'default direct-leaf threshold');

// The harness above executes the shipped page, including real render functions.
const ledger=demo.reviewLedger('same-product');
ledger.record('recovery','branch',1,'복구 경로 +1');
ledger.record('recovery','branch',1,'복구 경로 +1');
assert.equal(ledger.score,1,'same cause retry must not add points');
ledger.record('outcome','branch',1,'토론 후 충돌 +1');
assert.equal(ledger.score,2);
ledger.record('outcome','branch',2,'최종 확신 낮음 +2');
assert.equal(ledger.score,3,'low confidence replaces discussion +1, not stacks +1+2');
ledger.record('outcome','branch',1,'토론 후 충돌 +1');
assert.equal(ledger.score,3,'later weaker evidence cannot erase an existing risk');
const saved=ledger.snapshot();saved[0].points=100;assert.equal(ledger.score,3,'snapshots must not mutate ledger');

const base={...demo.products[0],id:'TEST',rootStart:0,start:0,cat:0,leafScore:80,leafConsistent:true,textEnough:true,imageBad:false,sol:[65,95,95,95],image:[87,95,95,95],agree:[true,true,true,true],reviewResults:{0:{confidence:87,agreed:true}}};
const success=demo.routeFor(base,70);
assert(success.some(r=>r.kind==='recoverUp'));
assert.equal(success.at(-1).kind,'done');assert.equal(success.at(-1).reviewScore,1);
assert.equal(success.find(r=>r.kind==='recoverStart').reviewScore,0,'no score before recovery starts');
assert.equal(success.find(r=>r.kind==='recoverUp').reviewScore,1);
const conflict=demo.routeFor({...base,agree:[false,true,true,true],reviewResults:{}},70);
assert.equal(conflict.at(-1).kind,'human');assert.equal(conflict.at(-1).reviewScore,2);
assert.equal(conflict.at(-1).reviewEvents.length,2);
const low=demo.routeFor({...base,sol:[99,99,99,99],image:[90,90,90,45],reviewResults:{}},70);
assert.equal(low.at(-1).kind,'human');assert.equal(low.at(-1).reviewScore,2);
assert(!low.some(r=>r.kind==='recoverUp'),'low final confidence alone contributes two');
const bad=demo.routeFor({...base,imageBad:true},70);
assert.equal(bad.at(-1).kind,'human');assert.equal(bad.at(-1).reviewScore,0);
assert(!bad.some(r=>r.kind==='image'||r.kind==='review'),'bad image hard gate remains');
const secondCause=demo.routeFor({...base,sol:[65,65,95,95],image:[87,87,95,95],reviewResults:{0:{confidence:87,agreed:true},1:{confidence:87,agreed:true}}},70);
assert.equal(secondCause.at(-1).kind,'human');assert.equal(secondCause.at(-1).reviewScore,2,'independent recovery causes accumulate');
assert(secondCause.at(-1).reviewEvents.every(e=>e.kind==='recovery'));

let recoveredDone=0,conflictHuman=0,lowHuman=0;
for(const product of demo.products){
 const route=demo.routeFor(product,70),last=route.at(-1);
 const repeated=demo.routeFor(product,70);
 assert.equal(JSON.stringify(route),JSON.stringify(repeated),'render/retry is deterministic');
 for(let i=0;i<route.length;i++){
  const r=route[i];assert.equal(r.reviewScore,r.reviewEvents.reduce((sum,e)=>sum+e.points,0));
  assert.equal(new Set(r.reviewEvents.map(e=>e.key)).size,r.reviewEvents.length);
  if(i){assert.equal(r.start,route[i-1].end);assert(r.reviewScore>=route[i-1].reviewScore);}
  if(r.reviewScore>=2)assert(['recoverUp','reviewResult','human'].includes(r.kind),'stop when threshold is reached');
  if(['recoverStart','recoverUp','recoverSearch','recoverDown'].includes(r.kind)){
   context.recoveryEntry={product,state:r,route};
   const point=vm.runInContext('position(recoveryEntry,2025,[])',context);
   assert(point.x>=0&&point.x+124<=2025&&point.y>=0&&point.y+47<=1540,product.id+': recovery token stays in tree');
  }
 }
 if(last.kind==='done')assert(last.reviewScore<2);
 if(last.kind==='done'&&last.reviewScore===1)recoveredDone++;
 if(last.kind==='human'&&last.reviewEvents.some(e=>e.label==='토론 후 충돌 +1'))conflictHuman++;
 if(last.kind==='human'&&last.reviewEvents.some(e=>e.label==='최종 확신 낮음 +2'))lowHuman++;
}
assert(recoveredDone&&conflictHuman&&lowHuman,'all example outcomes must exist');
for(const kind of ['resolved','conflict','low']){
 demo.showReviewExample(kind);
 const state=demo.getState(),entries=demo.simulate(state.time,state.threshold);
 const focusId=getElement('review-focus').textContent.split(' · ')[0],focus=entries.find(e=>e.product.id===focusId);
 assert(focus);assert.equal(focus.state.kind,kind==='low'?'review':'recoverUp');
 assert.equal(+getElement('review-queue-count').textContent,entries.filter(e=>e.state.kind==='human').length);
 if(kind!=='low'){assert(getElement('recovery-lines').innerHTML.includes('recovery-arrow'));assert.equal(getElement('recovery-callout').hidden,false);}
 demo.seek(focus.route.at(-1).start);
 assert(getElement('selected-review-score').textContent.includes(String(focus.route.at(-1).reviewScore)));
 if(kind==='resolved')assert.equal(focus.route.at(-1).kind,'done');else assert.equal(focus.route.at(-1).kind,'human');
 getElement('quick-reset').click();assert.equal(demo.getState().time,0);assert.equal(+getElement('recovery-count').textContent,0);assert.match(getElement('selected-review-score').textContent,/0 \/ 2/);
}
for(const enabled of [true,false])for(const max of [10,15,20]){
 demo.setScaleOptions(enabled,max);
 for(let t=0;t<=demo.maxTime;t++){
  const entries=demo.simulate(t,70);assert.equal(entries.length,500);assert(entries.every(e=>e.state));
 }
 assert(demo.simulate(demo.maxTime,70).every(e=>['done','human'].includes(e.state.kind)));
}
console.log(JSON.stringify({passed:true,recoveredDone,conflictHuman,lowHuman,checks:'dedup, replacement, gates, route continuity, score snapshots, sample buttons, reset, 500-item conservation, autoscale modes'}));
