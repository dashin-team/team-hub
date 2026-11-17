export const FBFLI_ACTIONS = ["訊息定聯", "貼圖回覆", "回覆限動"];

export function cleanActions(list) {
  const allowed = new Set(FBFLI_ACTIONS);
  const out = [];
  for (const item of list || []) {
    const text = String(item || "").trim();
    if (allowed.has(text) && !out.includes(text)) out.push(text);
  }
  return out;
}

export function aliasFor(customer) {
  if (customer?.gender === "女") return "A 小姐";
  if (customer?.gender === "男") return "A 先生";
  return "A 先生/小姐";
}

export function redactNote(note, customer) {
  let text = String(note || "");
  const alias = aliasFor(customer);
  const names = [customer?.display_name, customer?.nickname]
    .map((item) => String(item || "").trim())
    .filter(Boolean);
  for (const name of names) {
    text = text.split(name).join(alias);
    const bare = name.replace(/（示範）/g, "").trim();
    if (bare && bare !== name) text = text.split(bare).join(alias);
  }
  const phone = String(customer?.phone || "").trim();
  if (phone) text = text.split(phone).join("");
  text = text.replace(/0\d[\d\-\s]{7,}\d/g, "");
  return text.replace(/[ \t]{2,}/g, " ").trim();
}

function clip(text) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > 42 ? `${clean.slice(0, 42)}…` : clean;
}

export function summarizeNoteLocal(note) {
  const text = String(note || "").trim();
  if (!text) return "";
  const parts = text.split(/[。！？!?；;\n]+/).map((item) => item.trim()).filter((item) => item.length > 1);
  const buckets = [
    ["家人近況", /家人|小孩|太太|先生|配偶|爸|媽|孩子|父母|兒子|女兒|段考/],
    ["在意的事", /在意|擔心|想要|想再|需求|希望|怕|顧慮|教育金|醫療/],
    ["答應他的事", /答應|幫他|幫她|會準備|寄給|傳給|補上|週五|比較/],
    ["下次聯絡時間", /下次|下週|明天|後天|約好|再聯絡|再聊|改天|星期/],
  ];
  const used = new Set();
  const bullets = [];
  for (const [label, pattern] of buckets) {
    const hit = parts.find((part) => pattern.test(part) && !used.has(part));
    if (!hit) continue;
    used.add(hit);
    bullets.push(`${label}：${clip(hit)}`);
  }
  for (const part of parts) {
    if (bullets.length >= 5) break;
    if (used.has(part)) continue;
    used.add(part);
    bullets.push(clip(part));
  }
  return bullets.slice(0, 5).join("\n");
}
