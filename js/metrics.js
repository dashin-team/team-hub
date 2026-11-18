export function isoDate(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(iso, days) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  date.setDate(date.getDate() + days);
  return isoDate(date);
}

export function weekStart(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const offset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - offset);
  return isoDate(date);
}

export function formatDate(value) {
  if (!value) return "—";
  const iso = String(value).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return "—";
  const [y, m, d] = iso.split("-");
  return `${y}/${m}/${d}`;
}

export function formatNet(net) {
  if (net == null || Number.isNaN(net)) return "—";
  const text = Math.trunc(net).toLocaleString("zh-TW");
  return net > 0 ? `+${text}` : text;
}

export function formatRate(rate) {
  if (rate == null || Number.isNaN(rate)) return "—";
  const sign = rate > 0 ? "+" : "";
  return `${sign}${rate.toFixed(1)}%`;
}

export function growth(latest, previous) {
  if (latest == null || previous == null) return { net: null, rate: null };
  const net = latest - previous;
  if (previous === 0) return { net, rate: null };
  return { net, rate: (net / previous) * 100 };
}

export function isHttpsUrl(value) {
  const text = String(value ?? "").trim();
  if (!text) return true;
  try {
    return new URL(text).protocol === "https:";
  } catch {
    return false;
  }
}

export function isBirthdayMd(value) {
  const text = String(value ?? "").trim();
  if (!text) return true;
  return /^(0[1-9]|1[0-2])-(0[1-9]|[12][0-9]|3[01])$/.test(text);
}

export function isLast4(value) {
  const text = String(value ?? "").trim();
  if (!text) return true;
  return /^[0-9]{4}$/.test(text);
}

export function normalizeStory(posted, count) {
  if (!posted) return { posted: false, story_count: 0 };
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1 || n > 100) {
    return { error: "有發布限動時，則數要介於 1 到 100。" };
  }
  return { posted: true, story_count: n };
}

export function normalizeFollowers(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) return { error: "請輸入 0 以上的整數粉絲數。" };
  return { follower_count: n };
}

export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  }[ch]));
}

export function isServiceRoleKey(key) {
  const text = String(key ?? "");
  if (/service_role/i.test(text)) return true;
  const parts = text.split(".");
  if (parts.length !== 3) return false;
  try {
    let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    const payload = JSON.parse(atob(b64));
    return payload.role === "service_role";
  } catch {
    return false;
  }
}

export function isCloudConfigured(url, key) {
  const u = String(url ?? "").trim();
  const k = String(key ?? "").trim();
  if (!u || !k) return false;
  if (isServiceRoleKey(k)) return false;
  if (/your-|example|placeholder|貼上|changeme/i.test(`${u} ${k}`)) return false;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== "https:") return false;
  } catch {
    return false;
  }
  return k.length >= 20;
}

export const ROLE_LABEL = { admin: "管理員", manager: "主管", member: "一般夥伴" };
// 職級存在 profiles.grade（UM / SP / CA / ADMIN），沒有另外的職稱欄位。中文職稱是畫面用的對照。
export const GRADE_TITLE = { CA: "業務代表", SP: "業務主任", UM: "區經理", ADMIN: "管理員" };
export function gradeTitle(grade) {
  const code = String(grade || "").trim().toUpperCase();
  if (!code) return "";
  if (code === "ADMIN") return GRADE_TITLE.ADMIN;
  const title = GRADE_TITLE[code];
  return title ? `${code} ${title}` : code;
}
export const SOURCE_LABEL = { manual: "手動回報", meta_api: "官方 API", imported: "匯入" };
export const CONNECTION_LABEL = {
  manual: "手動回報",
  pending: "等待授權",
  connected: "已授權",
  expired: "需重新授權",
  revoked: "已取消授權",
};
export const KIND_LABEL = {
  birthday: "生日",
  policy_expiry: "保單到期",
  renewal: "續保",
  follow_up: "追蹤",
  other: "其他",
};
export const POLICY_STATUS = { active: "有效", expired: "已到期", lapsed: "已停效" };
export const SERVICE_TYPES = ["保單檢視", "關懷聯繫", "理賠協助", "需求訪談", "其他"];
export const POLICY_CATEGORIES = ["一次金", "實支實付", "日額・手術", "意外", "長照", "身價", "車險", "醫療保障", "意外保障", "壽險", "年金", "其他"];

export const COVERAGE_AREAS = [
  { id: "lump", label: "一次金", keys: ["一次金", "重大疾病", "癌症"] },
  { id: "reimburse", label: "實支實付", keys: ["實支實付", "實支"] },
  { id: "daily", label: "日額・手術", keys: ["日額", "手術", "住院", "醫療保障", "醫療"] },
  { id: "accident", label: "意外", keys: ["意外", "車險"] },
  { id: "ltc", label: "長照", keys: ["長照"] },
  { id: "life", label: "身價", keys: ["身價", "壽險", "年金"] },
];

export function canManageTeam(role) {
  return role === "admin" || role === "manager";
}

export function canViewPerson(me, person) {
  if (!me || !person) return false;
  if (me.team_id && person.team_id && me.team_id !== person.team_id) return false;
  if (person.id === me.id) return true;
  if (me.role === "admin") return true;
  if (me.role === "manager") return Boolean(me.zone) && person.zone === me.zone;
  return false;
}
