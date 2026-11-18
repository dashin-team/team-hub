// 快速報價的網站清單。要加新的，在陣列裡補一筆即可。
// 每筆：{ title, url, description, icon }
// url 請用 https；卡片會另開分頁。

export const QUOTE_LINKS = [
  { title: "旅平險報價", url: "https://gbnetwork168.github.io/nanen-travel-quote/editor.html" },
  { title: "骨折險", url: "https://dashin-team.github.io/accident-insurance/" },
  { title: "CIA&CIB", url: "https://dashin-team.github.io/cia-cib-cancer/" },
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
  const icon = item.icon ? `<span class="guide-icon" aria-hidden="true">${esc(item.icon)}</span>` : "";
  const desc = item.description ? `<small>${esc(item.description)}</small>` : "";
  return `<a class="guide-card" href="${esc(item.url)}" target="_blank" rel="noopener">${icon}<b>${esc(item.title)}</b>${desc}</a>`;
}

export const QUOTE_EMPTY_TEXT = "報價網站整理中，之後會陸續加入";
