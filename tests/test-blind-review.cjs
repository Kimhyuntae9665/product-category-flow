'use strict';
const {assert,demo,getElement,html}=require('./app-harness.cjs');

const simulationBefore=JSON.stringify(demo.getState());
const rows=()=>getElement('blind-comparison-body').innerHTML;
const click=id=>getElement(id).click();
const sealed=()=>{
  assert.equal((rows().match(/공개 전 · 따로 저장/g)||[]).length,3);
  assert(!rows().includes('Bluetooth'), 'the comparison table must not leak authored answers before reveal');
  for(let i=0;i<3;i++){
    assert.equal(getElement(`blind-seal-${i}`).textContent,'답안 봉인');
    assert.equal(getElement(`confidence-value-${i}`).textContent,'—');
    assert.equal(getElement(`confidence-bar-${i}`).style.width,'0%');
  }
};

assert(html.includes('프론티어의 후보·근거·점수도 전달하지 않습니다.'));
assert(html.includes('OpenRouter 추가 호출 없음'));
sealed();
assert.equal(getElement('frontier-score-value').textContent,'64');
assert.match(getElement('frontier-gate-label').textContent,/64 < 기준 85/);
click('debate-next');
assert.equal((rows().match(/<tr>/g)||[]).length,3);
assert(rows().includes('이어피스 2개 + 충전 케이스'));
assert(rows().includes('Bluetooth · 음악 재생'));
for(let i=0;i<3;i++)assert.equal(getElement(`confidence-value-${i}`).textContent,String([92,90,88][i]));
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
for(let i=0;i<3;i++)assert.equal(getElement(`confidence-value-${i}`).textContent,String([58,54,41][i]));
click('debate-next');
assert.match(getElement('debate-result').textContent,/미해결 \+2 = 3점 → 사람 검수/);
click('debate-next');
sealed();

click('case-supported');
assert.equal(getElement('case-art-supported').visibility,'visible');
assert.equal(getElement('case-art-missing').visibility,'hidden');
sealed();
click('case-frontier');
assert.equal(getElement('frontier-score-value').textContent,'92');
assert.equal(getElement('agent-debate').classList.contains('frontier-passed'),true);
assert.match(getElement('debate-result').textContent,/0점 → 최종 분류/);
assert.equal(getElement('debate-next').disabled,true);
assert.equal(getElement('debate-autoplay').disabled,true);
assert(!rows().includes('근거 충족'), 'no independent output should be fabricated when the frontier already passed');
for(let i=0;i<3;i++){
  assert.equal(getElement(`blind-seal-${i}`).textContent,'요청 없음');
  assert.equal(getElement(`confidence-value-${i}`).textContent,'—');
}
click('debate-next');
click('debate-stage-2');
click('debate-autoplay');
assert.equal(getElement('debate-autoplay')['aria-pressed'],'false');
assert.match(getElement('debate-result').textContent,/0점 → 최종 분류/);
click('case-missing');
assert.equal(getElement('debate-next').disabled,false);
assert.equal(getElement('agent-debate').classList.contains('frontier-passed'),false);
sealed();
click('case-supported');
sealed();
assert.equal(JSON.stringify(demo.getState()),simulationBefore,'authored comparison must not change the classification simulation');
console.log('PASS: sealed confidence scores, shared-candidate graph, evidence reveal, all 3 decisions, branch guards, case reset, matching illustration, and independent simulation state.');
