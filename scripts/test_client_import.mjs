import assert from "node:assert/strict";
import { CLIENT_TEMPLATE_GUIDE, CLIENT_TEMPLATE_HEADERS, CLIENT_TEMPLATE_SAMPLES, CLIENT_TEMPLATE_SHEET, clientHeaderMap, clientTemplateSheets, cleanBirth, isClientSampleRow, mapClientRecords, mapClientTypes, markDuplicates, pickDataSheet } from "../js/client-import.js";

const TYPES = ["🏃人壽險客戶", "📈投資型客戶", "🛵機車險客戶", "🚗汽車險客戶", "✈️旅平險客戶", "💳信用卡客戶", "🏭團險客戶", "📓產險健康險客戶"];

assert.deepEqual(mapClientTypes("人壽險、機車險客戶,💳信用卡客戶，產險", TYPES).types, ["🏃人壽險客戶", "🛵機車險客戶", "💳信用卡客戶", "📓產險健康險客戶"]);
assert.deepEqual(mapClientTypes("外星險", TYPES).unknown, ["外星險"]);
assert.equal(clientHeaderMap(["身分證字號", " 客戶 姓名 "]).display_name, " 客戶 姓名 ");
assert.equal(Object.values(clientHeaderMap(["身分證字號", "ID"])).length, 0);
assert.equal(cleanBirth("1990/3/5"), "1990-03-05");
assert.equal(cleanBirth("80.5.20"), "80/05/20");
assert.equal(cleanBirth(new Date(1988, 10, 3)), "1988-11-03");
const mapped = mapClientRecords([
  { 姓名: "測試甲（虛構）", 電話: 912345678, 身分證字號: "A123456789", 等級: "ｂ", 備註: "A123456789" },
  { 姓名: "", 電話: "" },
  { 姓名: "", 電話: "0911" },
], TYPES);
assert.equal(mapped.blank, 1);
assert.equal(mapped.rows[0].phone, "0912345678");
assert.equal(mapped.rows[0].grade, "B");
assert.ok(!JSON.stringify(mapped).includes("A123456789"));
const marked = markDuplicates(mapped.rows, [{ display_name: "測試甲（虛構）", phone: "0912-345-678" }]);
assert.equal(marked[0].exists, true);
assert.equal(marked[1].exists, false);
function aoaToRecords(aoa) {
  const [headers, ...rows] = aoa;
  return rows.map((row) => Object.fromEntries(headers.map((header, index) => [header, row[index] ?? ""])));
}

const sheets = clientTemplateSheets();
if (!sheets[CLIENT_TEMPLATE_SHEET] || !sheets["填寫說明"]) throw new Error("client template sheets");
if (sheets[CLIENT_TEMPLATE_SHEET][0].join() !== CLIENT_TEMPLATE_HEADERS.join()) throw new Error("client header");
if (sheets[CLIENT_TEMPLATE_SHEET].length !== 1 + CLIENT_TEMPLATE_SAMPLES.length) throw new Error("client sample count");
if (!CLIENT_TEMPLATE_SAMPLES.every((row) => String(row.at(-1)).includes("範例"))) throw new Error("client sample note");
if (!CLIENT_TEMPLATE_GUIDE.flat().some((cell) => String(cell).includes("身分證字號"))) throw new Error("client guide id");
assert.equal(pickDataSheet(["填寫說明", "名單"], CLIENT_TEMPLATE_SHEET), "名單");
assert.equal(pickDataSheet(["填寫說明", "其他"], CLIENT_TEMPLATE_SHEET), "其他");
assert.equal(pickDataSheet(["名單", "填寫說明"], CLIENT_TEMPLATE_SHEET), "名單");

const onlySamples = mapClientRecords(aoaToRecords(sheets[CLIENT_TEMPLATE_SHEET]), TYPES);
assert.equal(onlySamples.rows.length, 0);
assert.equal(onlySamples.samples, CLIENT_TEMPLATE_SAMPLES.length);

const mixedAoa = [CLIENT_TEMPLATE_HEADERS, ...CLIENT_TEMPLATE_SAMPLES, ["測試乙（虛構）", "0911000111", "A", "汽車險", "1992/01/02", "女", "LINE", "", "", "", "正式資料"]];
const mixed = mapClientRecords(aoaToRecords(mixedAoa), TYPES);
assert.equal(mixed.samples, CLIENT_TEMPLATE_SAMPLES.length);
assert.equal(mixed.rows.length, 1);
assert.equal(mixed.rows[0].display_name, "測試乙（虛構）");
assert.deepEqual(mixed.rows[0].client_types, ["🚗汽車險客戶"]);
assert.equal(mixed.rows[0].birth, "1992-01-02");

const guideMapped = mapClientRecords(aoaToRecords(sheets["填寫說明"]), TYPES);
assert.ok(guideMapped.error);


if (!CLIENT_TEMPLATE_SAMPLES[0][0].includes("範例") || CLIENT_TEMPLATE_SAMPLES[1][8] !== "王小明（範例）") {
  throw new Error("template sample referrer");
}
assert.equal(onlySamples.rows.length, 0);
assert.ok(!JSON.stringify(onlySamples.rows).includes("王小明"));
assert.equal(isClientSampleRow({ display_name: "王小明（範例）", notes: "" }), true);
assert.equal(isClientSampleRow({ display_name: "王小明", notes: "範例，請刪除" }), true);
assert.equal(isClientSampleRow({ display_name: "王小明", notes: "正式資料" }), false);

const leftoverReferrer = mapClientRecords(aoaToRecords([
  CLIENT_TEMPLATE_HEADERS,
  ...CLIENT_TEMPLATE_SAMPLES,
  ["測試丙（虛構）", "0911222333", "B", "人壽險", "1990/02/02", "男", "LINE", "轉介紹", "王小明（範例）", "", "正式資料"],
]), TYPES);
assert.equal(leftoverReferrer.samples, CLIENT_TEMPLATE_SAMPLES.length);
assert.equal(leftoverReferrer.rows.length, 1);
assert.equal(leftoverReferrer.rows[0].display_name, "測試丙（虛構）");
assert.equal(leftoverReferrer.rows[0].referrer, "");

const realWang = mapClientRecords([{ 姓名: "王小明", 手機: "0912000000", 備註: "正式客戶", 介紹人: "陳同事" }], TYPES);
assert.equal(realWang.rows.length, 1);
assert.equal(realWang.rows[0].display_name, "王小明");
assert.equal(realWang.rows[0].referrer, "陳同事");

console.log("client import checks passed");
