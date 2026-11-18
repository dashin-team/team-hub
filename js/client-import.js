// 名單 Excel 匯入：欄位對應、客戶類型轉換、重複檢查。只讀表頭認得的欄位，身分證字號不會存。

export const CLIENT_TEMPLATE_HEADERS = ["姓名", "手機", "客戶分級", "客戶類型", "生日", "性別", "聯絡方式", "客戶來源", "介紹人", "興趣/嗜好", "備註"];

export const CLIENT_TEMPLATE_SAMPLE = ["王小明（示範）", "0912-345-678", "B", "人壽險、機車險", "80/05/20", "男", "LINE", "朋友介紹", "", "登山", "示範資料，可刪除"];

const ALIASES = {
  display_name: ["姓名", "客戶姓名", "客戶名稱", "名字", "客戶"],
  phone: ["手機", "電話", "手機號碼", "行動電話", "聯絡電話", "手機/電話", "電話/手機"],
  grade: ["客戶分級", "分級", "等級", "客戶等級"],
  client_types: ["客戶類型", "類型"],
  birth: ["生日", "出生日期", "出生年月日", "民國生日"],
  gender: ["性別"],
  contact_method: ["聯絡方式"],
  lead_source: ["客戶來源", "來源"],
  referrer: ["介紹人", "轉介紹人"],
  hobbies: ["興趣/嗜好", "興趣", "嗜好", "興趣嗜好"],
  nickname: ["暱稱"],
  email: ["電子信箱", "email", "e-mail", "信箱", "電子郵件"],
  notes: ["備註", "備考", "附註"],
};

const LIMITS = { display_name: 80, phone: 30, contact_method: 200, lead_source: 200, referrer: 200, hobbies: 200, nickname: 80, email: 200, notes: 4000 };

const TYPE_ALIASES = {
  壽險: "人壽險",
  人壽: "人壽險",
  投資: "投資型",
  機車: "機車險",
  汽車: "汽車險",
  旅平: "旅平險",
  旅遊險: "旅平險",
  團體險: "團險",
  產險: "產險健康險",
  健康險: "產險健康險",
};

const ID_RE = /[A-Za-z][12489][0-9]{8}/g;

export function compactKey(value) {
  return String(value ?? "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[\s\u3000]/g, "")
    .replace(/[／]/g, "/")
    .toLowerCase();
}

export function isIdentityHeader(header) {
  const key = compactKey(header);
  return /身分證|身份證|證號|統一編號|^id$|idno|身分字號/.test(key);
}

export function clientHeaderMap(headers) {
  const map = {};
  for (const header of headers || []) {
    if (isIdentityHeader(header)) continue;
    const key = compactKey(header);
    for (const [field, aliases] of Object.entries(ALIASES)) {
      if (!map[field] && aliases.some((alias) => compactKey(alias) === key)) map[field] = header;
    }
  }
  return map;
}

function toHalf(value) {
  return String(value ?? "").replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0));
}

export function stripIdentity(value) {
  return String(value ?? "").replace(ID_RE, "＊＊＊");
}

function cleanText(value, max) {
  const text = stripIdentity(String(value ?? "").replace(/\r\n/g, "\n").trim());
  return max ? text.slice(0, max) : text;
}

export function cleanPhone(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const digits = String(Math.round(value));
    return digits.length === 9 && digits.startsWith("9") ? `0${digits}` : digits;
  }
  return cleanText(toHalf(value), LIMITS.phone);
}

export function phoneDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

