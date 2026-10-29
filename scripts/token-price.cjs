const fs = require('node:fs');
const path = require('node:path');

const sourceUrl = 'https://gravity.fast/data/llm-api-price-history/#price-by-tier';
const csvPath = path.join(__dirname, '../assets/data/llm-token-price-history-2026-10-28.csv');
const csv = fs.readFileSync(csvPath, 'utf8').trim();
const [header, ...lines] = csv.split(/\r?\n/);
const columns = header.split(',');
// The archived source has no quoted fields. Fail rather than silently misparse a new format.
if (csv.includes('"')) throw new Error('Quoted CSV fields require an updated parser.');
const rows = lines.map(line => {
  const values = line.split(',');
  if (values.length !== columns.length) throw new Error('Unexpected price CSV columns.');
  const row = Object.fromEntries(columns.map((key, i) => [key, values[i]]));
  const raw = row.blended_usd_per_1m;
  row.price = raw === '' ? null : Number(raw);
  if (row.price !== null && !(Number.isFinite(row.price) && row.price > 0)) throw new Error('Invalid log-scale price.');
  return row;
});
const tiers = [
  { key: 'GPT-4 class', label: 'GPT-4 수준', className: 'gpt4', color: '#087d68', dash: '' },
  { key: 'GPT-4o class', label: 'GPT-4o 수준', className: 'gpt4o', color: '#315cde', dash: '8 5' },
  { key: 'Gemini 2.5 Pro class', label: 'Gemini 2.5 Pro 수준', className: 'gemini', color: '#9460b7', dash: '2 5' }
].map(tier => ({ ...tier, rows: rows.filter(row => row.tier === tier.key) }));
const first = tiers[0].rows.find(row => row.price !== null);
const latest = tiers[0].rows.at(-1);
const ratio = first.price / latest.price;
const reduction = (1 - latest.price / first.price) * 100;
const start = Date.parse(first.snapshot_date + 'T00:00:00Z');
const end = Date.parse(latest.snapshot_date + 'T00:00:00Z');
const money = n => '$' + n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

function geometry(mobile) {
  const width = mobile ? 360 : 720;
  const height = mobile ? 280 : 330;
  const left = mobile ? 45 : 54;
  const right = mobile ? 16 : 24;
  const top = mobile ? 36 : 32;
  const bottom = mobile ? 43 : 46;
  return { width, height, left, right, top, bottom,
    x: date => left + (Date.parse(date + 'T00:00:00Z') - start) / (end - start) * (width - left - right),
    y: price => top + (2 - Math.log10(price)) / 4 * (height - top - bottom)
  };
}

function seriesPath(tier, g) {
  let connected = false;
  return tier.rows.map(row => {
    if (row.price === null) { connected = false; return ''; }
    const command = connected ? 'L' : 'M';
    connected = true;
    return `${command}${g.x(row.snapshot_date).toFixed(2)},${g.y(row.price).toFixed(2)}`;
  }).filter(Boolean).join(' ');
}

