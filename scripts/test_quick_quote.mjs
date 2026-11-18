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
console.log("quick quote checks passed");
