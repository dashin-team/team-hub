import { addDays, isoDate, weekStart } from "@hub/metrics";

export const EVENT_TYPES = [
  { id: "visit", label: "約訪", color: "#8d6840" },
  { id: "meet", label: "拜訪/面談", color: "#3d6a8a" },
  { id: "deal", label: "送件/成交", color: "#2f6b45" },
  { id: "recruit", label: "增員", color: "#7a4e78" },
  { id: "train", label: "教育訓練", color: "#3d7a78" },
  { id: "other", label: "其他", color: "#8a8176" },
];

export const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];

export function eventType(id) {
  return EVENT_TYPES.find((item) => item.id === id) || null;
}

export function weekdayIndex(iso) {
  const [year, month, day] = String(iso).slice(0, 10).split("-").map(Number);
  return (new Date(year, month - 1, day).getDay() + 6) % 7;
}

export function shiftMonth(iso, delta) {
  const [year, month] = String(iso).slice(0, 10).split("-").map(Number);
  return isoDate(new Date(year, month - 1 + delta, 1));
}

export function shiftWeek(iso, delta) {
  return addDays(weekStart(iso), delta * 7);
}

export function monthGrid(iso) {
  const [year, month] = String(iso).slice(0, 10).split("-").map(Number);
  const first = new Date(year, month - 1, 1);
  const start = new Date(year, month - 1, 1 - ((first.getDay() + 6) % 7));
  const weeks = [];
  for (let week = 0; week < 6; week += 1) {
    const days = [];
    for (let offset = 0; offset < 7; offset += 1) {
      const date = new Date(start);
      date.setDate(start.getDate() + week * 7 + offset);
      days.push({
        date: isoDate(date),
        inMonth: date.getMonth() === month - 1,
      });
    }
    weeks.push(days);
  }
  return { year, month, label: `${year}年${month}月`, weeks };
}

export function normalizeEvent(input) {
  const title = String(input.title ?? "").trim();
  if (!title || title.length > 200) return { error: "請填活動標題（200 字以內）。" };
  const eventDate = String(input.event_date || input.date || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) return { error: "請選日期。" };
  const rawTime = String(input.event_time ?? input.time ?? "").trim();
  let eventTime = null;
  if (rawTime) {
    const match = /^(\d{2}):(\d{2})/.exec(rawTime);
    if (!match || Number(match[1]) > 23 || Number(match[2]) > 59) return { error: "時間請用 24 小時制。" };
    eventTime = `${match[1]}:${match[2]}`;
  }
  const eventTypeId = input.event_type || input.type;
  if (!eventType(eventTypeId)) return { error: "請選活動類型。" };
  const note = String(input.note ?? "").trim();
  if (note.length > 4000) return { error: "備註太長。" };
  const customerId = String(input.customer_id ?? "").trim();
  return {
    fields: {
      title,
      event_date: eventDate,
      event_time: eventTime,
      event_type: eventTypeId,
      customer_id: customerId || null,
      note,
      is_done: Boolean(input.is_done),
    },
  };
}

function tally(items) {
  const byType = Object.fromEntries(EVENT_TYPES.map((item) => [item.id, { planned: 0, done: 0 }]));
  let tasks = { planned: 0, done: 0 };
  let reminders = 0;
  for (const item of items) {
    if (item.source === "reminder") {
      if (!item.is_done) reminders += 1;
      continue;
    }
    if (item.source === "task") {
      tasks.planned += 1;
      if (item.is_done) tasks.done += 1;
      continue;
    }
    const slot = byType[item.type];
    if (!slot) continue;
    slot.planned += 1;
    if (item.is_done) slot.done += 1;
  }
  const planned = EVENT_TYPES.reduce((sum, item) => sum + byType[item.id].planned, 0);
  const done = EVENT_TYPES.reduce((sum, item) => sum + byType[item.id].done, 0);
  return {
    byType,
    tasks,
    reminders,
    planned,
    done,
    open: planned - done,
    rate: planned ? Math.round((done / planned) * 100) : 0,
  };
}

export function stocktake(items, today) {
  const start = weekStart(today);
  const end = addDays(start, 6);
  const month = String(today).slice(0, 7);
  return {
    weekStart: start,
    weekEnd: end,
    week: tally(items.filter((item) => item.date >= start && item.date <= end)),
    month: tally(items.filter((item) => String(item.date).startsWith(month))),
  };
}
