import { compactHeader, isCarSampleRow, normalizeCarInput, parseImportDate } from "./car-renewals.js";

const SKIP_WORDS = new Set([
  "被保人", "要保人", "被保險", "要保險", "被保險人", "要保人姓",
  "強制險", "任意險", "機車", "汽車", "險種", "險種別",
  "保期", "交易", "交易日", "明細", "電子", "保單", "狀態",
  "同意", "註記", "續保", "續繳", "約定", "保費", "身份證", "身分證",
]);

const PLATE_RE = /(?<![A-Z0-9])([A-Z]{2,3}\s*[-–—]?\s*\d{3,4}|\d{4}\s*[-–—]?\s*[A-Z]\d|\d{3}\s*[-–—]?\s*[A-Z]{3})(?![A-Z0-9])/i;
const PERIOD_RE = /(\d{3}\/\d{2}\/\d{2})\s*[~～\-–—至到]\s*(\d{3}\/\d{2}\/\d{2})/;
const ID_PATTERN = "[A-Za-z][12][0-9*]{6,}";

export function toHalf(value) {
  return String(value ?? "").replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)).replace(/\u3000/g, " ");
}

export function normalizePlate(raw) {
  const compact = toHalf(raw).toUpperCase().replace(/[\s–—-]/g, "");
  const letterDigit = compact.match(/^([A-Z]{2,3})(\d{3,4})$/);
  if (letterDigit) return `${letterDigit[1]}-${letterDigit[2]}`;
  const four = compact.match(/^(\d{4})([A-Z]\d)$/);
  if (four) return `${four[1]}-${four[2]}`;
  const three = compact.match(/^(\d{3})([A-Z]{3})$/);
  if (three) return `${three[1]}-${three[2]}`;
  const digitsFirst = compact.match(/^(\d{3,4})([A-Z]{2,3})$/);
  if (digitsFirst) return `${digitsFirst[1]}-${digitsFirst[2]}`;
  return toHalf(raw).toUpperCase().replace(/[–—]/g, "-").replace(/\s+/g, "");
}

