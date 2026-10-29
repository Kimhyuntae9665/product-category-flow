'use strict';
const {demo,context,getElement,vm,assert}=require('./app-harness.cjs');
const ids=xs=>Array.from(xs,e=>e.product.id).sort();
let direct=0,specialist=0,frontier=0,blind=0;
for(const p of demo.products){const r=demo.routeFor(p,70);
 if(demo.canExpress(p)){direct++;assert(r.some(s=>s.kind==='expressStart'));assert(!r.some(s=>['quality','specialist','frontier','blind'].includes(s.kind)));}
 else{assert(r.some(s=>s.kind==='quality'));if(!p.imageBad){specialist++;assert(r.some(s=>s.kind==='specialist'));}}
 if(r.some(s=>s.kind==='frontier'))frontier++;if(r.some(s=>s.kind==='blind'))blind++;
}
assert(direct&&specialist&&frontier&&blind);
for(let t=0;t<=demo.maxTime;t++){
 const es=demo.simulate(t,70),st=demo.rootDecisionStats(es,t),snap=demo.getScalePlan().snapshots[t];assert.equal(es.length,500);assert(es.every(e=>e.state));
 assert.equal(st.decided.length,st.direct.length+st.needs.length);assert.equal(st.hierText.length,0,'sufficient leaf text always completes directly');
 assert(st.image.length<=st.quality.length&&st.quality.length<=st.needs.length);
 assert(st.frontier.length<=st.image.length&&st.blind.length<=st.frontier.length);
 assert.equal(es.filter(e=>e.state.kind==='rootwait').length,snap.queued.length);assert.equal(es.filter(e=>e.state.kind==='classify').length,snap.busy);
 if(t<50)assert.equal(es.filter(e=>e.product.start===t).length,10);
}
for(const kind of ['specialist','frontier','blind','compare','descend']){
 let entry;for(let t=0;t<=demo.maxTime&&!entry;t++)entry=demo.simulate(t,70).find(e=>e.state.kind===kind);
 assert(entry,kind+' has a real visible state');context.testSelected=entry.product.id;vm.runInContext('selected=testSelected',context);demo.seek(entry.state.start);const visible=vm.runInContext('selectVisible(simulate(time,threshold))',context);assert(visible.some(e=>e.state.kind===kind));
 const token=getElement('token-'+entry.product.id);
 assert.equal(token['aria-pressed'],'true',kind+' remains selected in the diagram');
 assert(!token.className.includes(' hidden'),kind+' remains visible without the parallel list');
 assert(getElement('review-focus').textContent.startsWith(entry.product.id+' · '),kind+' updates the retained review monitor');
}
for(const enabled of [true,false])for(const max of [10,15,20]){
 demo.setScaleOptions(enabled,max);const prior=new Set();for(let t=0;t<=demo.maxTime;t++){
 const es=demo.simulate(t,70),snap=demo.getScalePlan().snapshots[t];assert.equal(es.length,500);assert.equal(new Set(ids(es)).size,500);assert(es.every(e=>e.state));assert(snap.busy<=snap.replicas);assert(snap.replicas+snap.warming<=max);
 const done=new Set(ids(es.filter(e=>e.state.kind==='done')));for(const id of prior)assert(done.has(id));for(const id of done)prior.add(id);
 }assert(demo.simulate(demo.maxTime,70).every(e=>['done','human'].includes(e.state.kind)));
}
demo.setScaleOptions(true,20);demo.seek(30);const st=demo.rootDecisionStats(demo.simulate(30,70),30);assert.equal(getElement('root-text-count').textContent,st.direct.length+'개');assert.equal(getElement('root-need-count').textContent,st.needs.length+'개');assert(getElement('root-image-counts').textContent.includes('전용 이미지 '+st.image.length));
getElement('quick-reset').click();assert.equal(demo.getState().time,0);getElement('quick-step').click();assert.equal(demo.getState().time,1);getElement('quick-timeline').handlers.input({target:{value:'45'}});assert.equal(demo.getState().time,45);getElement('threshold').handlers.input({target:{value:'75'}});assert.equal(demo.getState().threshold,75);
console.log(JSON.stringify({passed:true,direct,specialist,frontier,blind,checks:'actual inline engine, stage states, strict escalation subsets, FIFO, conservation, baskets, autoscale six modes, controls'}));
