const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const chart = require('../scripts/token-price.cjs');

assert.equal(chart.rows.length, 114);
assert.equal(new Set(chart.rows.map(row => row.snapshot_date)).size, 38);
assert.equal(new Set(chart.rows.map(row => row.snapshot_date + '|' + row.tier)).size, 114);
assert.equal(chart.first.snapshot_date, '2023-10-01');
assert.equal(chart.latest.snapshot_date, '2026-10-28');
assert.equal(chart.first.price, 37.5);
assert.equal(chart.latest.price, 0.0575);
assert.equal(Math.round(chart.ratio), 652);
assert.equal(chart.reduction.toFixed(1), '99.8');
assert.equal(chart.tiers[1].rows.at(-1).price, 0.0703); // Preserve source precision, not 0.07025.
assert.equal(chart.tiers[2].rows.at(-1).price, 0.1525);
assert.ok(chart.tiers[1].rows[0].price === null && chart.tiers[2].rows[0].price === null);

for (const mobile of [false, true]) {
  const g = chart.geometry(mobile);
  const gaps = [100, 10, 1, 0.1].map(value => g.y(value / 10) - g.y(value));
  assert.ok(gaps.every(gap => Math.abs(gap - gaps[0]) < 1e-8), 'Log decades must have equal spacing.');
  assert.equal(g.x('2023-10-01'), g.left);
  assert.equal(g.x('2026-10-28'), g.width - g.right);
  for (const tier of chart.tiers) {
    const plotted = tier.rows.filter(row => row.price !== null);
    const d = chart.seriesPath(tier, g);
    assert.equal((d.match(/[ML]/g) || []).length, plotted.length, 'Missing prices must not become zero-price points.');
    assert.ok(d.startsWith(`M${g.x(plotted[0].snapshot_date).toFixed(2)},${g.y(plotted[0].price).toFixed(2)}`));
    assert.ok(!/NaN|Infinity/.test(d));
  }
  const sep = chart.tiers[0].rows.find(row => row.snapshot_date === '2025-09-01');
  const oct = chart.tiers[0].rows.find(row => row.snapshot_date === '2025-10-01');
  assert.equal(sep.price, 0.025);
  assert.equal(oct.price, 0.05);
  assert.ok(g.y(oct.price) < g.y(sep.price), 'The real price rise must remain visible.');
  const interrupted = {rows: [chart.first, {...chart.first, price:null}, chart.latest]};
  assert.equal((chart.seriesPath(interrupted, g).match(/M/g) || []).length, 2, 'Missing data splits the line.');
}

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const hero = chart.renderHero(), future = chart.renderCompact();
assert.ok(html.includes(hero) && html.includes(future), 'Both live sections must match their current renderers.');
assert.ok(html.indexOf('class="assignment-banner"') < html.indexOf(hero), 'The task goal and scale precede the supporting cost outlook.');
const ids = [...(hero + future).matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
assert.equal(ids.length, new Set(ids).size, 'Responsive chart descriptions must have unique IDs.');
assert.ok(!/<img|<canvas|<script/.test(hero + future), 'The historical curves are native SVG, not screenshots or a live forecast.');
assert.ok((hero + future).includes('향후 하락은'));
assert.ok((hero + future).includes('CC BY 4.0'));
console.log('PASS token prices: 114 source rows, 38 dates, 3 tiers, log scale, missing data, real increases, exact endpoints, both rendered sections.');
