// 115年11月團隊固定行程。10/28–11/30。空白代表沒有。
// 之後若改由 Supabase 維護，仍用這個陣列的欄位。

export const TEAM_SCHEDULE = [
  { date: "2026-10-28", morning: "體系時間", speaker: "各區主管", report: "君諺" },
  { date: "2026-10-29", morning: "績效組時間", speaker: "績效組", report: "君諺", training: "車險架構", trainer: "福源" },
  { date: "2026-10-30", morning: "你的事業合夥人，在哪裡？", speaker: "建州 主任", report: "君諺", training: "理財金三角/理財金字塔", trainer: "富芳", important: "11511新銳開訓" },
  { date: "2026-11-02", morning: "體系時間", speaker: "各區主管", report: "宜瑾", important: "行銷大講堂", district: "壽險商品班" },
  { date: "2026-11-03", morning: "各區盤點", speaker: "各區主管", report: "宜瑾", district: "壽險商品班" },
  { date: "2026-11-04", morning: "從陌生人，到自己人", speaker: "柯文祥 業務經理", report: "宜瑾", important: "三新特訓班", district: "壽險商品班" },
  { date: "2026-11-05", morning: "溫馨時刻(卡片)", speaker: "依宣老師", report: "宜瑾", training: "退休規劃", trainer: "秀蓮", important: "全省業輔會議/10工結構", district: "壽險商品班" },
  { date: "2026-11-06", morning: "晉升分享", speaker: "秀蓮 業務經理", report: "宜瑾", training: "客戶經營與延伸(5問)", trainer: "逸萍", important: "全省業輔會議" },
  { date: "2026-11-09", morning: "體系時間", speaker: "各區主管", report: "健弘", district: "外幣考衝班" },
  { date: "2026-11-10", morning: "產險宣導", speaker: "莉娟", report: "健弘", important: "處主管研習營", district: "壽險考衝班/外幣考照班" },
  { date: "2026-11-11", morning: "團險宣導", speaker: "靜雯", report: "健弘", important: "處主管研習營" },
  { date: "2026-11-12", morning: "商品種子會議", speaker: "訓練組", report: "健弘", training: "跨售攻略(信用卡)", trainer: "蔡楷", important: "區部體慎班", district: "壽險考照班" },
  { date: "2026-11-13", morning: "富邦的三流之路", speaker: "林孝恩 業務經理", report: "健弘", training: "現實人生", trainer: "銘旭", district: "壽險考照班" },
  { date: "2026-11-16", morning: "體系時間", speaker: "各區主管", report: "秀涵", important: "三新特訓班", district: "新人基礎班" },
  { date: "2026-11-17", morning: "摩根投顧", speaker: "葉文凱 副總經理", report: "秀涵", district: "新人基礎班" },
  { date: "2026-11-18", morning: "富邦新視界/體系", speaker: "各區主管", report: "秀涵" },
  { date: "2026-11-19", morning: "業輔宣導", speaker: "琪雯", report: "秀涵", important: "商品組會議" },
  { date: "2026-11-20", morning: "商品早會(紅鑽)", speaker: "台南區部", report: "秀涵", important: "行銷說明會" },
  { date: "2026-11-23", morning: "體系時間", speaker: "各區主管", report: "妍言" },
  { date: "2026-11-24", morning: "客戶經營", speaker: "尤美香 處經理", report: "妍言", important: "11工處主管會議" },
  { date: "2026-11-25", morning: "體系時間", speaker: "各區主管", report: "妍言" },
  { date: "2026-11-26", morning: "待公布" },
  { date: "2026-11-27", morning: "待公布" },
  { date: "2026-11-30", morning: "待公布" },
];

const RANGE_START = "2026-10-28";
const RANGE_END = "2026-11-30";

function isWeekend(iso) {
  const day = new Date(`${iso}T12:00:00`).getDay();
  return day === 0 || day === 6;
}

export function teamDay(iso) {
  if (iso < RANGE_START || iso > RANGE_END) return null;
  if (isWeekend(iso)) return { date: iso, weekend: true, chips: [{ kind: "holiday", text: "假日經營" }] };
  const row = TEAM_SCHEDULE.find((item) => item.date === iso);
  const morning = row?.morning || "待公布";
  const speaker = row?.speaker || "";
  const title = speaker ? `早會｜${morning}・${speaker}` : `早會｜${morning}`;
  const chips = [];
  if (row?.report) chips.push({ kind: "report", text: `值星&績效報報 ${row.report}` });
  if (row?.training || row?.trainer) {
    chips.push({ kind: "course", text: `新人訓課程 ${[row.training, row.trainer].filter(Boolean).join(" · ")}` });
  }
  if (row?.important) chips.push({ kind: "important", text: `重要事宜 ${row.important}` });
  if (row?.district) chips.push({ kind: "district", text: `區部課程 ${row.district}` });
  return { date: iso, weekend: false, title, start: "08:30", end: "10:00", chips };
}
