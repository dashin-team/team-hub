import assert from "node:assert/strict";
import {
  LOADER_MAX_MS,
  LOADER_MIN_MS,
  LOADER_TEXT,
  createLoaderController,
  inlineLoaderHtml,
  remainingMinMs,
} from "../js/loader.js";

assert.equal(LOADER_MIN_MS, 400);
assert.equal(LOADER_MAX_MS, 8000);
assert.equal(LOADER_TEXT, "載入中…");
assert.equal(remainingMinMs(1000, 1100), 300);
assert.equal(remainingMinMs(1000, 1500), 0);
assert.equal(remainingMinMs(0, 2000), 0);

const html = inlineLoaderHtml("https://example.com/logo.png", (value) => String(value));
assert.ok(html.includes("brand-loader-inline"));
assert.ok(html.includes("載入中…"));
assert.ok(html.includes("https://example.com/logo.png"));
assert.ok(html.includes("brand-loader-ring"));

const escaped = inlineLoaderHtml("\"><img src=x>", (value) => String(value).replaceAll('"', "&quot;"));
assert.ok(escaped.includes("&quot;"));
assert.ok(!escaped.includes('src=""><img'));

let now = 0;
const timers = new Map();
let tid = 0;
const fire = async (ms) => {
  now += ms;
  const due = [...timers.entries()].filter(([, item]) => item.at <= now);
  for (const [id, item] of due) {
    timers.delete(id);
    item.fn();
  }
};
const el = { hidden: true, className: "", attrs: {} };
el.classList = {
  toggle(name, on) {
    const parts = new Set(el.className.split(" ").filter(Boolean));
    if (on) parts.add(name);
    else parts.delete(name);
    el.className = [...parts].join(" ");
  },
};
el.setAttribute = (key, value) => { el.attrs[key] = value; };

const loader = createLoaderController({
  getEl: () => el,
  now: () => now,
  timer: (fn, ms) => {
    const id = ++tid;
    timers.set(id, { fn, at: now + ms });
    return id;
  },
  clear: (id) => timers.delete(id),
});

loader.show();
assert.equal(el.hidden, false);
assert.equal(el.attrs["aria-busy"], "true");
const hideP = loader.hide();
await fire(399);
assert.equal(el.hidden, false, "should stay visible before 400ms");
await fire(1);
await hideP;
assert.equal(el.hidden, true, "should hide once the minimum has passed");

loader.show();
await fire(8000);
assert.equal(el.hidden, true, "should hide at the 8s fallback");

console.log("loader checks passed");
