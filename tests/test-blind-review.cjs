'use strict';
const {assert,html,demo,context,getElement,vm,staticIds}=require('./app-harness.cjs');
assert(html.includes('id="agent-debate"'));
assert(html.includes('프론티어의 후보·근거·점수도 전달하지 않습니다.'));
assert(html.includes('OpenRouter 추가 호출 없음'));
for(const id of ['comparison-title','debate-next','case-frontier','case-supported','case-missing','confidence-graph','blind-comparison-body','debate-result']) {
 assert(!html.includes('id="'+id+'"'), 'removed comparison control remains: '+id);
}
assert(!html.includes('class="br-comparison"'));
assert(!html.includes('class="br-boundary"'));
assert.equal(demo.getState().time,0);
const source=html.match(/<script id="blind-process-script">([\s\S]*?)<\/script>/);
assert(source,'automatic process illustration must be shipped');
for(const match of source[1].matchAll(/get\('([^']+)'\)/g)){
 if(!match[1].endsWith('-'))assert(staticIds.includes(match[1]),'missing process element: '+match[1]);
}
for(let i=0;i<3;i++)assert(staticIds.includes('br-model-progress-'+i));
const before=JSON.stringify(demo.getState()),pending=new Map(),events={};
let now=0,id=0,onIntersection,onMotion;
const motion={matches:false,addEventListener(type,fn){onMotion=fn;}};
context.matchMedia=()=>motion;
context.performance.now=()=>now;
context.requestAnimationFrame=fn=>{pending.set(++id,fn);return id;};
context.cancelAnimationFrame=id=>pending.delete(id);
context.document.addEventListener=(name,fn)=>events[name]=fn;
context.IntersectionObserver=class{constructor(fn){onIntersection=fn;}observe(){}};
new vm.Script(source[1]).runInContext(context);
const anim=context.window.blindProcessDemo;
const tick=()=>{now+=100;const callbacks=[...pending.values()];pending.clear();callbacks.forEach(fn=>fn(now));};
const visible=value=>onIntersection([{isIntersecting:value}]);
assert.equal(pending.size,0);
visible(true);assert.equal(anim.getState().playing,true);
const phases=new Set();let wraps=0,previous=0;
for(let i=0;i<270;i++){
 tick();const state=anim.getState();phases.add(state.phase);
 if(state.time<previous)wraps++;
 previous=state.time;
 if(i===130)assert.equal(wraps,1,'first loop completes after 13 seconds');
 if(i===260)assert.equal(wraps,2,'second loop completes after 26 seconds');
 assert.equal(pending.size,1,'only one scheduled frame');
 for(let j=0;j<3;j++){
  assert.equal(getElement('model-card-'+j).classList.contains('process-working'),state.phase===4,'all models review concurrently');
  assert.equal(getElement('model-card-'+j).classList.contains('process-done'),state.phase===5);
  assert.equal(getElement('blind-seal-'+j).textContent,state.phase===5?'✓ 답안 저장 · 봉인':state.phase===4?'독립 검토 중':state.phase===3?'동일 원본 수신':'요청 대기');
 }
 assert.equal(getElement('frontier-score-value').textContent,state.phase>=2?'64':'—','no result before first judgment');
}
assert.deepEqual([...phases].sort(),[0,1,2,3,4,5]);assert.equal(wraps,2);
visible(false);const stopped=anim.getState().time;tick();assert.equal(anim.getState().time,stopped);assert.equal(pending.size,0);
visible(true);tick();assert(anim.getState().time>stopped);
getElement('br-process-toggle').click();visible(false);visible(true);assert.equal(pending.size,0,'manual pause persists');
getElement('br-process-toggle').click();assert.equal(pending.size,1);
context.document.hidden=true;events.visibilitychange();assert.equal(pending.size,0);
context.document.hidden=false;events.visibilitychange();assert.equal(pending.size,1);
motion.matches=true;onMotion();assert.equal(pending.size,0);assert.equal(anim.getState().phase,5);assert.equal(getElement('br-process-toggle').disabled,true);
motion.matches=false;onMotion();assert.equal(pending.size,1);
assert.equal(JSON.stringify(demo.getState()),before,'process illustration must not mutate product simulation');
console.log('PASS: two automatic process loops; concurrent independent models; sealed results; pause/resume, visibility, reduced motion; removed comparison stays removed; product simulation unchanged.');
