'use strict';
const {assert,demo,getElement,html}=require('./app-harness.cjs');

const simulationBefore=JSON.stringify(demo.getState());
const rows=()=>getElement('blind-comparison-body').innerHTML;
const click=id=>getElement(id).click();
const sealed=()=>{
  assert.equal((rows().match(/공개 전 · 따로 저장/g)||[]).length,3);
  assert(!rows().includes('보호 커버'), 'the comparison table must not leak authored answers before reveal');
  for(let i=0;i<3;i++)assert.equal(getElement(`blind-seal-${i}`).textContent,'답안 봉인');
};

assert(html.includes('프론티어의 후보·근거·점수도 전달하지 않습니다.'));
assert(html.includes('OpenRouter 추가 호출 없음'));
sealed();
click('debate-next');
assert.equal((rows().match(/<tr>/g)||[]).length,3);
assert(rows().includes('속이 빈 덮개 형태'));
assert(rows().includes('실리콘 · 충전 기능 없음'));
assert(!rows().includes('공개 전 · 따로 저장'));
assert(!getElement('debate-result').textContent.includes('→ 최종 분류'), 'reveal alone must not claim the final decision');
click('debate-next');
assert.match(getElement('debate-result').textContent,/해결 \+0 = 1점 → 최종 분류/);

click('case-missing');
sealed();
assert.equal(getElement('case-art-supported').visibility,'hidden');
assert.equal(getElement('case-art-missing').visibility,'visible');
click('debate-next');
assert(rows().includes('기능 설명이 없음'));
assert(rows().includes('추가 정보 필요'));
assert(!rows().includes('근거 충족'));
click('debate-next');
assert.match(getElement('debate-result').textContent,/미해결 \+2 = 3점 → 사람 검수/);
click('debate-next');
sealed();

click('case-supported');
assert.equal(getElement('case-art-supported').visibility,'visible');
assert.equal(getElement('case-art-missing').visibility,'hidden');
sealed();
assert.equal(JSON.stringify(demo.getState()),simulationBefore,'authored comparison must not change the classification simulation');
console.log('PASS: sealed answers, evidence reveal, sufficient/insufficient decisions, case reset, matching illustration, and independent simulation state.');
