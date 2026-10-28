'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('assert');
const html = fs.readFileSync(require('path').resolve(__dirname, '../index.html'), 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/);
assert(script, 'inline script must exist');
const markup=html.slice(0,html.indexOf('<script>'));
const staticIds=[...markup.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
assert.equal(new Set(staticIds).size,staticIds.length,'static HTML ids must be unique');
for(const match of script[1].matchAll(/\$\('([^']+)'\)/g))assert(staticIds.includes(match[1]),`missing static element: ${match[1]}`);
const elements = new Map();
function element(id) {
  const handlers = {};
  return {
    id, handlers, innerHTML:'', textContent:'', className:'', value:0, disabled:false,
    clientWidth:id==='tree'?2025:1100, parentElement:{clientWidth:1100},
    style:{setProperty(k,v){this[k]=v}},
    classList:{toggle(){}}, addEventListener(type,fn){handlers[type]=fn}, setAttribute(){},
    querySelector(selector){return getElement(id+'|'+selector)},
    click(){if(handlers.click)handlers.click({target:this})}
  };
}
function getElement(id){if(!elements.has(id))elements.set(id,element(id));return elements.get(id)}
const document={getElementById:getElement,querySelector:getElement,querySelectorAll(){return []},addEventListener(){},documentElement:getElement('html'),hidden:false};
const window={addEventListener(){}};
const context=vm.createContext({document,window,location:{search:''},matchMedia:()=>({matches:false,addEventListener(){}}),requestAnimationFrame(){},URLSearchParams,console,Map,Set});
new vm.Script(script[1],{filename:'inline-animation.js'}).runInContext(context);
const demo=window.classificationDemo;
assert.equal(demo.products.length,500);
assert.equal(new Set(demo.products.map(p=>p.id)).size,500);
assert.equal(demo.categories.length,9);
assert.equal(demo.maxTime,100);
assert.equal(+getElement('tree').style['--fit-scale'],1100/2025);
assert(html.includes('https://arxiv.org/html/2508.20013v2'));
assert(getElement('tree|.tree-lines').innerHTML.includes('M450 198 V218 H247 V236'));

let foundDirect=false,foundImage=false,foundBad=false,foundHighMissing=false,foundLaterImage=false;
for(const p of demo.products){
 const route=demo.routeFor(p,70),root=route.filter(r=>r.stage===0),q=root.find(r=>r.kind==='quality');
 const image=root.find(r=>r.kind==='average'||r.kind==='image');
 if(p.sol[0]>=90&&p.textEnough){assert(!q&&!image,`${p.id}: sufficient text must skip root image`);if(demo.canExpress(p))assert(root.some(r=>r.kind==='expressStart'),`${p.id}: express route must have a visible branch state`);else assert(root.some(r=>r.kind==='textpass'),`${p.id}: hierarchical text route must have a visible branch state`);foundDirect=true;if(route.some(r=>r.stage>0&&r.kind==='average'))foundLaterImage=true;}
 else{assert(q,`${p.id}: insufficient root text must request image quality`);foundImage=true;}
 if(p.sol[0]>=90&&!p.textEnough){assert(q,`${p.id}: missing evidence must not be ignored by high score`);foundHighMissing=true;}
 if(q&&p.imageBad){assert(!image,`${p.id}: bad image must not enter image model`);assert(root.some(r=>r.kind==='human'));foundBad=true;}
 if(image)assert(q&&q.end<=image.start,`${p.id}: quality gate must precede image analysis`);
}
assert(foundDirect&&foundImage&&foundBad&&foundHighMissing&&foundLaterImage);

const prior=Array.from({length:9},()=>[]);let overlap=false;
for(let t=0;t<=100;t++){
 const entries=demo.simulate(t,70),stats=demo.rootDecisionStats(entries,t);
 assert.equal(entries.length,500);
 assert.equal(stats.decided.length,stats.direct.length+stats.needs.length);
 assert(stats.image.length<=stats.quality.length&&stats.quality.length<=stats.needs.length);
 assert(stats.decided.length<=entries.filter(e=>e.product.start<=t).length);
 const snapshot=demo.getScalePlan().snapshots[t];
 if(t<50){assert.equal(entries.filter(e=>e.product.start===t).length,10);assert.equal(snapshot.arrivals.length,10);}
 assert.equal(entries.filter(e=>e.state.stage===0&&e.state.kind==='classify').length,snapshot.busy);
 assert.equal(entries.filter(e=>e.state.kind==='rootwait').length,snapshot.queued.length);
 assert(snapshot.busy<=snapshot.replicas);
 const active=entries.filter(e=>['classify','textpass','quality','image','average','review','queue'].includes(e.state.kind));
 if(active.some(e=>e.state.stage===0)&&active.some(e=>e.state.stage>=1))overlap=true;
 for(let c=0;c<9;c++){
  const current=entries.filter(e=>e.product.cat===c&&e.state.kind==='done').map(e=>e.product.id);
  assert(prior[c].every(id=>current.includes(id)),`basket ${c}: a completed item disappeared at ${t}`);prior[c]=current;
 }
}
assert(overlap,'first and later stages must run concurrently');
assert(demo.simulate(100,70).every(e=>['done','human'].includes(e.state.kind)));
demo.seek(2);
const visible=vm.runInContext('selectVisible(simulate(2,70))',context);
const textToken=visible.find(e=>e.state.kind==='textpass'),qualityToken=visible.find(e=>e.state.kind==='quality');
assert(textToken&&qualityToken,'both text-only and quality branches should be visible together');
const xFor=e=>+getElement('token-'+e.product.id).style.transform.match(/translate\(([-\d.]+)px/)[1];
assert(xFor(textToken)<2025/2&&xFor(qualityToken)>2025/2,'products must move to distinct left and right branches');
demo.seek(3);
const highButMissing=demo.simulate(3,70).find(e=>e.product.id==='P001');
assert(highButMissing.product.sol[0]>=90&&!highButMissing.product.textEnough&&highButMissing.state.kind==='average');
assert.notEqual(demo.scoreFor(highButMissing).mode,'텍스트 단독','an image fallback must not be described as text-only');
const conflicted=demo.products.find(p=>p.id==='P003'),conflictRoute=demo.routeFor(conflicted,70);
assert(conflictRoute.some(r=>r.stage===0&&r.kind==='average')&&!conflicted.agree[0]);
assert(conflictRoute.some(r=>r.stage===0&&r.kind==='review')&&conflictRoute.at(-1).kind==='human','candidate disagreement must never pass just because the average is high');
assert(!conflictRoute.some(r=>r.kind==='queue'),'a disagreement must not enter a later category');
const conflictState=conflictRoute.find(r=>r.stage===0&&r.kind==='review');
assert.equal(demo.scoreFor({product:conflicted,route:conflictRoute,state:conflictState}).mode,'후보 불일치 → 교차 검토','the active review card must describe the disagreement');
const synthetic={...conflicted,leafScore:80,textEnough:true,leafConsistent:true,imageBad:false,sol:[99,99,99,99],image:[1,1,1,1],agree:[true,true,true,true]};
const lowImageRoute=demo.routeFor(synthetic,70),lastStage=demo.categories[synthetic.cat].path.length-1;
assert(lowImageRoute.some(r=>r.stage===lastStage&&r.kind==='image')&&lowImageRoute.some(r=>r.stage===lastStage&&r.kind==='review'));
assert.equal(lowImageRoute.at(-1).kind,'human','a very low final image score requires human review');
assert.equal(demo.scoreFor({product:synthetic,route:lowImageRoute,state:lowImageRoute.find(r=>r.stage===lastStage&&r.kind==='review')}).mode,'추가 교차 검토','final image review must be labeled as review');
const moderateImageRoute=demo.routeFor({...synthetic,image:[65,65,65,65]},70);
assert(moderateImageRoute.some(r=>r.stage===lastStage&&r.kind==='review')&&moderateImageRoute.at(-1).kind==='done');
const expressEntry=demo.simulate(2,70).find(e=>e.state.kind==='expressStart');
assert(expressEntry&&demo.scoreFor(expressEntry).values.includes(String(expressEntry.product.leafScore))&&demo.scoreFor(expressEntry).values.includes(demo.categories[expressEntry.product.cat].leaf),'express cards must display the final-leaf score and destination');
demo.seek(30);
const stats=demo.rootDecisionStats(demo.simulate(30,70),30);
assert.equal(getElement('root-text-count').textContent,stats.direct.length+'개');
assert.equal(getElement('root-need-count').textContent,stats.needs.length+'개');
assert(getElement('root-image-counts').textContent.includes('이미지 모델 호출 '+stats.image.length));
assert.equal(+getElement('gpu-active').textContent,demo.simulate(30,70).filter(e=>e.state.stage===0&&['image','average'].includes(e.state.kind)).length);
assert.equal((getElement('worker-lanes').innerHTML.match(/class="worker-lane/g)||[]).length,20);
const snapshot=demo.getScalePlan().snapshots[30];
assert.equal(+getElement('scale-replicas').textContent,snapshot.replicas);
assert.equal(+getElement('scale-warming').textContent,snapshot.warming);
assert.equal(+getElement('scale-busy').textContent,snapshot.busy);
assert.equal(+getElement('scale-queued').textContent,snapshot.queued.length);
assert.equal(+getElement('count-rootwait').textContent,snapshot.queued.length);
assert.equal(+getElement('scale-work').textContent,demo.getScalePlan().snapshots.slice(0,31).reduce((sum,s)=>sum+s.replicas+s.warming,0));
assert.equal((getElement('worker-lanes').innerHTML.match(/worker-lane active/g)||[]).length,snapshot.busy);
assert.equal((getElement('worker-lanes').innerHTML.match(/worker-lane warming/g)||[]).length,snapshot.warming);
assert.equal((getElement('worker-lanes').innerHTML.match(/worker-lane reserved/g)||[]).length,20-snapshot.replicas-snapshot.warming);
assert.equal((getElement('arrival-list').innerHTML.match(/<span>/g)||[]).length,10);
demo.seek(100);
for(let c=0;c<9;c++)assert.equal(+getElement('basket-summary-'+c).textContent.match(/\((\d+)\)/)[1],prior[c].length);
getElement('quick-reset').click();assert.equal(demo.getState().time,0);
getElement('quick-step').click();assert.equal(demo.getState().time,1);
getElement('quick-timeline').handlers.input({target:{value:'45'}});assert.equal(demo.getState().time,45);
getElement('threshold').handlers.input({target:{value:'75'}});assert.equal(demo.getState().threshold,75);
const scaledDrain=demo.getScalePlan().drainFrame;
getElement('autoscale-enabled').handlers.change({target:{checked:false}});assert.equal(demo.getState().autoscaleEnabled,false);
assert.equal(demo.getScalePlan().drainFrame,100);assert(scaledDrain<demo.getScalePlan().drainFrame);
demo.seek(100);assert(demo.simulate(100,70).some(e=>!['done','human'].includes(e.state.kind)),'fixed mode must show remaining downstream work honestly');
assert(demo.maxTime>100,'the timeline must extend when processing continues beyond scene 100');
assert.equal(+getElement('quick-timeline').max,demo.maxTime);
demo.seek(demo.maxTime);assert(demo.simulate(demo.maxTime,70).every(e=>['done','human'].includes(e.state.kind)),'extended timeline must show all final states');
getElement('autoscale-enabled').handlers.change({target:{checked:true}});
getElement('autoscale-max').handlers.change({target:{value:'15'}});assert.equal(demo.getState().autoscaleMax,15);
assert(demo.getScalePlan().snapshots.every(s=>s.replicas+s.warming<=15));
demo.setScaleOptions(true,20);assert.equal(demo.maxTime,100);
const width=2025,height=1540,nodeWidth=204,nodeTop=[484,688,928,1168];
for(let i=0;i<demo.categories.length;i++){
 const x=demo.categories[i].x*width/100;
 assert(x-nodeWidth/2>=0&&x+nodeWidth/2<=width,`category ${i} must fit inside the tree`);
 if(i)assert(x-demo.categories[i-1].x*width/100>=nodeWidth,'category nodes must not overlap horizontally');
 assert(nodeTop[demo.categories[i].path.length-1]+130+132<=height,'the final basket must fit vertically');
}
demo.setExpressThreshold(90);
for(let t=0;t<=demo.maxTime;t++){
 demo.seek(t);
 for(const entry of demo.simulate(t,70).filter(e=>['expressStart','expressEntry','expressDescend','expressLand'].includes(e.state.kind))){
  const token=getElement('token-'+entry.product.id),match=token.style.transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
  assert(match&&!/\bhidden\b/.test(token.className),`${entry.product.id}: express item must remain visible`);
  const x=+match[1],y=+match[2];assert(x>=0&&x+124<=width&&y>=0&&y+47<=height,`${entry.product.id}: express item must fit in the tree`);
 }
}
demo.setExpressThreshold(95);
const expressedCategories=new Set(demo.products.filter(p=>demo.canExpress(p)).map(p=>p.cat));
assert(expressedCategories.size>=5,'direct path should demonstrate at least five different category baskets');
const finalStats=demo.rootDecisionStats(demo.simulate(100,70),100);
console.log('Synthetic stage-1 totals:',JSON.stringify({decided:finalStats.decided.length,express:finalStats.express.length,expressCategories:expressedCategories.size,textOnly:finalStats.direct.length,quality:finalStats.quality.length,imageCalls:finalStats.image.length}));
console.log('PASS: 500 products, 10 simultaneous inputs, text-only / quality / image / human routing, 9 persistent baskets, concurrent stages, controls and render counts.');
