export const CAR_ALIASES = {
  name: ["姓名", "客戶姓名"],
  plate: ["車牌", "車牌號碼"],
  cartype: ["車種"],
  ctdate: ["強制險到期日", "強制險"],
  vodate: ["任意險到期日", "任意險"],
  note: ["備註", "備考", "附註"],
};

export const CAR_TEMPLATE_HEADERS = ["姓名", "車牌", "車種", "強制險到期日", "任意險到期日", "備註"];
export const CAR_TEMPLATE_SHEET = "車險客戶";
export const GUIDE_SHEET_NAME = "填寫說明";
export const CAR_SAMPLE_NOTE = "範例，請刪除";
export const CAR_SAMPLE_NAMES = ["陳範例", "林示範"];

export const CAR_TEMPLATE_SAMPLES = [
  ["王小明", "ABC-1234", "轎車", "116/03/01", "2027/03/01", CAR_SAMPLE_NOTE],
  ["陳範例", "DEF-5678", "機車", "115/12/15", "", CAR_SAMPLE_NOTE],
  ["林示範", "GHI-9012", "休旅車", "2027/06/30", "2027/06/30", CAR_SAMPLE_NOTE],
];

export const CAR_TEMPLATE_GUIDE = [
  ["欄位", "是否必填", "說明"],
  ["姓名", "必填", "客戶姓名"],
  ["車牌", "必填", "車牌號碼，例如 ABC-1234"],
  ["車種", "選填", "例如：轎車、機車、休旅車"],
  ["強制險到期日", "擇一必填", "與任意險到期日至少填一個。可填民國（116/03/01）或西元（2027/03/01）"],
  ["任意險到期日", "擇一必填", "同上。沒有投保可留空"],
  ["備註", "選填", "自由註記。範例列請保留「範例，請刪除」，匯入時會自動略過"],
  ["", "", ""],
  ["注意事項", "", ""],
  ["1", "", "身分證字號不需要填，也不會儲存。請不要把身分證字號放進檔案。"],
  ["2", "", "請在第一個工作表「車險客戶」填資料；本「填寫說明」工作表匯入時會被忽略。"],
  ["3", "", "範例列（備註含「範例」，或姓名正好是陳範例、林示範）匯入時會自動略過。請刪除範例後再填真實資料。"],
  ["4", "", "同一車牌若已存在，匯入後會更新原資料，不會再新增一筆。"],
];

export function pickDataSheet(sheetNames, preferred = CAR_TEMPLATE_SHEET) {
  const names = Array.isArray(sheetNames) ? sheetNames : [];
  if (preferred && names.includes(preferred)) return preferred;
  return names.find((name) => name !== GUIDE_SHEET_NAME) || names[0] || "";
}

export function isCarSampleRow(row) {
  const note = String(row?.note ?? row?.notes ?? row?.["備註"] ?? "");
  const name = String(row?.name ?? row?.["姓名"] ?? row?.["客戶姓名"] ?? "").trim();
  return note.includes("範例") || CAR_SAMPLE_NAMES.includes(name);
}

export function carTemplateSheets() {
  return {
    [CAR_TEMPLATE_SHEET]: [CAR_TEMPLATE_HEADERS, ...CAR_TEMPLATE_SAMPLES],
    [GUIDE_SHEET_NAME]: CAR_TEMPLATE_GUIDE,
  };
}

export function compactHeader(value) {
  return String(value ?? "").replace(/[\s\u3000]/g, "");
}

export function daysUntil(iso, today) {
  const left = parseIso(iso);
  const right = parseIso(today);
  if (!left || !right) return null;
  return Math.round((left - right) / 86400000);
}

export function minDays(row, today) {
  const values = [daysUntil(row?.ct_date, today), daysUntil(row?.vo_date, today)].filter((days) => days != null);
  if (!values.length) return null;
  return Math.min(...values);
}

export function withinWindow(row, today, limit) {
  const days = minDays(row, today);
  return days != null && days >= 0 && days <= limit;
}

