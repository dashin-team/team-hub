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
import {
  containsIdentityNumber,
  linesFromTextItems,
  mergeByPlate,
  normalizePlate,
  parseFubonText,
  parseSpreadsheetRecords,
  rocToIso,
} from "../js/car-intake.js";

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
if (minDays({ ct_date: "2026-11-23", vo_date: null }, today) !== 5) throw new Error("one date");
if (normalizePlate("pdu–7312") !== "PDU-7312") throw new Error("en dash");
if (normalizePlate("186—HVZ") !== "186-HVZ") throw new Error("em dash");
if (normalizePlate("7689U9") !== "7689-U9") throw new Error("plate compact");
if (rocToIso("116/01/01") !== "2027-01-01") throw new Error("roc end");
const table = [
  "交易日 被保人身份證號 被保人姓名 險種別 車牌 保費 保期",
  "115/01/02 A100000001 王小明 A100000002 李小華 機車強制險 PDU-7312 3500 115/01/01~116/01/01",
  "115/01/02 A100000001 王小明 機車任意險 PDU–7312 4200 115/03/01~116/03/01",
  "115/02/01 A12****678 陳大明 汽車強制險 186-HVZ 8000 114/12/01~115/12/01",
  "115/02/03 林阿姨 汽車任意險 7689-U9 2100 115/06/01~116/06/01",
].join("\n");
const parsed = parseFubonText(table);
if (containsIdentityNumber(JSON.stringify(parsed))) throw new Error("id leaked");
if (parsed.some((row) => !row.plate)) throw new Error("title became a row");
const pdu = parsed.find((row) => row.plate === "PDU-7312");
if (!pdu || pdu.name !== "王小明" || pdu.car_type !== "機車" || pdu.ct_date !== "2027-01-01" || pdu.vo_date !== "2027-03-01") {
  throw new Error(JSON.stringify(pdu));
}
const hvz = parsed.find((row) => row.plate === "186-HVZ");
if (!hvz || hvz.ct_date !== "2026-12-01" || hvz.vo_date) throw new Error(JSON.stringify(hvz));
const u9 = parsed.find((row) => row.plate === "7689-U9");
if (!u9 || u9.name !== "林阿姨" || u9.vo_date !== "2027-06-01" || u9.ct_date) throw new Error(JSON.stringify(u9));
const sheet = parseSpreadsheetRecords([
  { 被保人姓名: "王小明", 險種別: "汽車強制險", 車牌: "PDU-7312", 保期: "115/01/01~116/01/01", 保費: 3500, 被保人身份證號: "A100000001" },
  { 被保人姓名: "王小明", 險種別: "汽車任意險", 車牌: "PDU-7312", 保期: "115/03/01~116/03/01", 保費: 1 },
]);
if (sheet.rows.length !== 1 || sheet.rows[0].ct_date !== "2027-01-01" || sheet.rows[0].vo_date !== "2027-03-01" || sheet.rows[0].car_type !== "汽車") {
  throw new Error(JSON.stringify(sheet));
}
if (containsIdentityNumber(JSON.stringify(sheet.rows))) throw new Error("sheet id");
const lines = linesFromTextItems([
  { str: "115/01/02", x: 10, y: 100 },
  { str: "王小明", x: 80, y: 100 },
  { str: "機車強制險", x: 140, y: 101 },
  { str: "186-HVZ", x: 220, y: 100 },
  { str: "115/01/01~116/01/01", x: 300, y: 99 },
  { str: "下一列", x: 10, y: 70 },
]);
if (lines.length !== 2 || !lines[0].includes("王小明") || !lines[0].includes("186-HVZ")) throw new Error(lines.join("|"));
if (mergeByPlate([{ plate: "ABC1234", name: "甲", ct_date: "2026-01-01", vo_date: "" }, { plate: "ABC-1234", name: "", ct_date: "", vo_date: "2026-02-01" }])[0].vo_date !== "2026-02-01") {
  throw new Error("merge");
}
console.log("car renewal checks passed");
