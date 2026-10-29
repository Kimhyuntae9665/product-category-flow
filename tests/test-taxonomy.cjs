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

// Taxonomy assertions run against the shipped engine and actual rendered baskets.
const nodes=new Map(Array.from(demo.nodes,n=>[n.id,n]));
const leaves=new Map(Array.from(demo.leaves,l=>[l.id,l]));
assert.equal(demo.treeGeometry.width,5250);
assert.equal(demo.treeGeometry.contentWidth,4200);
assert.equal(demo.categories.length,10);
assert.equal(new Set(Array.from(demo.categories,c=>c.name)).size,10);
assert(demo.categories.some(c=>c.name==='반려동물용품'));
assert(demo.categories.some(c=>c.name==='기타'));
assert.equal(demo.leaves.length,38);
assert.equal(new Set(Array.from(demo.products,p=>p.id)).size,500);
for(const c of demo.categories){
 const roots=c.nodes.filter(n=>n.stage===0);assert.equal(roots.length,1);
 assert(roots[0].children.length>=2,c.name+': real top-level fork');
 assert.equal(demo.products.filter(p=>p.cat===roots[0].cat).length,50);
 assert(c.paths.length>=2);
}
for(const node of demo.nodes){
 assert(node.children.length===0||node.children.length>=2,node.name+': no single-child chains');
 assert(node.width>=88&&node.px-node.width/2>=0&&node.px+node.width/2<=demo.treeGeometry.contentWidth);
 const siblings=Array.from(node.children,id=>nodes.get(id));
 assert.equal(new Set(siblings.map(n=>n.name)).size,siblings.length,'siblings have distinct names');
 for(const child of siblings){assert.equal(child.parentId,node.id);assert.equal(child.stage,node.stage+1);assert.equal(child.cat,node.cat);}
 if(node.parentId){const parent=nodes.get(node.parentId);assert(parent.children.includes(node.id));}
}
for(let stage=0;stage<4;stage++){
 const row=demo.nodes.filter(n=>n.stage===stage).sort((a,b)=>a.px-b.px);
 for(let i=1;i<row.length;i++)assert(row[i-1].px+row[i-1].width/2<=row[i].px-row[i].width/2,'same-level nodes never overlap');
}
const byName=name=>demo.nodes.find(n=>n.name===name);
for(const [parent,children] of [['의류',['상의','하의']],['의약품',['일반의약품','전문의약품']],['가정용품',['생활용품','청소용품']]]){
 const n=byName(parent);assert.deepEqual(Array.from(n.children,id=>nodes.get(id).name),children,parent+': requested natural siblings');
}
const final=demo.simulate(demo.maxTime,70);
const done=final.filter(e=>e.state.kind==='done'),human=final.filter(e=>e.state.kind==='human');
assert.equal(done.length+human.length,500,'all products finish or wait for human review');
for(const product of demo.products){
 const leaf=leaves.get(product.leafId);assert(leaf,product.id+': real target basket');
 assert.equal(leaf.cat,product.cat);
 assert.deepEqual(Array.from(product.path),Array.from(leaf.path));
 assert.equal(product.path[0],demo.categories[product.cat].name);
 assert.equal(product.leaf,product.path.at(-1));
 assert(product.name.startsWith(product.leaf+' 예시 '),'product name matches its target');
 assert.equal(product.attribute.value,product.leaf,'seller enrichment matches its actual target');
 assert.equal(product.nodeIds.length,product.path.length);
 product.nodeIds.forEach((id,stage)=>{const node=nodes.get(id);assert(node);assert.equal(node.name,product.path[stage]);assert.equal(node.stage,stage);assert.deepEqual(Array.from(node.path),Array.from(product.path.slice(0,stage+1)));});
 assert.equal(nodes.get(leaf.nodeId).children.length,0,'targets are terminal nodes');
 const route=demo.routeFor(product,70);
 for(const state of route){
  assert(nodes.has(product.nodeIds[state.stage]),product.id+': route stage exists in actual path');
  if(state.fromNodeId){const from=nodes.get(state.fromNodeId),to=nodes.get(state.targetNodeId);assert(from&&to);assert.notEqual(from.id,to.id);assert.equal(from.stage,to.stage);assert.equal(from.parentId,to.parentId,'recovery alternatives share the actual parent');assert.equal(state.fromLabel,from.name);assert.equal(state.targetLabel,to.name);}
 }
 if(route.at(-1).kind==='done')assert.equal(route.at(-1).stage,product.path.length-1);
}
demo.seek(demo.maxTime);
const renderedIds=[];
for(const leaf of demo.leaves){
 const assigned=demo.products.filter(p=>p.leafId===leaf.id);assert(assigned.length>=10,leaf.id+': sibling is used by actual products');
 const expected=done.filter(e=>e.product.leafId===leaf.id).map(e=>e.product.id).sort();
 assert(expected.length>0,leaf.id+': actual products complete in every branch');
 const actual=[...getElement('basket-list-'+leaf.id).innerHTML.matchAll(/<li>(P\d+)\s*·/g)].map(m=>m[1]).sort();
 assert.deepEqual(actual,Array.from(expected),leaf.id+': exact persistent basket IDs');renderedIds.push(...actual);
 assert(leaf.x-44>=0&&leaf.x+44<=demo.treeGeometry.contentWidth);
 assert([484,724,964,1204][leaf.path.length-1]+demo.treeGeometry.basketOffset+demo.treeGeometry.basketHeight<=demo.treeGeometry.height);
}
assert.equal(new Set(renderedIds).size,done.length,'no product appears in multiple baskets');
const renderedNodeIds=[...getElement('nodes').innerHTML.matchAll(/id="(node-[^"]+)"/g)].map(m=>m[1]);
assert.equal(new Set(renderedNodeIds).size,demo.nodes.length,'shared prefixes render exactly once');
assert.equal(renderedNodeIds.length,demo.nodes.length);
// Moving tickets occupy a strip below the enlarged category title and above
// the score pill; actual cascade states use the same physical branch center.
assert(html.includes('.tree .token:not(.ingress){width:88px;height:34px;min-height:34px;'));
assert(html.includes('.tree .node.is-active small{visibility:hidden}'));
const nodeTop=[484,724,964,1204];
const checkedLandingDepths=new Set();
for(let t=0;t<=demo.maxTime;t++){
 context.testEntries=demo.simulate(t,70);
 const visible=vm.runInContext('selectVisible(testEntries)',context),occupied=new Set();
 assert(visible.filter(e=>e.state.kind==='human').every(e=>{const transfer=demo.humanTransferFor(e,demo.treeGeometry.width,t);return transfer.moving||transfer.arrived&&transfer.point.x-44>=demo.treeGeometry.humanSector.x;}),'human tickets move toward or arrive inside their separate sector');
 for(const e of visible){
  const state=e.state;
  if(!['queue','classify','quality','specialist','frontier','blind','compare','descend'].includes(state.kind)||state.stage===0&&state.kind!=='queue')continue;
  const node=nodes.get(e.product.nodeIds[state.stage]);
  assert(!occupied.has(node.id),'each actual node shows only one moving representative');occupied.add(node.id);
  context.testEntry=e;context.testVisible=visible;
  const point=vm.runInContext('position(testEntry,window.classificationDemo.treeGeometry.width,testVisible)',context);
  assert(Math.abs(point.x+44-node.px)<.001,'compact ticket centers on its actual branch');
  assert(point.y>=nodeTop[state.stage]+130-1,'moving ticket clears the full two-line category title');
  assert(point.y+34<=nodeTop[state.stage]+demo.treeGeometry.scoreOffset-2,'moving ticket clears score pills immediately below the node');
  assert(point.x>=0&&point.x+88<=demo.treeGeometry.contentWidth);
 }
 const landing=visible.find(e=>e.state.kind==='expressLand'&&!checkedLandingDepths.has(e.product.path.length));
 if(landing){
  demo.seek(t);context.testEntry=landing;context.testVisible=visible;
  const point=vm.runInContext('position(testEntry,window.classificationDemo.treeGeometry.width,testVisible)',context);
  const endpoint=nodes.get(landing.product.nodeIds.at(-1)).px;
  const segments=[...getElement('express-lines').innerHTML.matchAll(/class="express-to-bin" d="M([\d.]+) ([\d.]+) H([\d.]+)"/g)];
  const segment=segments.find(m=>Math.abs(Number(m[3])-endpoint)<.001);
  assert(segment,'direct route has an arrow to the actual final basket');
  assert.equal(Number(segment[1]),demo.treeGeometry.expressX,'arrow uses reserved express lane');
  const rail=getElement('express-lines').innerHTML.match(/class="express-rail" d="M[^"]+ H[\d.]+ V([\d.]+)"/);
  assert(rail&&Number(rail[1])>=Number(segment[2]),'vertical express rail reaches every terminal depth');
  assert(Math.abs(point.y+17-Number(segment[2]))<=12.001,'direct token lands on its rendered arrow, including ticket stacking offset');
  checkedLandingDepths.add(landing.product.path.length);
 }
}
assert.equal(checkedLandingDepths.size,3,'direct arrow and landing agree for all three terminal depths');
const selectedCase=demo.products[0],sameBranch=demo.products.find(p=>p.id!==selectedCase.id&&p.nodeIds[1]===selectedCase.nodeIds[1]);
context.collisionEntries=[{product:sameBranch,state:{kind:'classify',stage:1}},{product:selectedCase,state:{kind:'classify',stage:1}}];
assert.deepEqual(Array.from(vm.runInContext('selectVisible(collisionEntries)',context),e=>e.product.id),[selectedCase.id],'selected product keeps priority when a branch is occupied');
console.log(JSON.stringify({passed:true,roots:demo.categories.length,nodes:demo.nodes.length,leaves:demo.leaves.length,products:demo.products.length,done:done.length,human:human.length,width:demo.treeGeometry.width}));
