// 快速報價的網站清單。要加新的，在陣列裡補一筆即可。
// 每筆：{ title, url, description, icon }
// url 請用 https；卡片會另開分頁。

export const QUOTE_LINKS = [
  // 範例（先保留註解，之後取消註解或直接加新的即可）：
  // { title: "富邦產險網路投保", url: "https://example.com", description: "車險、旅平線上試算", icon: "🚗" },
];

export function visibleQuoteLinks(links = QUOTE_LINKS) {
  return (links || []).filter((item) => {
    if (!item || !String(item.title || "").trim()) return false;
    const url = String(item.url || "").trim();
    if (!url) return false;
    try {
      return new URL(url).protocol === "https:";
    } catch {
      return false;
    }
  });
}

export function quoteCardHtml(item, esc) {
  const icon = item.icon || "⚡";
  const desc = item.description ? `<small>${esc(item.description)}</small>` : "";
  return `<a class="guide-card" href="${esc(item.url)}" target="_blank" rel="noopener"><span class="guide-icon" aria-hidden="true">${icon}</span><b>${esc(item.title)}</b>${desc}</a>`;
}

export const QUOTE_EMPTY_TEXT = "報價網站整理中，之後會陸續加入";