function chartSvg(id, mobile = false) {
  const g = geometry(mobile);
  const ticks = [100, 10, 1, 0.1, 0.01];
  const yearTicks = ['2023-10-01', '2024-10-01', '2025-10-01', '2026-10-01'];
  const startX = g.x(first.snapshot_date), startY = g.y(first.price);
  const endX = g.x(latest.snapshot_date), endY = g.y(latest.price);
  const suffix = mobile ? 'mobile' : 'wide';
  return `<svg class="token-price-svg token-price-${suffix}" viewBox="0 0 ${g.width} ${g.height}" role="img" aria-labelledby="${id}-${suffix}-title ${id}-${suffix}-desc">
<title id="${id}-${suffix}-title">성능 기준별 최저 토큰 단가, 2023년 10월부터 2026년 10월 28일까지</title>
<desc id="${id}-${suffix}-desc">입력 3 대 출력 1로 혼합한 100만 토큰당 미국 달러 가격. 세로축은 로그 눈금입니다. GPT-4 수준은 37.50달러에서 0.0575달러로 약 ${Math.round(ratio)}분의 1, 약 ${reduction.toFixed(1)}% 낮아졌습니다. GPT-4o 수준의 최신 단가는 0.0703달러, Gemini 2.5 Pro 수준은 0.1525달러입니다. 월별 관측값 사이를 연결했으며 일부 상승 구간도 있습니다. 출처는 Gravity 원자료입니다.</desc>
<g class="token-price-axis" fill="#61738b" font-size="${mobile ? 13 : 13}">
<text x="${g.left}" y="15">USD / 100만 토큰 · 로그 눈금</text>
${ticks.map(value => `<line x1="${g.left}" x2="${g.width - g.right}" y1="${g.y(value)}" y2="${g.y(value)}" stroke="#dfe6ef" stroke-dasharray="3 4"/><text x="${g.left - 9}" y="${g.y(value) + 4}" text-anchor="end">${money(value)}</text>`).join('')}
${yearTicks.map((date, i) => `<line x1="${g.x(date)}" x2="${g.x(date)}" y1="${g.height - g.bottom}" y2="${g.height - g.bottom + 5}" stroke="#a8b8cb"/><text x="${g.x(date)}" y="${g.height - g.bottom + 25}" text-anchor="${i === 0 ? 'start' : i === 3 ? 'end' : 'middle'}">${date.slice(0, 7).replace('-', '.')}</text>`).join('')}
</g>
<g fill="none" stroke-linecap="round" stroke-linejoin="round">
${[...tiers].reverse().map(tier => `<path class="token-series ${tier.className}" data-tier="${escape(tier.key)}" d="${seriesPath(tier, g)}" stroke="${tier.color}" stroke-width="${tier.className === 'gpt4' ? 3.3 : 2.5}"${tier.dash ? ` stroke-dasharray="${tier.dash}"` : ''}/>`).join('')}
</g>
<g fill="#087d68" stroke="white" stroke-width="2"><circle cx="${startX}" cy="${startY}" r="4.5"/><circle cx="${endX}" cy="${endY}" r="4.5"/></g>
<g fill="#086b5b" font-size="${mobile ? 14 : 15}" font-weight="800" paint-order="stroke" stroke="white" stroke-width="5" stroke-linejoin="round"><text x="${startX + 9}" y="${startY - 11}">$37.50</text><text x="${endX - 8}" y="${endY + 23}" text-anchor="end">$0.0575</text></g>
</svg>`;
}

function chart(id) {
  return `<figure class="token-price-chart" aria-labelledby="${id}-heading">
<div class="token-price-chart-heading"><h3 id="${id}-heading">성능 기준별 최저 토큰 단가</h3><span>2023.10 — 2026.10.28</span></div>
${chartSvg(id)}${chartSvg(id, true)}
<figcaption class="token-price-legend">${tiers.map(tier => `<span class="${tier.className}"><i aria-hidden="true"></i><span>${tier.label}<b>${money(tier.rows.at(-1).price)}</b></span></span>`).join('')}</figcaption>
<p class="token-price-latest">범례의 금액은 2026.10.28 기준 · 월별 관측값 연결</p>
</figure>`;
}

function sourceLine() {
  return `<p class="token-price-source">출처: <a href="${sourceUrl}" target="_blank" rel="noopener noreferrer">Gravity · Aryan Agarwal</a> · <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> · 원자료를 다시 그린 그래프 <span>자료 2026.10.28 · 확인 2026.10.29</span></p>`;
}

function criteria() {
  return '<p class="token-price-criteria"><b>비교 기준</b> LMArena에서 각 기준 모델 이상의 점수를 받은 모델 중 최저 표준 API 단가 · 입력 3 : 출력 1 혼합 · USD / 100만 토큰</p>';
}

