// 名單欄位與五項度。換季競賽網址不在這裡，在 js/contest.js。

export const ANALYSIS_SECTIONS = [
  { n: 1, key: "worry", field: "analysis_worry", title: "擔心風險或負擔", hint: "（客戶目前擔心的事情、風險或經濟壓力）" },
  { n: 2, key: "dream", field: "analysis_dream", title: "夢想或理財目標", hint: "（客戶未來想達成的目標、夢想及財務規劃）" },
  { n: 3, key: "work", field: "analysis_work", title: "工作／收入／支出／負債", hint: "（職業、收入來源、每月支出、貸款及負債狀況）" },
  {
    n: 4,
    key: "existing",
    field: "analysis_existing",
    title: "現有保險或理財規劃",
    hint: "",
    subs: [
      { field: "analysis_insured", label: "要保人" },
      { field: "analysis_beneficiary", label: "受益人" },
      { field: "analysis_pay_method", label: "繳法" },
    ],
  },
  { n: 5, key: "profile", title: "準客戶資料分析", auto: true },
  { n: 6, key: "decision", field: "analysis_decision", title: "決策者／影響因子／競爭者", hint: "（誰是主要決策者？誰會影響客戶的決定？是否有其他業務員或金融機構競爭？）" },
  { n: 7, key: "health", field: "analysis_health", title: "身體狀況", hint: "（健康情形、過去病史、目前身體狀況）" },
  { n: 8, key: "next", field: "analysis_next", title: "下一步行動計劃", hint: "（後續聯繫、約訪、需求分析、提案及追蹤時間）" },
  { n: 9, key: "family", field: "analysis_family", title: "家庭成員", hint: "（配偶、子女、父母及其他重要家庭成員）" },
];

export const PROFILE_TEXT_FIELDS = [
  "nickname",
  "referrer",
  "contact_method",
  "hobbies",
  "lead_source",
  "notes",
  "analysis_worry",
  "analysis_dream",
  "analysis_work",
  "analysis_existing",
  "analysis_insured",
  "analysis_beneficiary",
  "analysis_pay_method",
  "analysis_decision",
  "analysis_health",
  "analysis_next",
  "analysis_family",
];

export function rocLabel(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || "").slice(0, 10));
  if (!match) return "";
  const year = Number(match[1]) - 1911;
  const label = year > 0 ? String(year) : `民前${1 - year}`;
  return `${label}/${match[2]}/${match[3]}`;
}

