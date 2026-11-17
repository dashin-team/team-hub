import {
  addDays,
  formatNet,
  formatRate,
  growth,
  isBirthdayMd,
  isCloudConfigured,
  isHttpsUrl,
  isLast4,
  isServiceRoleKey,
  normalizeFollowers,
  normalizeStory,
  weekStart,
} from "../js/metrics.js";

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

assert(weekStart("2026-11-18") === "2026-11-16", "週一為一週開始");
assert(weekStart("2026-11-16") === "2026-11-16", "週一自己就是開始");
assert(addDays("2026-11-16", 6) === "2026-11-22", "加天數");

const up = growth(1280, 1160);
assert(up.net === 120, "淨增");
assert(Math.abs(up.rate - (120 / 1160) * 100) < 0.001, "成長率");
assert(growth(10, 0).rate == null && growth(10, 0).net === 10, "基準 0 不計算成長率");
assert(growth(10, null).net == null, "沒有前一筆");
assert(formatRate(null) === "—", "成長率空值");
assert(formatNet(120) === "+120", "正淨增");
assert(formatNet(null) === "—", "淨增空值");

assert(isHttpsUrl("") && isHttpsUrl("https://www.instagram.com/p/abc"), "https 可接受");
assert(!isHttpsUrl("http://example.com") && !isHttpsUrl("javascript:alert(1)"), "非 https 拒絕");
assert(isBirthdayMd("") && isBirthdayMd("03-18") && !isBirthdayMd("2020-03-18"), "只收月日");
assert(isLast4("") && isLast4("1280") && !isLast4("AB1280") && !isLast4("12345"), "末四碼");

assert(normalizeStory(false, 3).story_count === 0, "未發布則數為 0");
assert(normalizeStory(true, 2).story_count === 2, "已發布保留則數");
assert(normalizeStory(true, 0).error, "已發布不可 0 則");
assert(normalizeFollowers(1280).follower_count === 1280, "粉絲數");
assert(normalizeFollowers(-1).error && normalizeFollowers(1.5).error, "粉絲數必須是非負整數");

assert(!isCloudConfigured("", ""), "空設定是示範模式");
assert(!isCloudConfigured("http://example.supabase.co", "a".repeat(30)), "必須是 https");
assert(isServiceRoleKey("header." + btoa(JSON.stringify({ role: "service_role" })) + ".sig"), "擋下 service_role");
assert(!isCloudConfigured("https://abc.supabase.co", "service_role_secret_value_here"), "設定檔不得使用 service role");

console.log("metrics ok");
