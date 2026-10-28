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
for (const id of ['express-count', 'express-active', 'express-completed', 'express-lines', 'express-threshold', 'express-threshold-value']) {
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
    clientWidth: id === 'tree' ? 5000 : 1100, parentElement: { clientWidth: 1100 },
    offsetHeight: id === 'tree' ? 1540 : id === 'flow-toolbar' ? 80 : 32,
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


module.exports={demo,context,getElement,html,animationFrames,staticIds,vm,assert};
