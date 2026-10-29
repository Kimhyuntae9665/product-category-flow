'use strict';
const fs=require('fs'),vm=require('vm'),assert=require('assert/strict');
const html=fs.readFileSync(require('path').join(__dirname,'../index.html'),'utf8');
const frontier=html.match(/<article class="cascade-step frontier-step">([\s\S]*?)<\/article>/)[1];
const blind=html.match(/<article class="cascade-step blind-step"[^>]*>([\s\S]*?)<\/article>/)[1];
assert(!frontier.includes('blind-warning'));
assert(!blind.includes('blind-warning'));
assert.match(frontier,/class="cascade-arrow-score">사람검증 점수 \+1/);
assert(html.includes('Agent 사이에서도 의견 갈림'));
assert(html.includes('<strong>사람검증 +1</strong>'));
assert(!/사람검증(?: 점수)? \+2|독립 (?:검토|비교)[^<\n]*미해결 \+2|독립 비교 미해결 · 3점/.test(html), 'all shipped review labels use independent +1 and total 2');
assert(html.indexOf('id="cascade-blind-step"')<html.indexOf('class="cascade-success"'));
assert(html.indexOf('class="cascade-success"')<html.indexOf('class="cascade-recovery"'));
assert(html.indexOf('class="cascade-recovery"')<html.indexOf('id="cascade-human-step"'));
const script=html.match(/<script id="cascade-score-route-script">([\s\S]*?)<\/script>/)[1];
for(const width of [300,678,1200]){
 const mobile=width<761;
 const bx=width>900?width-245:14,bottom=width>900?350:1400;
 const hx=mobile?14:width/2+5,hy=bottom+(mobile?280:190),right=width-15;
 const rect=(left,top,w,h)=>({left:left+101,top:top+201,right:left+w+101,bottom:top+h+201,width:w,height:h});
 const elements={
  'cascade-score-map':{clientWidth:width,clientHeight:hy+90,clientLeft:1,clientTop:1,getBoundingClientRect:()=>({left:100,top:200})},
  'cascade-blind-step':{getBoundingClientRect:()=>rect(bx,bottom-240,right-bx,240)},
  'cascade-human-step':{getBoundingClientRect:()=>rect(hx,hy,right-hx,70)},
  'cascade-score-label':{style:{}},
  'cascade-score-route':{setAttribute(k,v){this[k]=v;}},
  'cascade-score-path':{setAttribute(k,v){this[k]=v;}}
 };
 let resize;
 vm.runInNewContext(script,{document:{getElementById:id=>elements[id]},window:{addEventListener(name,fn){resize=fn;}}});
 const path=elements['cascade-score-path'].d;
 assert.equal(path,`M ${right-12} ${bottom} V ${bottom+66} H ${width-6} V ${hy-14} H ${right-22} V ${hy-2}`);
 assert(width-6>right,'vertical route stays outside completion and recovery cards');
 assert.equal(parseFloat(elements['cascade-score-label'].style.top),bottom+8);
 assert(parseFloat(elements['cascade-score-label'].style.left)+parseFloat(elements['cascade-score-label'].style.width)<right-12,'label clears the departing line');
 assert(hy-14>bottom+66,'connector descends toward the human-review card');
 resize();assert.equal(elements['cascade-score-path'].d,path);
}
console.log('PASS: scores moved to arrows, card order preserved, connector routes outside cards at narrow/mobile/desktop widths and redraws on resize.');