export function clientKey(name, phone) {
  return `${String(name ?? "").replace(/[\s\u3000]/g, "")}|${phoneDigits(phone)}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

function isoFrom(y, m, d) {
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "";
  return `${y}-${pad(m)}-${pad(d)}`;
}

// 生日：Excel 日期、西元 yyyy/m/d 轉成 yyyy-mm-dd；民國字串原樣留給 parseBirth 檢查。
export function cleanBirth(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return isoFrom(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const whole = Math.floor(value);
    if (whole >= 1 && whole <= 80000) {
      const date = new Date(Date.UTC(1899, 11, 30) + whole * 86400000);
      return isoFrom(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
    }
    return String(value);
  }
  const text = toHalf(value).trim();
  const western = /^(\d{4})[/.\-年](\d{1,2})[/.\-月](\d{1,2})日?$/.exec(text);
  if (western) return isoFrom(Number(western[1]), Number(western[2]), Number(western[3])) || text;
  const roc = /^(民前)?(\d{1,3})[.\-年](\d{1,2})[.\-月](\d{1,2})日?$/.exec(text);
  if (roc) return `${roc[1] || ""}${roc[2]}/${pad(roc[3])}/${pad(roc[4])}`;
  return text;
}

export function cleanGrade(value) {
  const text = toHalf(value).trim().toUpperCase().replace(/級$/, "");
  return text;
}

export function cleanGender(value) {
  const text = String(value ?? "").trim();
  if (/^(男|男性|先生|m|male)$/i.test(text)) return "男";
  if (/^(女|女性|小姐|f|female)$/i.test(text)) return "女";
  return "";
}

function typeBase(label) {
  return String(label).replace(/^\P{Script=Han}+/u, "").replace(/客戶$/, "");
}

// 「人壽險、機車險」→ ["🏃人壽險客戶", "🛵機車險客戶"]；不認得的放 unknown。
export function mapClientTypes(value, clientTypes) {
  const list = Array.isArray(value) ? value : String(value ?? "").split(/[,，、;；/／\n]+/);
  const types = [];
  const unknown = [];
  for (const raw of list) {
    const text = String(raw ?? "").trim();
    if (!text) continue;
    let base = typeBase(text).replace(/[\s\u3000]/g, "");
    base = TYPE_ALIASES[base] || base;
    const found = clientTypes.find((label) => label === text || typeBase(label) === base);
    if (found) {
      if (!types.includes(found)) types.push(found);
    } else if (!unknown.includes(text)) {
      unknown.push(text);
    }
  }
  return { types, unknown };
}

export function typesText(types) {
  return (types || []).map(typeBase).join("、");
}

function blankRecord(record, map) {
  return Object.values(map).every((header) => String(record[header] ?? "").trim() === "");
}

export function mapClientRecords(records, clientTypes) {
  if (!Array.isArray(records) || !records.length) return { error: "這個檔案沒有名單資料", rows: [], blank: 0 };
  const headers = [...new Set(records.flatMap((record) => Object.keys(record || {})))];
  const map = clientHeaderMap(headers);
  if (!map.display_name) return { error: "找不到「姓名」欄位。請用「下載範本」的欄位名稱。", rows: [], blank: 0 };
  const rows = [];
  let blank = 0;
  for (const record of records) {
    if (!record || blankRecord(record, map)) {
      blank += 1;
      continue;
    }
    const get = (field) => (map[field] ? record[map[field]] : "");
    const mapped = mapClientTypes(get("client_types"), clientTypes);
    const row = {
      display_name: cleanText(get("display_name"), LIMITS.display_name),
      phone: cleanPhone(get("phone")),
      grade: cleanGrade(get("grade")),
      client_types: mapped.types,
      unknown_types: mapped.unknown,
      birth: cleanBirth(get("birth")),
      gender: cleanGender(get("gender")),
    };
    for (const field of ["contact_method", "lead_source", "referrer", "hobbies", "nickname", "email", "notes"]) {
      row[field] = cleanText(get(field), LIMITS[field]);
    }
    rows.push(row);
  }
  return { rows, blank, columns: Object.keys(map) };
}

// 標記已存在（同姓名＋手機）與檔案內重複。
export function markDuplicates(rows, existing) {
  const seen = new Set((existing || []).map((item) => clientKey(item.display_name, item.phone)));
  const inFile = new Set();
  return rows.map((row) => {
    const key = clientKey(row.display_name, row.phone);
    const exists = Boolean(row.display_name) && seen.has(key);
    const repeat = Boolean(row.display_name) && !exists && inFile.has(key);
    inFile.add(key);
    return { ...row, exists, repeat };
  });
}
