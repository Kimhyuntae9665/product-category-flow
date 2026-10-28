'use strict';
const {demo,context,vm,assert}=require('./app-harness.cjs');
const base={...demo.products[0],id:'FIXTURE',rootStart:0,start:0,textEnough:false,leafScore:94,imageBad:false};
const cascade={specialist:{score:40,validLeaf:true},frontier:{score:40,validLeaf:true},blind:{score:88,agreed:true,validLeaf:true},recovery:null};
function route(patch={},productPatch={}){return demo.routeFor({...base,...productPatch,cascade:{...cascade,...patch}},70);}
const kinds=r=>Array.from(r,s=>s.kind);
function terminal(r,kind,score){assert.equal(r.at(-1).kind,kind);assert.equal(r.at(-1).reviewScore,score);}
const direct=route({}, {textEnough:true,leafScore:99,leafConsistent:true});terminal(direct,'done',0);
assert(!direct.some(s=>['quality','specialist','frontier','blind'].includes(s.kind)),'text resolves final leaf without images or API');
const specialist=route({specialist:{score:93,validLeaf:true}});terminal(specialist,'done',0);
assert.equal(kinds(specialist).filter(k=>k==='specialist').length,1);
assert(!specialist.some(s=>['frontier','blind'].includes(s.kind)),'one image specialist resolves without frontier');
assert.equal(specialist.find(s=>s.kind==='specialist').model,'EfficientNet-B0');
const frontier=route({frontier:{score:93,validLeaf:true}});terminal(frontier,'done',0);
assert(!frontier.some(s=>s.kind==='blind'),'frontier resolution skips independent models');
const unavailable=route({frontier:{score:99,validLeaf:true,available:false}});terminal(unavailable,'done',1);
assert(unavailable.some(s=>s.kind==='blind'),'unavailable frontier escalates even when its placeholder score is high');
const resolved=route();terminal(resolved,'done',1);
assert.deepEqual(Array.from(resolved.at(-1).reviewEvents,e=>[e.kind,e.points]),[['frontier',1]]);
const recovery={stage:1,reason:'wrongBranch',cause:'same-branch',resolved:true};
const blocked=route({recovery});terminal(blocked,'human',2);
assert(!blocked.some(s=>s.kind==='blind'),'recovery +1 then frontier +1 must stop before further calls');
const low=route({blind:{score:45,agreed:true,validLeaf:true}});terminal(low,'human',3);
assert.deepEqual(Array.from(low.at(-1).reviewEvents,e=>[e.kind,e.points]),[['frontier',1],['blind',2]],'independent +2 is added to prior frontier +1');
const conflict=route({blind:{score:99,agreed:false,validLeaf:true}});terminal(conflict,'human',3);
const invalid=route({specialist:{score:99,validLeaf:false},frontier:{score:99,validLeaf:false},blind:{score:99,agreed:true,validLeaf:true,candidateLeafId:'absent'}});terminal(invalid,'human',3);
const weak=route({recovery:{...recovery,reason:'lowScore'}});terminal(weak,'done',1);
assert(!weak.some(s=>s.kind.startsWith('recover')),'low score alone escalates without recovery');
const exhausted=route({recovery:{...recovery,resolved:false}});terminal(exhausted,'human',1);
assert.equal(exhausted.filter(s=>s.kind==='recoverUp').length,1,'one bounded alternative search');
assert(!exhausted.some(s=>['frontier','blind'].includes(s.kind)));
const recovered=route({recovery,frontier:{score:95,validLeaf:true}});terminal(recovered,'done',1);
assert(recovered.some(s=>s.kind==='recoverDown'&&s.stage===1&&s.fromNodeId!==s.targetNodeId),'actual sibling branch recovery is visible');
const bad=route({}, {imageBad:true});terminal(bad,'human',0);assert(!bad.some(s=>s.kind==='specialist'));
const assessments=resolved.find(s=>s.kind==='blind').assessments;
assert.equal(assessments.length,3);
for(const a of assessments){assert(a.imageCapable);assert.equal(a.peerAnswersVisible,false);assert.equal(a.previousAnswersVisible,false);assert.equal(JSON.stringify(a.evidence),JSON.stringify(assessments[0].evidence));assert.equal(a.evidence.taxonomyLeafIds.length,38);assert.equal(a.evidence.taxonomy.length,38);assert(a.evidence.taxonomy.every(l=>l.path.length>=2));assert(!('frontierAnswer' in a.evidence));}
assert.notEqual(assessments[0].evidence,assessments[1].evidence,'independent input copies');
assert(resolved.find(s=>s.kind==='compare').start>=resolved.find(s=>s.kind==='blind').end,'compare only after blind first round');
assert.equal(demo.policy.synthetic,true);assert.equal(demo.policy.calibrationFitted,false);
assert.equal(demo.scoreFor({product:base,state:resolved.find(s=>s.kind==='compare'),route:resolved}).average,null,'no raw score average');
const all=[direct,specialist,frontier,resolved,blocked,low,conflict,invalid,weak,exhausted,recovered,bad];
for(const r of all){for(let i=0;i<r.length;i++){const s=r[i];assert.equal(s.reviewScore,s.reviewEvents.reduce((n,e)=>n+e.points,0));if(i)assert.equal(s.start,r[i-1].end);if(s.reviewScore>=2){assert(['frontierResult','blindResult','human'].includes(s.kind));if(s.kind!=='human')assert.equal(s.start,s.end,'threshold event has no paid/waiting interval');}}
 assert.equal(r.at(-1).end,Infinity);
}
for(const p of demo.products){const r=demo.routeFor(p,70);assert.equal(JSON.stringify(r),JSON.stringify(demo.routeFor(p,70)));for(const s of r){context.entry={product:p,state:s,route:r};if(s.stage<0)continue;const point=vm.runInContext('position(entry,4200,[])',context);assert(Number.isFinite(point.x)&&Number.isFinite(point.y));if(!['classify','done','human'].includes(s.kind))assert(point.x>=0&&point.x+88<=4200&&point.y>=0&&point.y+34<=1540,p.id+': state fits existing geometry');}}
console.log('PASS: text / one specialist / frontier / frontier+1 then blind resolved / recovery+frontier immediate stop / additive blind+2 / blind inputs / final leaf validation / bounded recovery / no fitted calibration.');
