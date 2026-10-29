'use strict';
const {assert,html,demo}=require('./app-harness.cjs');
assert(html.includes('id="agent-debate"'));
assert(html.includes('프론티어의 후보·근거·점수도 전달하지 않습니다.'));
assert(html.includes('OpenRouter 추가 호출 없음'));
for(const id of ['comparison-title','debate-next','case-frontier','case-supported','case-missing','confidence-graph','blind-comparison-body','debate-result']) {
 assert(!html.includes('id="'+id+'"'), 'removed comparison control remains: '+id);
}
assert(!html.includes('class="br-comparison"'));
assert(!html.includes('class="br-boundary"'));
assert.equal(demo.getState().time,0);
console.log('PASS: independent-review overview retained; comparison panel and handlers removed; application initializes.');
