import assert from "node:assert/strict";
import { clientHeaderMap, cleanBirth, mapClientRecords, mapClientTypes, markDuplicates } from "../js/client-import.js";

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
console.log("client import checks passed");
