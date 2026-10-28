'use strict';
const {demo,getElement,assert}=require('./app-harness.cjs');
const ledger=demo.reviewLedger('same-product');
ledger.record('recovery','branch',1,'복구 +1');ledger.record('recovery','branch',1,'복구 +1');assert.equal(ledger.score,1);
ledger.record('frontier','unresolved',1,'frontier +1');ledger.record('frontier','unresolved',1,'frontier +1');assert.equal(ledger.score,2);
ledger.record('blind','unresolved',2,'독립 비교 추가 +2');assert.equal(ledger.score,4,'different event additions accumulate');
const saved=ledger.snapshot();saved[0].points=100;assert.equal(ledger.score,4);
for(const p of demo.products){const r=demo.routeFor(p,70);let previous=0;
 for(const s of r){assert(s.reviewScore>=previous);previous=s.reviewScore;assert.equal(s.reviewScore,s.reviewEvents.reduce((sum,e)=>sum+e.points,0));assert.equal(new Set(Array.from(s.reviewEvents,e=>e.key)).size,s.reviewEvents.length);}
 if(r.at(-1).kind==='done')assert(r.at(-1).reviewScore<2);
 assert(r.filter(s=>s.kind==='recoverUp').length<=1,'recovery attempt bound');
}
for(const kind of ['resolved','conflict','low']){
 demo.showReviewExample(kind);const st=demo.getState(),entries=demo.simulate(st.time,st.threshold),id=getElement('review-focus').textContent.split(' · ')[0],focus=entries.find(e=>e.product.id===id);assert(focus);
 assert.equal(focus.state.kind,kind==='conflict'?'recoverUp':'blind');
 assert.equal(focus.route.at(-1).reviewScore,kind==='resolved'?1:kind==='conflict'?2:3);
 if(kind==='conflict'){assert(getElement('recovery-lines').innerHTML.includes('recovery-arrow'));assert.equal(getElement('recovery-callout').hidden,false);assert(!focus.route.some(s=>s.kind==='blind'));}
 demo.seek(focus.route.at(-1).start);assert(getElement('selected-review-score').textContent.includes(String(focus.route.at(-1).reviewScore)));assert.equal(focus.route.at(-1).kind,kind==='resolved'?'done':'human');
 getElement('quick-reset').click();assert.equal(demo.getState().time,0);assert.equal(+getElement('recovery-count').textContent,0);assert(getElement('selected-review-score').textContent.includes('0 / 2'));
}
console.log('PASS: retry dedup, additive causes, immutable snapshots, bounded actual branch recovery, immediate gate example buttons and reset.');
