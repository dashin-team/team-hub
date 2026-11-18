import {
  dateGap,
  dayPhrase,
  excelSerialToIso,
  mapImportRecords,
  minDays,
  parseImportDate,
  renewalStatus,
  withinWindow,
} from "../js/car-renewals.js";

const today = "2026-11-18";
const row = { ct_date: "2026-11-23", vo_date: "2026-11-28" };
if (minDays(row, today) !== 5) throw new Error("minD");
if (!withinWindow(row, today, 7) || withinWindow({ ct_date: "2026-11-10", vo_date: "2026-12-01" }, today, 7)) {
  throw new Error("window");
}
if (renewalStatus(-2).label !== "⚫已過期") throw new Error("expired");
if (renewalStatus(7).label !== "🚨緊急") throw new Error("urgent");
if (renewalStatus(30).label !== "🔴優先處理") throw new Error("priority");
if (renewalStatus(60).label !== "🟠提前聯絡") throw new Error("contact");
if (renewalStatus(90).label !== "🟡預備") throw new Error("prep");
if (renewalStatus(91).label !== "⚪尚未提醒") throw new Error("later");
if (dayPhrase(-3) !== "已過期 3 天" || dayPhrase(5) !== "剩 5 天") throw new Error("phrase");
if (dateGap("2026-11-18", "2026-11-25") !== 7) throw new Error("gap");
if (parseImportDate("115/03/01") !== "2026-03-01") throw new Error("roc");
if (parseImportDate("2026/03/01") !== "2026-03-01") throw new Error("slash");
if (parseImportDate("2026-03-01") !== "2026-03-01") throw new Error("dash");
if (parseImportDate(46082) !== excelSerialToIso(46082) || !excelSerialToIso(46082).startsWith("2026-")) {
  throw new Error(`serial ${excelSerialToIso(46082)}`);
}
const mapped = mapImportRecords([
  { "客 戶 姓 名": "王小明", "車 牌": "ABC-1", 車種: "轎車", 強制險到期日: "115/06/01", 任意險: "2026-12-01" },
  { "客 戶 姓 名": "", "車 牌": "ABC-2", 車種: "", 強制險到期日: "", 任意險: "" },
]);
if (mapped.rows.length !== 1 || mapped.skipped !== 1 || mapped.rows[0].ct_date !== "2026-06-01") {
  throw new Error(JSON.stringify(mapped));
}
const missing = mapImportRecords([{ 備註: "沒有欄位" }]);
if (!missing.error) throw new Error("header");
console.log("car renewal checks passed");