export function rocToIso(token) {
  const match = String(token || "").match(/(\d{2,3})\/(\d{1,2})\/(\d{1,2})/);
  if (!match) return "";
  const year = Number(match[1]);
  const y = year >= 1911 ? year : year + 1911;
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return "";
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

function stripIds(text) {
  return text.replace(new RegExp(ID_PATTERN, "g"), " ");
}

export function findPlate(text) {
  const match = toHalf(text).toUpperCase().match(PLATE_RE);
  if (!match) return null;
  return { raw: match[0], plate: normalizePlate(match[0]) };
}

export function parseFubonRow(line) {
  let text = stripIds(toHalf(line)).replace(/\s+/g, " ").trim();
  if (!text) return null;
  const period = text.match(PERIOD_RE);
  const expiry = period ? rocToIso(period[2]) : "";
  if (period) text = text.replace(period[0], " ");
  const kind = text.match(/機車強制險|汽車強制險|機車任意險|汽車任意險/);
  let carType = "";
  let slot = "";
  if (kind) {
    carType = kind[0].startsWith("機車") ? "機車" : "汽車";
    slot = kind[0].includes("任意") ? "vo" : "ct";
    text = text.replace(kind[0], " ");
  }
  const found = findPlate(text);
  if (found) text = text.replace(found.raw, " ");
  text = text.replace(/^\d{3}\/\d{2}\/\d{2}/, " ").replace(/\d{2,4}\/\d{2}\/\d{2}/g, " ");
  const name = (text.match(/[\u4e00-\u9fff]{2,4}/g) || []).find((word) => !SKIP_WORDS.has(word)) || "";
  if (!found && !(kind && expiry)) return null;
  return {
    name,
    plate: found?.plate || "",
    car_type: carType,
    ct_date: slot === "ct" ? expiry : "",
    vo_date: slot === "vo" ? expiry : "",
  };
}

function protectPeriods(text) {
  const periods = [];
  const masked = text.replace(new RegExp(PERIOD_RE.source, "g"), (match) => {
    const token = `⟦P${periods.length}⟧`;
    periods.push(match);
    return token;
  });
  return { masked, periods };
}

function restorePeriods(text, periods) {
  return text.replace(/⟦P(\d+)⟧/g, (_, index) => periods[Number(index)] || "");
}

export function splitFubonRows(text) {
  const source = toHalf(text).replace(/\r/g, "");
  const { masked, periods } = protectPeriods(source);
  const parts = masked.split(/(?=(?:^|\n)\s*\d{3}\/\d{2}\/\d{2})|\n+/).map((part) => part.trim()).filter(Boolean);
  const rows = [];
  for (const part of parts) {
    const chunks = part.split(/(?=\d{3}\/\d{2}\/\d{2})/).map((chunk) => chunk.trim()).filter(Boolean);
    const dated = chunks.filter((chunk) => /^\d{3}\/\d{2}\/\d{2}/.test(chunk));
    const chosen = dated.length ? dated : chunks;
    for (const chunk of chosen) rows.push(restorePeriods(chunk, periods));
  }
  return rows.filter((row) => row && !/^交易日/.test(row));
}

export function parseFubonText(text) {
  return mergeByPlate(splitFubonRows(text).map(parseFubonRow).filter(Boolean));
}

export function mergeByPlate(rows) {
  const order = [];
  const map = new Map();
  for (const row of rows || []) {
    const plate = normalizePlate(row.plate || "");
    if (!plate) {
      order.push({ ...row, plate: "" });
      continue;
    }
    const current = map.get(plate);
    if (!current) {
      const created = {
        name: row.name || "",
        plate,
        car_type: row.car_type || "",
        ct_date: row.ct_date || "",
        vo_date: row.vo_date || "",
      };
      map.set(plate, created);
      order.push(created);
      continue;
    }
    if (!current.name && row.name) current.name = row.name;
    if (!current.car_type && row.car_type) current.car_type = row.car_type;
    if (row.ct_date) current.ct_date = row.ct_date;
    if (row.vo_date) current.vo_date = row.vo_date;
  }
  return order;
}

export function linesFromTextItems(items) {
  const rows = [];
  const sorted = (items || [])
    .filter((item) => item && String(item.str || "").trim())
    .sort((a, b) => b.y - a.y || a.x - b.x);
  for (const item of sorted) {
    const row = rows.find((entry) => Math.abs(entry.y - item.y) <= 3);
    if (row) row.items.push(item);
    else rows.push({ y: item.y, items: [item] });
  }
  return rows
    .map((row) => row.items.sort((a, b) => a.x - b.x).map((item) => String(item.str).trim()).join(" ").replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

const HEADER_ALIASES = {
  name: ["姓名", "客戶姓名", "被保人姓名", "被保險人姓名"],
  plate: ["車牌", "車牌號碼"],
  cartype: ["車種"],
  kind: ["險種別"],
  period: ["保期"],
  ctdate: ["強制險到期日", "強制險"],
  vodate: ["任意險到期日", "任意險"],
  note: ["備註", "備考", "附註"],
};

function headerMap(record) {
  const map = {};
  for (const header of Object.keys(record || {})) {
    const key = compactHeader(header);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (!map[field] && aliases.includes(key)) map[field] = header;
    }
  }
  return map;
}

function draftFromFields(fields) {
  return {
    name: fields.name || "",
    plate: normalizePlate(fields.plate || ""),
    car_type: fields.car_type || "",
    ct_date: fields.ct_date || "",
    vo_date: fields.vo_date || "",
  };
}

export function parseSpreadsheetRecords(records) {
  if (!Array.isArray(records) || !records.length) {
    return { error: "這個檔案沒有客戶資料", rows: [], skipped: 0 };
  }
  const map = headerMap(records[0]);
  if (map.kind && map.plate && map.period) {
    const parsed = [];
    let skipped = 0;
    let samples = 0;
    for (const record of records) {
      const draft = {
        name: map.name ? record[map.name] : "",
        note: map.note ? record[map.note] : "",
      };
      if (isCarSampleRow(draft)) {
        samples += 1;
        skipped += 1;
        continue;
      }
      const row = parseFubonRow([record[map.name], record[map.kind], record[map.plate], record[map.period]].filter(Boolean).join(" "));
      if (!row || (!row.plate && !row.name)) skipped += 1;
      else parsed.push(row);
    }
    return { rows: mergeByPlate(parsed), skipped, samples };
  }
  if (!map.name || !map.plate) {
    return { error: "找不到姓名或車牌欄位。請用範本或產險總覽的欄位名稱。", rows: [], skipped: 0 };
  }
  const rows = [];
  let skipped = 0;
  let samples = 0;
  for (const record of records) {
    const draft = {
      name: record[map.name],
      plate: record[map.plate],
      car_type: map.cartype ? record[map.cartype] : "",
      ct_date: parseImportDate(map.ctdate ? record[map.ctdate] : ""),
      vo_date: parseImportDate(map.vodate ? record[map.vodate] : ""),
      note: map.note ? record[map.note] : "",
    };
    if (isCarSampleRow(draft)) {
      samples += 1;
      skipped += 1;
      continue;
    }
    const parsed = normalizeCarInput(draft);
    if (parsed.error) {
      skipped += 1;
      rows.push(draftFromFields(draft));
      continue;
    }
    rows.push(draftFromFields(parsed.fields));
  }
  return { rows: mergeByPlate(rows), skipped, samples };
}

export function containsIdentityNumber(value) {
  return new RegExp(ID_PATTERN).test(toHalf(value));
}