function details() {
  return `<details class="token-price-details"><summary>비교 방법·범위와 원자료 보기</summary><div>
<p>Gravity가 공개한 LiteLLM 월별 가격 기록을 사용했습니다. 혼합 단가는 (입력 단가 × 3 + 출력 단가) ÷ 4이며, 원자료 CSV에 기재된 반올림 값을 그대로 표시합니다. 3개 성능 기준 × 38개 시점의 기록이며, 가격이 없는 시점은 0으로 처리하거나 앞까지 연장하지 않았습니다.</p>
<p>성능 구분은 2026.10.02 LMArena의 텍스트·스타일 보정 종합 점수를 기준으로 합니다. GPT-4·GPT-4o·Gemini 2.5 Pro 자체의 가격 추이가 아니라, 각 점수 기준을 충족한 모델·제공처 중 그 시점의 최저 단가입니다. 모든 업무의 성능이 같다는 뜻은 아닙니다.</p>
<p>11개 모델 회사와 6개 추론 제공처의 표준 종량제 단가를 비교하며, 무료·배치 할인·우선 처리·긴 문맥 요금은 제외합니다. Google API 가격은 2024년 10월 이전 원자료에 없습니다. 추론 토큰, 추가 호출, 사람 검수에 따라 실제 업무 비용은 달라집니다.</p>
<p>GPT-4 수준 비교: 2023.10.01 gpt-4-0314 / OpenAI, 입력 $30·출력 $60 → 2026.10.28 gpt-oss-20b / DeepInfra, 입력 $0.03·출력 $0.14. 계산: $37.50 ÷ $0.0575 = ${ratio.toFixed(2)}, 감소율 ${reduction.toFixed(2)}%.</p>
<p><a href="https://gravity.fast/data/llm-api-price-history/" target="_blank" rel="noopener noreferrer">원문·월별 표</a> · <a href="https://github.com/Kimhyuntae9665/product-category-flow/blob/main/assets/data/llm-token-price-history-2026-10-28.csv" target="_blank" rel="noopener noreferrer">사용한 CSV 보관본</a> · <a href="https://deepinfra.com/openai/gpt-oss-20b" target="_blank" rel="noopener noreferrer">최신 비교 모델의 제공처 가격</a></p>
</div></details>`;
}

function renderHero() {
  return `<section class="token-price-hero" id="ai-economics" aria-labelledby="token-price-title">
<div class="token-price-copy"><p class="token-price-eyebrow">이 설계의 관점 · AI 활용에 투자하는 이유</p>
<h2 id="token-price-title">앞으로도<br><em>토큰당 비용은</em><br>줄어들 것으로<br>예상합니다.</h2>
<p class="token-price-lead">같은 성능 기준의 토큰 단가는 크게 낮아져 왔습니다. 앞으로도 장기적으로 더 낮아질 것으로 기대하며, <strong>사람의 반복 검수를 줄이는 AI Agent 활용에 투자합니다.</strong></p>
<div class="token-price-metric"><span>GPT-4 수준의 최저 단가</span><strong>약 ${Math.round(ratio)}<small>분의 1</small></strong><p><b>$37.50 → $0.0575</b><span>약 ${reduction.toFixed(1)}% 감소</span></p></div>
</div>
${chart('token-hero')}
<div class="token-price-method">${criteria()}${sourceLine()}<p class="token-price-outlook">향후 하락은 이 설계의 전망입니다. 실제 도입은 정확도·추가 호출·사람 검수까지 합친 비용으로 판단합니다.</p>${details()}</div>
</section>`;
}

function renderCompact() {
  return `<aside class="token-price-compact" id="future-token-price" aria-labelledby="future-price-title">
<div class="token-price-future-copy"><p class="token-price-eyebrow">토큰 비용 하락을 고려한 설계 판단</p>
<h3 id="future-price-title">AI Agent 간 의견 비교를<br>적극적으로 활용합니다.</h3>
<p>같은 성능 기준의 토큰 단가는 장기적으로 낮아져 왔으며, 앞으로도 더 줄어들 것으로 예상합니다.</p>
<p>이에 <strong>PAL-review처럼 여러 AI Agent의 판정과 근거를 비교하는 도구를 적극 활용하는 편이, 사람이 모든 상품을 직접 검수하는 것보다 효율적이라고 판단했습니다.</strong></p>
<p>의견이 같다는 이유만으로 확정하지 않고, 근거가 부족하거나 판정이 충돌하면 사람에게 넘깁니다.</p>
<small>설계상 판단이며, 실제 정확도와 총비용의 우위는 도입 전에 검증합니다.</small></div>
</aside>`;
}

module.exports = { renderHero, renderCompact, rows, tiers, first, latest, ratio, reduction, geometry, seriesPath };
