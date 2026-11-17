import { addDays, isoDate, weekStart } from "@hub/metrics";

export const EVENT_TYPES = [
  { id: "visit", label: "約訪", color: "#8d6840" },
  { id: "meet", label: "拜訪/面談", color: "#3d6a8a" },
  { id: "deal", label: "送件/成交", color: "#2f6b45" },
  { id: "recruit", label: "增員", color: "#7a4e78" },
  { id: "train", label: "教育訓練", color: "#3d7a78" },
  { id: "other", label: "其他", color: "#8a8176" },
];

export const REMINDERS = [
  { id: "none", label: "無" },
  { id: "ontime", label: "準時" },
  { id: "15m", label: "15分鐘前" },
  { id: "30m", label: "30分鐘前" },
  { id: "1h", label: "1小時前" },
  { id: "1d", label: "1天前" },
];

export const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
export const HOUR_PX = 48;

export function eventType(id) {
  return EVENT_TYPES.find((item) => item.id === id) || null;
}

export function reminderLabel(id) {
  return REMINDERS.find((item) => item.id === id)?.label || "無";
}

export function pad(value) {
  return String(value).padStart(2, "0");
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
      days.push({ date: isoDate(date), inMonth: date.getMonth() === month - 1 });
    }
    weeks.push(days);
  }
  return { year, month, label: `${year}年${month}月`, weeks };
}

export function toLocalInput(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseInstant(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const text = String(value).trim();
  if (!text) return null;
  const local = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(text);
  if (local && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(text)) {
    return new Date(Number(local[1]), Number(local[2]) - 1, Number(local[3]), Number(local[4]), Number(local[5]), 0, 0);
  }
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function nextHalfHour(from = new Date(), dayIso = "") {
  const date = new Date(from);
  date.setSeconds(0, 0);
  const minutes = date.getMinutes();
  if (minutes === 0 || minutes === 30) {
    // already on a half hour
  } else if (minutes < 30) date.setMinutes(30);
  else {
    date.setHours(date.getHours() + 1);
    date.setMinutes(0);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(dayIso)) {
    const [year, month, day] = dayIso.split("-").map(Number);
    date.setFullYear(year, month - 1, day);
  }
  return date;
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000);
}

export function normalizeEvent(input) {
  const title = String(input.title ?? "").trim();
  if (!title || title.length > 200) return { error: "請填活動標題（200 字以內）。" };
  const eventTypeId = input.event_type || input.type;
  if (!eventType(eventTypeId)) return { error: "請選活動類型。" };
  const allDay = Boolean(input.all_day);
  const start = parseInstant(input.starts_at);
  const end = parseInstant(input.ends_at);
  if (!start || !end) return { error: "請填開始與結束時間。" };
  if (end.getTime() <= start.getTime()) return { error: "結束時間要晚於開始時間。" };
  const reminder = String(input.reminder || "none");
  if (!REMINDERS.some((item) => item.id === reminder)) return { error: "請選提醒。" };
  const note = String(input.note ?? "").trim();
  if (note.length > 4000) return { error: "備註太長。" };
  const customerId = String(input.customer_id ?? "").trim() || null;
  const companionId = String(input.companion_id ?? "").trim() || null;
  if (companionId && customerId && companionId === customerId) {
    // companion is a teammate, not the client; ids come from different tables
  }
  return {
    fields: {
      title,
      event_type: eventTypeId,
      customer_id: customerId,
      companion_id: companionId,
      all_day: allDay,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      event_date: isoDate(start),
      event_time: allDay ? null : `${pad(start.getHours())}:${pad(start.getMinutes())}`,
      reminder,
      note,
      is_done: Boolean(input.is_done),
    },
  };
}

export function formatHours(hours) {
  if (!hours || hours < 0.01) return "0時";
  if (hours >= 23.5 && hours < 24.5) return "24時";
  const whole = Math.floor(hours + 1e-6);
  const minutes = Math.round((hours - whole) * 60);
  if (minutes >= 60) return `${whole + 1}時`;
  if (!whole) return `${minutes}分`;
  if (!minutes) return `${whole}時`;
  return `${whole}時${minutes}分`;
}

export function durationHours(start, end) {
  const from = parseInstant(start);
  const to = parseInstant(end);
  if (!from || !to) return 0;
  const hours = (to.getTime() - from.getTime()) / 3600000;
  return hours > 0 ? hours : 0;
}

function tally(items) {
  const byType = Object.fromEntries(EVENT_TYPES.map((item) => [item.id, { planned: 0, done: 0, hours: 0 }]));
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
    slot.hours += durationHours(item.starts, item.ends);
  }
  const planned = EVENT_TYPES.reduce((sum, item) => sum + byType[item.id].planned, 0);
  const done = EVENT_TYPES.reduce((sum, item) => sum + byType[item.id].done, 0);
  const hours = EVENT_TYPES.reduce((sum, item) => sum + byType[item.id].hours, 0);
  return {
    byType,
    tasks,
    reminders,
    planned,
    done,
    hours,
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

export function overlapsDay(item, dayIso) {
  if (item.source !== "event" || !item.starts || !item.ends) return item.date === dayIso;
  const dayStart = new Date(`${dayIso}T00:00:00`).getTime();
  const dayEnd = dayStart + 24 * 3600000;
  const start = new Date(item.starts).getTime();
  const end = new Date(item.ends).getTime();
  return start < dayEnd && end > dayStart;
}

export function layoutDay(items, dayIso) {
  const allDay = [];
  const timed = [];
  const dayStart = new Date(`${dayIso}T00:00:00`).getTime();
  for (const item of items) {
    if (!overlapsDay(item, dayIso)) continue;
    if (item.allDay || item.source !== "event" || !item.starts || !item.ends) {
      allDay.push(item);
      continue;
    }
    const startMin = Math.max(0, (new Date(item.starts).getTime() - dayStart) / 60000);
    const endMin = Math.min(24 * 60, (new Date(item.ends).getTime() - dayStart) / 60000);
    if (endMin - startMin < 5) continue;
    timed.push({ ...item, startMin, endMin });
  }
  timed.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
  const columnEnds = [];
  for (const item of timed) {
    let column = columnEnds.findIndex((end) => end <= item.startMin + 0.1);
    if (column < 0) {
      column = columnEnds.length;
      columnEnds.push(item.endMin);
    } else columnEnds[column] = item.endMin;
    item.column = column;
  }
  const columns = Math.max(1, columnEnds.length);
  return { allDay, timed, columns };
}
