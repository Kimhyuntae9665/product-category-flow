'use strict';
const {demo,context,getElement,vm,assert,staticIds}=require('./app-harness.cjs');
const g=demo.treeGeometry;
assert.equal(g.width,5250);assert.equal(g.height,1640);assert.equal(g.contentWidth,4200);
assert.equal(g.expressX,4530);assert.equal(g.humanLaneX,4650);assert.equal(g.humanTransitFrames,3);
assert.deepEqual(JSON.parse(JSON.stringify(g.humanSector)),{x:4720,y:484,width:490,height:1050});
for(const id of ['human-sector','human-sector-total','human-sector-moving','human-sector-arrived','human-sector-list','human-flight-label'])assert(staticIds.includes(id),'dedicated human sector element: '+id);
for(const key of ['humanTransferFor','position','showHumanTransferExample'])assert.equal(typeof demo[key],'function','public transfer API: '+key);
const rightmost=Math.max(...Array.from(demo.nodes,n=>n.px+n.width/2),...Array.from(demo.leaves,l=>l.x+44));
demo.leaves.forEach((leaf,index)=>assert.equal(leaf.x,115+index*100+leaf.cat*30,'existing category/basket physical coordinates are preserved'));
assert(rightmost<=g.contentWidth,'all original category nodes and baskets stay in the 4200px content area');
assert(g.expressX-44-rightmost>=350,'express ticket has at least 350px clear space beyond the last category');
assert(g.expressX+44<g.humanLaneX-44,'express and human lanes have separate full ticket widths');
assert(g.humanLaneX+44<g.humanSector.x,'transfer lane clears the sector boundary');
assert(g.humanSector.x+g.humanSector.width<=g.width);
assert(g.humanSector.y+g.humanSector.height<=g.height);
const near=(a,b,message)=>assert(Math.abs(a-b)<1e-7,message+': '+a+' vs '+b);
const samePoint=(a,b,message)=>{near(a.x,b.x,message+' x');near(a.y,b.y,message+' y');};
const pointInside=(p,box,pad=0)=>p.x-pad>=box.x&&p.x+pad<=box.x+box.width&&p.y-17>=box.y&&p.y+17<=box.y+box.height;
const final=demo.simulate(demo.maxTime,70),humans=final.filter(e=>e.state.kind==='human');
const scored=humans.find(e=>e.state.reviewScore===2),badPhoto=humans.find(e=>e.state.reviewScore===0&&e.product.imageBad),onePoint=humans.find(e=>e.state.reviewScore===1);
assert(scored&&badPhoto&&onePoint,'sample includes threshold holds and separate zero/one-point holds');
const routesBefore=new Map(Array.from(demo.products,p=>[p.id,JSON.stringify(demo.routeFor(p,70))]));
const terminalIds=xs=>Array.from(xs,e=>e.product.id).sort();
for(const entry of [scored,badPhoto,onePoint]){
 context.transferSelected=entry.product.id;vm.runInContext('selected=transferSelected',context);
 const start=entry.state.start,waypoints=['source','departure','waypoint','destination'];
 for(let elapsed=0;elapsed<=3;elapsed++){
  const at=start+elapsed,transfer=demo.humanTransferFor(entry,g.width,at);
  assert.equal(transfer.elapsed,elapsed);assert.equal(transfer.moving,elapsed<3);assert.equal(transfer.arrived,elapsed>=3);
  samePoint(transfer.point,transfer[waypoints[elapsed]],'scene '+elapsed+' uses its actual waypoint');
  assert(transfer.point.x>=44&&transfer.point.x<=g.width-44&&transfer.point.y>=17&&transfer.point.y<=g.height-17,'moving ticket fits canvas');
  const half=demo.humanTransferFor(entry,g.width/2,at);
  for(const key of [...waypoints,'point']){near(half[key].x,transfer[key].x/2,'width scaling '+key);near(half[key].y,transfer[key].y,'unchanged vertical coordinate '+key);}
  demo.seek(at);if(entry===scored&&elapsed<3){assert.equal(getElement('human-flight-label').hidden,false);assert(getElement('human-flight-label').innerHTML.includes('2점 → 사람 검수'));assert(getElement('human-flight-label').innerHTML.includes(entry.product.id));}
  const actual=demo.simulate(at,70).find(e=>e.product.id===entry.product.id);
  assert.equal(actual.state.kind,'human','routing is already terminal while the ticket travels');
  assert.equal(actual.state.reviewScore,entry.state.reviewScore,'visual movement does not add or replace points');
  const position=demo.position(actual,g.width,demo.simulate(at,70));
  near(position.x+44,transfer.point.x,'position centers on transfer x');near(position.y+17,transfer.point.y,'position centers on transfer y');
 }
 const arrived=demo.humanTransferFor(entry,g.width,start+3);
 assert(pointInside(arrived.destination,g.humanSector,44),'destination ticket fits fully in the human sector');
 const list=getElement('human-sector-list').innerHTML;
 assert(list.includes('data-focus="'+entry.product.id+'"'),'selected arrived item is shown inside the sector');
 if(entry.state.reviewScore<2)assert(list.includes(entry.product.id+' · '+entry.state.reviewScore+'점 · 별도 보류'),'zero/one-point holds have a separate reason label');
 else assert(!list.includes(entry.product.id+' · '+entry.state.reviewScore+'점 · 별도 보류'),'threshold hold does not get the lower-score exception label');
 const late=demo.humanTransferFor(entry,g.width,start+50);samePoint(late.point,arrived.point,'arrived ticket remains at destination');assert(late.arrived&&!late.moving);
}
assert(scored.state.reviewScore>=2&&badPhoto.state.reviewScore<2,'image-quality holds remain distinct from accumulated threshold holds');
assert(!badPhoto.route.some(s=>s.kind==='specialist'),'bad image still blocks every image model');
for(const e of humans){
 assert(demo.maxTime>=e.state.start+g.humanTransitFrames,'timeline includes final transfer arrival');
 const thresholdIndex=e.route.findIndex(s=>s.reviewScore>=2);
 if(thresholdIndex>=0){
  assert.equal(e.route[thresholdIndex].start,e.state.start,'human decision occurs exactly when threshold is reached');
  assert(!e.route.slice(thresholdIndex).some(s=>['specialist','frontier','blind','compare'].includes(s.kind)),'no costly calls after threshold');
 }
}
function checkScene(at){
 demo.seek(at);const entries=demo.simulate(at,70),held=entries.filter(e=>e.state.kind==='human');
 const transfers=held.map(e=>demo.humanTransferFor(e,g.width,at));
 assert.equal(entries.length,500);assert.equal(new Set(terminalIds(entries)).size,500);
 const counters=['count-wait','count-rootwait','count-active','count-review','count-done','count-human'];
 assert.equal(counters.reduce((sum,id)=>sum+Number(getElement(id).textContent),0),500,'human transfers are not counted twice');
 assert.equal(+getElement('count-human').textContent,held.length,'terminal human counter is immediate');
 assert.equal(+getElement('human-sector-total').textContent,held.length);
 assert.equal(+getElement('human-sector-moving').textContent,transfers.filter(t=>t.moving).length);
 assert.equal(+getElement('human-sector-arrived').textContent,transfers.filter(t=>t.arrived).length);
 assert.equal(+getElement('human-sector-moving').textContent + +getElement('human-sector-arrived').textContent,held.length);
 const listed=[...getElement('human-sector-list').innerHTML.matchAll(/data-focus="(P\d+)"/g)].map(m=>m[1]);
 assert.equal(new Set(listed).size,listed.length,'sector list does not duplicate products');
 const arrived=held.filter(e=>demo.humanTransferFor(e,g.width,at).arrived);
 for(const id of listed)assert(arrived.some(e=>e.product.id===id),'sector only lists genuinely arrived human products');
 assert.equal(listed.length,Math.min(4,arrived.length),'up to four actual arrivals appear in the sector list');
 return JSON.stringify({list:getElement('human-sector-list').innerHTML,total:getElement('human-sector-total').textContent,moving:getElement('human-sector-moving').textContent,arrived:getElement('human-sector-arrived').textContent,terminal:terminalIds(held)});
}
for(const t of [0,scored.state.start,scored.state.start+1,scored.state.start+2,scored.state.start+3,badPhoto.state.start,demo.maxTime])checkScene(t);
const snapshot=checkScene(scored.state.start+1);checkScene(demo.maxTime);assert.equal(getElement('human-flight-label').hidden,true,'final overview contains no obsolete traveling label');checkScene(0);assert.equal(checkScene(scored.state.start+1),snapshot,'seek reconstructs identical transfer and list state');
getElement('quick-reset').click();assert.equal(demo.getState().time,0);assert.equal(+getElement('human-sector-total').textContent,0);assert.equal(+getElement('human-sector-moving').textContent,0);assert.equal(+getElement('human-sector-arrived').textContent,0);
vm.runInContext("params.set('reduce','1');setReduced();",context);
assert.equal(demo.getState().reduced,true);
const reducedTransfer=demo.humanTransferFor(scored,g.width,scored.state.start);
assert(reducedTransfer.arrived&&!reducedTransfer.moving,'reduced motion goes directly to sector without a flight');
samePoint(reducedTransfer.point,reducedTransfer.destination,'reduced motion destination');
checkScene(scored.state.start);assert.equal(+getElement('human-sector-moving').textContent,0,'reduced motion does not invent moving counters');
vm.runInContext("params.delete('reduce');setReduced();",context);assert.equal(demo.getState().reduced,false);
demo.showHumanTransferExample();const example=demo.getState();assert(example.playing,'example starts actual shared playback');
assert(demo.products.some(p=>{const r=demo.routeFor(p,70),last=r.at(-1);return last.kind==='human'&&last.reviewScore===2&&last.start===example.time+1;}),'example begins one scene before a real two-point hold');
for(const p of demo.products)assert.equal(JSON.stringify(demo.routeFor(p,70)),routesBefore.get(p.id),'viewing movement cannot mutate routing');
const before=demo.getState().time;getElement('quick-reset').click();assert.equal(demo.getState().time,0);assert(!demo.getState().playing);assert(before>=0);
console.log(JSON.stringify({passed:true,width:g.width,categoriesRightEdge:rightmost,expressX:g.expressX,humanSector:g.humanSector,humanProducts:humans.length,checks:'dedicated lanes, four transfer scenes, exact counters, immediate policy, zero/one-point holds, no later API, width scaling, seek/reset, 500 conserved'}));
