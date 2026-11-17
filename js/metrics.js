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
export const POLICY_CATEGORIES = ["車險", "醫療保障", "意外保障", "壽險", "年金", "其他"];

export function canManageTeam(role) {
  return role === "admin" || role === "manager";
}
