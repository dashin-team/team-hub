import assert from "node:assert/strict";
import { QUOTE_EMPTY_TEXT, QUOTE_LINKS, quoteCardHtml, visibleQuoteLinks } from "../js/quick-quote.js";

assert.ok(Array.isArray(QUOTE_LINKS));
assert.equal(visibleQuoteLinks([]).length, 0);
assert.equal(visibleQuoteLinks(QUOTE_LINKS).length, QUOTE_LINKS.length);
assert.equal(visibleQuoteLinks([
  { title: "測試站", url: "http://example.com", description: "不可用", icon: "x" },
  { title: "安全站", url: "https://example.com/quote", description: "說明", icon: "⚡" },
  { title: "", url: "https://example.com" },
  { title: "沒網址", url: "" },
]).length, 1);
assert.equal(QUOTE_EMPTY_TEXT, "報價網站整理中，之後會陸續加入");
const html = quoteCardHtml({ title: "安全站", url: "https://example.com/quote", description: "說明", icon: "⚡" }, (value) => String(value));
assert.ok(html.includes('target="_blank"') && html.includes("noopener") && html.includes("安全站") && html.includes("https://example.com/quote"));
const bare = quoteCardHtml({ title: "旅平險報價", url: "https://gbnetwork168.github.io/nanen-travel-quote/editor.html" }, (value) => String(value));
assert.ok(bare.includes('target="_blank"') && bare.includes("noopener") && !bare.includes("⚡") && !bare.includes("guide-icon"));
const visible = visibleQuoteLinks();
assert.equal(visible.length, 3);
assert.deepEqual(visible.map((item) => item.title), ["旅平險報價", "骨折險", "CIA&CIB"]);
assert.deepEqual(visible.map((item) => item.url), [
  "https://gbnetwork168.github.io/nanen-travel-quote/editor.html",
  "https://dashin-team.github.io/accident-insurance/",
  "https://dashin-team.github.io/cia-cib-cancer/",
]);
assert.ok(!QUOTE_LINKS.some((item) => /儲蓄險|醫療險/.test(item.title || "")));
console.log("quick quote checks passed");