export function renewalStatus(days) {
  if (days < 0) return { key: "expired", label: "⚫已過期" };
  if (days <= 7) return { key: "urgent", label: "🚨緊急" };
  if (days <= 30) return { key: "priority", label: "🔴優先處理" };
  if (days <= 60) return { key: "contact", label: "🟠提前聯絡" };
  if (days <= 90) return { key: "prep", label: "🟡預備" };
  return { key: "later", label: "⚪尚未提醒" };
}

export function dayPhrase(days) {
  if (days < 0) return `已過期 ${Math.abs(days)} 天`;
  return `剩 ${days} 天`;
}

export function dateGap(ct, vo) {
  const days = daysUntil(vo, ct);
  if (days == null) return 0;
  return Math.abs(days);
}

function parseIso(iso) {
  const match = String(iso || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return null;
  const date = validDate(match[1], match[2], match[3]);
  return date ? Date.UTC(date.y, date.m - 1, date.d) : null;
}

function validDate(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || m < 1 || m > 12 || d < 1 || d > 31) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return { y, m, d };
}

function isoFromParts(year, month, day) {
  const date = validDate(year, month, day);
  if (!date) return "";
  return `${date.y}-${String(date.m).padStart(2, "0")}-${String(date.d).padStart(2, "0")}`;
}

export function excelSerialToIso(serial) {
  const whole = Math.floor(Number(serial));
  if (!Number.isFinite(whole) || whole < 20000 || whole > 80000) return "";
  const date = new Date(Date.UTC(1899, 11, 30) + whole * 86400000);
  return isoFromParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
}

export function parseImportDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, "0");
    const d = String(value.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }
  if (typeof value === "number") return excelSerialToIso(value);
  const text = String(value ?? "").trim();
  if (!text) return "";
  if (/^\d+(\.\d+)?$/.test(text)) return excelSerialToIso(Number(text));
  const roc = text.match(/^(\d{1,3})[/.\\-](\d{1,2})[/.\\-](\d{1,2})/);
  if (roc) {
    const year = Number(roc[1]);
    return isoFromParts(year + 1911, roc[2], roc[3]);
  }
  const western = text.match(/^(\d{4})[/.\\-](\d{1,2})[/.\\-](\d{1,2})/);
  if (western) return isoFromParts(western[1], western[2], western[3]);
  return "";
}

export function normalizeCarInput(input) {
  const name = String(input?.name || "").trim();
  const plate = String(input?.plate || "").trim();
  const carType = String(input?.car_type || "").trim();
  const ct = String(input?.ct_date || "").slice(0, 10);
  const vo = String(input?.vo_date || "").slice(0, 10);
  const note = String(input?.note || "").trim();
  if (!name) return { error: "請填客戶姓名" };
  if (name.length > 80) return { error: "姓名太長" };
  if (!plate) return { error: "請填車牌號碼" };
  if (plate.length > 20) return { error: "車牌太長" };
  if (carType.length > 40) return { error: "車種太長" };
  const ctIso = parseIso(ct) ? ct : "";
  const voIso = parseIso(vo) ? vo : "";
  if (!ctIso && !voIso) return { error: "請至少填一個到期日" };
  if (note.length > 2000) return { error: "備註太長" };
  return {
    fields: {
      name,
      plate,
      car_type: carType || null,
      ct_date: ctIso || null,
      vo_date: voIso || null,
      note: note || null,
    },
  };
}

function fieldOf(header) {
  const key = compactHeader(header);
  for (const [field, aliases] of Object.entries(CAR_ALIASES)) {
    if (aliases.includes(key)) return field;
  }
  return "";
}

export function mapImportRecords(records) {
  if (!Array.isArray(records) || !records.length) {
    return { error: "這個檔案沒有客戶資料", rows: [], skipped: 0 };
  }
  const map = {};
  for (const header of Object.keys(records[0])) {
    const field = fieldOf(header);
    if (field && !map[field]) map[field] = header;
  }
  if (!map.name || !map.plate) {
    return { error: "找不到姓名或車牌欄位。請用範本的欄位名稱。", rows: [], skipped: 0 };
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
      continue;
    }
    rows.push(parsed.fields);
  }
  return { rows, skipped, samples };
}