export function parseRoc(value) {
  const text = String(value ?? "").trim();
  if (!text) return { iso: null, md: null };
  const match = /^(民前)?(\d{1,3})\/(\d{1,2})\/(\d{1,2})$/.exec(text);
  if (!match) return { error: "生日請用民國年，例如 92/03/15。" };
  let roc = Number(match[2]);
  if (match[1]) roc = 1 - roc;
  const month = Number(match[3]);
  const day = Number(match[4]);
  const ad = roc + 1911;
  if (ad < 1900 || ad > 2100) return { error: "生日年份超出範圍。" };
  const date = new Date(Date.UTC(ad, month - 1, day));
  if (date.getUTCFullYear() !== ad || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return { error: "生日日期不正確。" };
  }
  const iso = `${ad}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  return { iso, md: iso.slice(5) };
}

export function relationLabel(social, business) {
  const left = String(social ?? "").trim();
  const right = String(business ?? "").trim();
  if (!left && !right) return "";
  return `社交 ${left || "＿"} vs. 商業 ${right || "＿"}`;
}

function cleanScore(value) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const score = Number(value);
  if (!Number.isInteger(score) || score < 1 || score > 10) return { error: "關係定位請選 1 到 10 分。" };
  return score;
}

export function normalizeCustomerInput(input) {
  const fields = {};
  for (const key of PROFILE_TEXT_FIELDS) fields[key] = String(input[key] ?? "").trim();
  const roc = String(input.birth_roc ?? "").trim();
  if (roc) {
    const parsed = parseRoc(roc);
    if (parsed.error) return parsed;
    fields.birth_date = parsed.iso;
    fields.birthday_md = parsed.md;
  } else if (input.birth_date) {
    const iso = String(input.birth_date).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return { error: "生日日期不正確。" };
    fields.birth_date = iso;
    fields.birthday_md = iso.slice(5);
  } else {
    fields.birth_date = null;
    const md = String(input.birthday_md ?? "").trim();
    if (md && !/^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(md)) return { error: "生日月日格式不正確。" };
    fields.birthday_md = md || null;
  }
  const gender = String(input.gender ?? "").trim();
  if (gender && gender !== "男" && gender !== "女") return { error: "性別請選男或女。" };
  fields.gender = gender || null;
  for (const key of ["relation_social", "relation_business"]) {
    const score = cleanScore(input[key]);
    if (score && typeof score === "object" && score.error) return score;
    fields[key] = score;
  }
  const name = String(input.display_name ?? "").trim();
  if (!name) return { error: "請填姓名。" };
  fields.display_name = name;
  fields.phone = String(input.phone ?? "").trim();
  return { fields };
}

export function gridCells(draft) {
  const summary = [
    `姓名：${draft.display_name || "＿"}`,
    `性別：${draft.gender || "＿"}`,
    `生日：${String(draft.birth_roc || "").trim() || "＿"}`,
    `聯絡方式：${draft.contact_method || "＿"}`,
    `興趣／嗜好：${draft.hobbies || "＿"}`,
    `來源：${draft.lead_source || "＿"}`,
    `關係定位：${relationLabel(draft.relation_social, draft.relation_business) || "社交＿ vs. 商業＿"}`,
  ].join("\n");
  return ANALYSIS_SECTIONS.map((section) => {
    const heading = `${section.n}. ${section.title}`;
    if (section.auto) return { ...section, heading, text: summary, filled: false, editable: false };
    const body = String(draft[section.field] || "");
    let filled = body.trim().length > 0;
    let text = body.trim();
    if (section.subs) {
      const extra = section.subs.map((sub) => `${sub.label}：${String(draft[sub.field] || "").trim()}`).join("\n");
      filled = filled || section.subs.some((sub) => String(draft[sub.field] || "").trim());
      text = [text, extra].filter(Boolean).join("\n");
    }
    return { ...section, heading, text, filled, editable: true };
  });
}

export function filledCount(cells) {
  return cells.filter((cell) => cell.filled).length;
}

function canvasFont(weight, size) {
  return `${weight} ${size}px "PingFang TC", "Noto Sans TC", "Microsoft JhengHei", sans-serif`;
}

function wrapLines(ctx, text, maxWidth) {
  const lines = [];
  for (const para of String(text || "").split("\n")) {
    if (!para) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const ch of Array.from(para)) {
      const next = line + ch;
      if (line && ctx.measureText(next).width > maxWidth) {
        lines.push(line);
        line = ch;
      } else {
        line = next;
      }
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : [""];
}

export async function renderAnalysisPng(cells, clientName) {
  if (document.fonts?.ready) await document.fonts.ready;
  const width = 1080;
  const margin = 28;
  const inner = width - margin * 2;
  const colW = inner / 3;
  const textW = colW - 28;
  const measure = document.createElement("canvas").getContext("2d");
  const headFont = canvasFont(700, 22);
  const bodyFont = canvasFont(400, 20);
  const rows = [0, 1, 2].map((index) => {
    const slice = cells.slice(index * 3, index * 3 + 3).map((cell) => {
      measure.font = headFont;
      const heads = wrapLines(measure, cell.heading, textW);
      measure.font = bodyFont;
      const lines = wrapLines(measure, cell.text, textW);
      const height = 16 + heads.length * 30 + 8 + lines.length * 30 + 16;
      return { ...cell, heads, lines, height };
    });
    return { cells: slice, height: Math.max(150, ...slice.map((cell) => cell.height)) };
  });
  const titleBlock = clientName ? 96 : 72;
  const tableH = rows.reduce((sum, row) => sum + row.height, 0);
  const height = margin + titleBlock + tableH + margin;
  const scale = 2;
  const canvas = document.createElement("canvas");
  canvas.width = width * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext("2d");
  ctx.scale(scale, scale);
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#111111";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = canvasFont(700, 34);
  ctx.fillText("客戶資料分析表", width / 2, margin + 28);
  if (clientName) {
    ctx.font = canvasFont(400, 18);
    ctx.fillText(clientName, width / 2, margin + 64);
  }
  let y = margin + titleBlock;
  const x0 = margin;
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#111111";
  ctx.strokeRect(x0 + 1, y + 1, inner - 2, tableH - 2);
  for (const row of rows) {
    for (let col = 0; col < 3; col += 1) {
      const x = x0 + col * colW;
      ctx.strokeRect(x, y, colW, row.height);
      const cell = row.cells[col];
      ctx.fillStyle = "#111111";
      ctx.textAlign = "center";
      ctx.font = headFont;
      cell.heads.forEach((line, lineNo) => {
        ctx.fillText(line, x + colW / 2, y + 22 + lineNo * 30);
      });
      ctx.textAlign = "left";
      ctx.font = bodyFont;
      const bodyTop = y + 16 + cell.heads.length * 30 + 8;
      cell.lines.forEach((line, lineNo) => {
        ctx.fillText(line, x + 14, bodyTop + lineNo * 30 + 10);
      });
    }
    y += row.height;
  }
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("圖片沒有產生。");
  return blob;
}
