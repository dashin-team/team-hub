import {
  EVENT_TYPES,
  WEEKDAYS,
  eventType,
  monthGrid,
  shiftMonth,
  shiftWeek,
  stocktake,
  weekdayIndex,
} from "@hub/calendar";
import { CURRENT_CONTEST } from "@hub/contest";
import {
  ANALYSIS_SECTIONS,
  filledCount,
  gridCells,
  parseRoc,
  relationLabel,
  renderAnalysisPng,
  rocLabel,
} from "@hub/profile";
import { GUIDE_LINKS } from "@hub/guides";
import { openStore, forceDemoMode } from "@hub/store";
import {
  COVERAGE_AREAS,
  KIND_LABEL,
  POLICY_CATEGORIES,
  POLICY_STATUS,
  ROLE_LABEL,
  SERVICE_TYPES,
  addDays,
  canManageTeam,
  esc,
  formatDate,
  isHttpsUrl,
  isLast4,
  isoDate,
} from "@hub/metrics";

const PAGE_ALIAS = { assets: "learn", members: "announcements" };
const PAGE_NAMES = {
  home: "總覽",
  clients: "名單",
  tasks: "行事曆",
  social: "競賽",
  learn: "訓練",
  ai: "工具",
  announcements: "管理",
};

const $ = (id) => document.getElementById(id);
let store;
let page = "home";
let assetCat = "全部";
let selectedCustomerId = null;
let coverageView = "gaps";
let calView = "month";
let calCursor = "";
let calFocus = "";
let calOwner = "";
let calItems = [];
let toastTimer = 0;

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

function show(id) {
  if (id !== "boot") document.body.dataset.booted = "1";
  for (const view of ["boot", "blockedView", "loginView", "recoveryView", "app"]) {
    $(view).hidden = view !== id;
  }
}

function me() {
  return store.profile;
}

function nameOf(id, profiles) {
  return profiles.find((item) => item.id === id)?.display_name || "—";
}

function go(next) {
  next = PAGE_ALIAS[next] || next;
  if (!PAGE_NAMES[next]) next = "home";
  if (next === "announcements" && !canManageTeam(me()?.role)) next = "home";
  page = next;
  const url = new URL(location.href);
  url.searchParams.set("page", page);
  history.pushState({}, "", url);
  closeMenu();
  renderPage();
  window.scrollTo(0, 0);
}

function closeMenu() {
  $("drawer").classList.remove("open");
  $("backdrop").classList.remove("show");
  $("menuBtn").setAttribute("aria-expanded", "false");
}

function openMenu() {
  $("drawer").classList.add("open");
  $("backdrop").classList.add("show");
  $("menuBtn").setAttribute("aria-expanded", "true");
}

function applyRoleChrome() {
  const profile = me();
  document.body.dataset.mode = store.mode;
  document.body.dataset.role = profile?.role || "member";
  document.body.dataset.page = page;
  $("modeBadge").textContent = store.mode === "demo" ? "示範資料" : "雲端資料";
  $("modeBadge").classList.toggle("cloud", store.mode === "cloud");
  const letter = (profile?.display_name || "南").slice(0, 1);
  $("whoName").textContent = profile ? `${profile.display_name}・${ROLE_LABEL[profile.role]}` : "";
  $("avatarLetter").textContent = letter;
  $("adviceAvatar") && ($("adviceAvatar").textContent = letter);
  $("sideFoot").textContent = "請勿輸入真實客戶個資";
  if (store.mode === "demo") $("previewRole").value = store.previewRole;
  $("crumb").textContent = PAGE_NAMES[page] || "總覽";
  document.querySelectorAll("[data-nav]").forEach((button) => {
    const active = button.dataset.nav === page;
    button.classList.toggle("active", active);
    if (active) button.setAttribute("aria-current", "page");
    else button.removeAttribute("aria-current");
  });
  document.querySelectorAll(".page").forEach((section) => {
    section.classList.toggle("active", section.id === `page-${page}`);
  });
}

function readForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function renderPage() {
  page = PAGE_ALIAS[page] || page;
  if (!PAGE_NAMES[page]) page = "home";
  if (page === "announcements" && !canManageTeam(me()?.role)) page = "home";
  applyRoleChrome();
  if (page === "home") await renderHome();
  if (page === "ai") await renderTools();
  if (page === "learn") {
    await renderLearn();
    await renderAssets();
  }
  if (page === "tasks") await renderCalendar();
  if (page === "clients") await renderClients();
  if (page === "social") renderContest();
  if (page === "announcements") {
    await renderAnnouncements();
    await renderMembers();
  }
  await refreshDot();
}

function greeting(date) {
  const hour = date.getHours();
  if (hour < 11) return "早安";
  if (hour < 17) return "午安";
  return "晚安";
}

function weekdayLabel(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  const week = ["日", "一", "二", "三", "四", "五", "六"][date.getDay()];
  return `週${week} · ${m}月${d}日`;
}

function areaCovered(policies, area) {
  return policies.some((policy) => {
    if (policy.status && policy.status !== "active") return false;
    const text = `${policy.policy_category || ""} ${policy.notes || ""}`;
    return area.keys.some((key) => text.includes(key));
  });
}

function coverageOf(policies) {
  return COVERAGE_AREAS.map((area) => ({ ...area, covered: areaCovered(policies, area) }));
}

function upcomingItems(tasks, reminders, events, profile, today, days) {
  const end = addDays(today, days);
  const rows = [];
  reminders
    .filter((item) => item.status === "open" && (profile.role === "admin" || item.owner_id === profile.id))
    .forEach((item) => rows.push({ date: String(item.due_at).slice(0, 10), title: item.title, kind: KIND_LABEL[item.kind] || "提醒" }));
  tasks
    .filter((item) => !item.is_done && item.due_date && (profile.role === "admin" || item.owner_id === profile.id))
    .forEach((item) => rows.push({ date: item.due_date, title: item.title, kind: "待辦" }));
  events
    .filter((item) => !item.is_done && (profile.role === "admin" || item.owner_id === profile.id))
    .forEach((item) => rows.push({ date: item.event_date, title: item.title, kind: eventType(item.event_type)?.label || "活動" }));
  return rows.filter((item) => item.date >= today && item.date <= end).sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "zh-Hant"));
}

function renderContest() {
  const href = CURRENT_CONTEST.href;
  const title = CURRENT_CONTEST.title;
  if (!isHttpsUrl(href)) return;
  const link = $("contestLink");
  link.href = href;
  $("contestTitle").textContent = title;
  const frame = $("contestFrame");
  frame.title = title;
  if (frame.src !== href) frame.src = href;
}

async function renderHome() {
  const profile = me();
  const [tasks, reminders, events, announcements, customers, records] = await Promise.all([
    store.listTasks(),
    store.listReminders(),
    store.listCalendarEvents(),
    store.listAnnouncements(),
    store.listCustomers(),
    store.listServiceRecords(),
  ]);
  const today = isoDate();
  const since = addDays(today, -7);
  const agenda = upcomingItems(tasks, reminders, events, profile, today, 14);
  const nearest = agenda[0];
  const advice = nearest
    ? `近期有一件事：${nearest.title}，${formatDate(nearest.date)} 前處理即可。`
    : "這幾天沒有到期的提醒。按自己的拜訪節奏進行即可。";
  $("greetDate").textContent = weekdayLabel(today);
  $("greetLine").textContent = `${greeting(new Date())}，${profile.display_name}。`;
  $("dailyAdvice").textContent = advice;
  const newNames = customers.filter((item) => !item.is_archived && String(item.created_at).slice(0, 10) >= since).length;
  const activity = records.filter((item) => String(item.service_date).slice(0, 10) >= since).length;
  const visits = records.filter((item) => String(item.service_date).slice(0, 10) === today).length;
  const metrics = [
    [newNames, "近7日新增名單", "clients"],
    [activity, "近7日活動量", "tasks"],
    [visits, "今日拜訪量", "tasks"],
    [agenda.filter((item) => item.date <= addDays(today, 7)).length, "近7日行程", "tasks"],
  ];
  $("homeStats").innerHTML = metrics.map(([value, label, dest]) =>
    `<button class="metric" type="button" data-nav="${dest}"><b>${esc(value)}</b><span>${esc(label)} →</span></button>`).join("");
  $("homeSchedule").innerHTML = agenda.slice(0, 2).map((item) =>
    `<div class="schedule-item"><span>${esc(item.title)}</span><small class="muted">${esc(item.kind)} ${formatDate(item.date)}</small></div>`).join("")
    || `<div class="schedule-empty">（此區間沒有行程）</div>`;
  const visibleNews = announcements.filter((item) => item.published_at).slice(0, 3);
  $("homeNotices").innerHTML = visibleNews.map((item) =>
    `<div class="notice"><b>${esc(item.title)}</b><small>${esc(item.body)}</small></div>`).join("")
    || `<div class="empty">目前沒有公告。</div>`;
  $("secretaryBody").innerHTML = `<p>${esc(advice)}</p><div class="row"><button class="btn secondary small" type="button" data-nav="tasks">看行事曆</button><button class="btn secondary small" type="button" data-nav="social">看本季競賽</button><button class="btn secondary small" type="button" data-nav="ai">看投保指南</button></div>`;
}

async function refreshDot() {
  const reminders = await store.listReminders();
  const today = isoDate();
  const soon = reminders.some((item) => item.status === "open" && item.owner_id === me()?.id && String(item.due_at).slice(0, 10) <= addDays(today, 7));
  $("avatarDot").hidden = !soon;
}

function renderTools() {
  $("toolList").innerHTML = GUIDE_LINKS.map((item) => {
    if (!isHttpsUrl(item.href)) return "";
    const subtitle = item.subtitle ? `<small>${esc(item.subtitle)}</small>` : "";
    return `<a class="guide-card" href="${esc(item.href)}" target="_blank" rel="noopener"><span class="guide-icon" aria-hidden="true">${item.icon}</span><b>${esc(item.title)}</b>${subtitle}</a>`;
  }).join("");
}

async function renderAssets() {
  const assets = await store.listAssets();
  const cats = ["全部", ...new Set(assets.map((item) => item.category).filter(Boolean))];
  $("assetCats").innerHTML = cats.map((cat) =>
    `<button class="tag-outline ${cat === assetCat ? "active" : ""}" type="button" data-cat="${esc(cat)}">${esc(cat)}</button>`).join("");
  const q = $("assetSearch").value.trim().toLowerCase();
  const list = assets.filter((item) =>
    (assetCat === "全部" || item.category === assetCat)
    && `${item.title} ${item.category} ${item.description || ""}`.toLowerCase().includes(q));
  $("assetList").innerHTML = list.map((item) => {
    const link = item.external_url && isHttpsUrl(item.external_url)
      ? `<a class="btn secondary" href="${esc(item.external_url)}" target="_blank" rel="noopener">開啟連結</a>`
      : `<button class="btn secondary" type="button" data-action="asset-demo">查看說明</button>`;
    return `<article class="asset card"><div class="thumb">${esc(item.symbol || "▤")}</div><b>${esc(item.title)}</b><small class="muted">${esc(item.category)} · ${esc(item.description || "團隊素材")}</small><div style="margin-top:10px">${link}</div></article>`;
  }).join("") || `<div class="empty">沒有符合的素材。</div>`;
}

async function renderLearn() {
  const profile = me();
  const [courses, progress, profiles] = await Promise.all([
    store.listCourses(),
    store.listProgress(),
    store.listProfiles(),
  ]);
  const mine = new Set(progress.filter((item) => item.member_id === profile.id && item.completed_at).map((item) => item.course_id));
  const published = courses.filter((item) => item.is_published);
  const pct = published.length ? Math.round((mine.size / published.length) * 100) : 0;
  $("learnSummary").innerHTML = `<h3>我的學習進度</h3><div class="row spread"><span>${mine.size} / ${published.length} 個單元</span><b>${pct}%</b></div><div class="progress"><i style="width:${pct}%"></i></div>`;
  $("courseList").innerHTML = courses.map((item) => {
    const done = mine.has(item.id);
    const link = item.content_url && isHttpsUrl(item.content_url)
      ? `<a href="${esc(item.content_url)}" target="_blank" rel="noopener">開啟教材</a>`
      : "";
    return `<div class="panel" style="margin-bottom:10px"><div class="client-top"><div><b>${esc(item.title)}</b><div class="muted">${esc(item.description || "")} ${link}</div></div>${item.is_published ? `<button class="btn ${done ? "green" : "secondary"}" type="button" data-action="toggle-course" data-id="${esc(item.id)}" data-done="${done ? "1" : "0"}">${done ? "已完成 ✓" : "標記完成"}</button>` : `<span class="badge">草稿</span>`}</div></div>`;
  }).join("") || `<div class="empty">還沒有教材。</div>`;
  if (!canManageTeam(profile.role)) {
    $("teamLearn").innerHTML = "";
    return;
  }
  const lines = profiles.map((person) => {
    const done = progress.filter((item) => item.member_id === person.id && item.completed_at && published.some((course) => course.id === item.course_id)).length;
    return `<div class="list-item"><span>${esc(person.display_name)}</span><b>${done}/${published.length}</b></div>`;
  }).join("");
  $("teamLearn").innerHTML = `<div class="section-head"><h2>團隊學習</h2><span>已完成的單元</span></div><div class="panel">${lines || `<div class="empty">還沒有成員。</div>`}</div>`;
}

function calendarItems(events, tasks, reminders, ownerId) {
  const rows = [];
  events.filter((item) => item.owner_id === ownerId).forEach((item) => rows.push({
    id: item.id,
    source: "event",
    owner_id: item.owner_id,
    title: item.title,
    date: String(item.event_date).slice(0, 10),
    time: item.event_time ? String(item.event_time).slice(0, 5) : "",
    type: item.event_type,
    customer_id: item.customer_id || "",
    note: item.note || "",
    is_done: Boolean(item.is_done),
  }));
  tasks.filter((item) => item.owner_id === ownerId && item.due_date).forEach((item) => rows.push({
    id: item.id,
    source: "task",
    owner_id: item.owner_id,
    title: item.title,
    date: String(item.due_date).slice(0, 10),
    time: "",
    type: "task",
    customer_id: "",
    note: "",
    is_done: Boolean(item.is_done),
  }));
  reminders.filter((item) => item.owner_id === ownerId && item.status === "open").forEach((item) => rows.push({
    id: item.id,
    source: "reminder",
    owner_id: item.owner_id,
    title: item.title,
    date: String(item.due_at).slice(0, 10),
    time: "",
    type: "reminder",
    customer_id: item.customer_id || "",
    note: "",
    is_done: false,
  }));
  return rows.sort((a, b) => a.date.localeCompare(b.date) || (a.time || "").localeCompare(b.time || "") || a.title.localeCompare(b.title, "zh-Hant"));
}

function itemColor(item) {
  if (item.type === "task") return "#c4a574";
  if (item.type === "reminder") return "#b0a89d";
  return eventType(item.type)?.color || "#8a8176";
}

function itemLabel(item) {
  if (item.type === "task") return "待辦";
  if (item.type === "reminder") return "提醒";
  return eventType(item.type)?.label || "活動";
}

function chipText(item, customers) {
  const who = customers.find((customer) => customer.id === item.customer_id);
  const bits = [item.time, itemLabel(item), item.title, who ? who.display_name : ""].filter(Boolean);
  return bits.join(" ");
}

function dotsHtml(items) {
  const shown = items.slice(0, 4).map((item) =>
    `<i class="dot ${item.is_done ? "done" : ""}" style="background:${itemColor(item)}" title="${esc(itemLabel(item))}"></i>`).join("");
  const more = items.length > 4 ? `<span class="cal-more">+${items.length - 4}</span>` : "";
  return `<span class="cal-dots">${shown}${more}</span>`;
}

function stockBlock(title, tally) {
  const lines = EVENT_TYPES.map((type) => {
    const count = tally.byType[type.id];
    return `<div class="cal-count"><span><i style="background:${type.color}"></i>${esc(type.label)}</span><b>${count.done}/${count.planned}</b></div>`;
  }).join("");
  const extra = [
    tally.tasks.planned ? `<p class="muted">原有待辦 ${tally.tasks.done}/${tally.tasks.planned}，不計入完成率。</p>` : "",
    tally.reminders ? `<p class="muted">未完成的客戶提醒 ${tally.reminders} 件。</p>` : "",
  ].join("");
  return `<h3>${esc(title)}</h3>${lines}<p>計畫 ${tally.planned} · 完成 ${tally.done} · 未完成 ${tally.open} · 完成率 ${tally.rate}%</p>${extra}`;
}

function teamTable(profiles, events, today) {
  const rows = profiles.map((person) => {
    const mine = calendarItems(events, [], [], person.id);
    const tally = stocktake(mine, today);
    const detail = (bucket) => EVENT_TYPES.map((type) => `${type.label} ${bucket.byType[type.id].done}/${bucket.byType[type.id].planned}`).join("、");
    return `<tr><td>${esc(person.display_name)}</td><td><b>${tally.week.done}/${tally.week.planned} · ${tally.week.rate}%</b><small>${esc(detail(tally.week))}</small></td><td><b>${tally.month.done}/${tally.month.planned} · ${tally.month.rate}%</b><small>${esc(detail(tally.month))}</small></td></tr>`;
  }).join("");
  return `<h3>團隊盤點</h3><div class="table-wrap"><table class="cal-team"><thead><tr><th>夥伴</th><th>本週</th><th>本月</th></tr></thead><tbody>${rows || `<tr><td colspan="3">還沒有夥伴。</td></tr>`}</tbody></table></div>`;
}

function paintCalForm(item, date) {
  const form = $("calForm");
  const editingTask = item?.source === "task";
  form.elements.id.value = item?.id || "";
  form.elements.source.value = editingTask ? "task" : "event";
  form.elements.title.value = item?.title || "";
  form.elements.event_date.value = item?.date || date;
  form.elements.event_time.value = item?.time || "";
  form.elements.event_type.value = eventType(item?.type) ? item.type : "visit";
  form.elements.customer_id.value = item?.customer_id || "";
  form.elements.note.value = item?.note || "";
  form.elements.is_done.checked = Boolean(item?.is_done);
  document.querySelectorAll(".cal-event-only").forEach((node) => { node.hidden = editingTask; });
  $("calDelete").hidden = !item || item.source === "reminder";
  $("calForm").hidden = item?.source === "reminder" || !canEditCalendar();
}

function canEditCalendar() {
  return viewedOwnerId() === me()?.id;
}

function viewedOwnerId() {
  const profile = me();
  if (!profile) return "";
  if (!canManageTeam(profile.role)) return profile.id;
  return calOwner || profile.id;
}

function paintDayList(date, customers) {
  const items = calItems.filter((item) => item.date === date);
  const editable = canEditCalendar();
  $("calDayList").innerHTML = items.map((item) => {
    const done = item.is_done ? " done" : "";
    const check = editable && item.source !== "reminder"
      ? `<input type="checkbox" data-action="${item.source === "task" ? "toggle-task" : "toggle-event"}" data-id="${esc(item.id)}" ${item.is_done ? "checked" : ""}>`
      : "";
    const edit = item.source === "reminder" ? "" : `<button class="btn secondary small" type="button" data-action="cal-edit" data-id="${esc(item.id)}" data-source="${esc(item.source)}">編輯</button>`;
    return `<div class="list-item${done}"><label class="task-line">${check}<span>${esc(chipText(item, customers))}</span></label>${edit}</div>`;
  }).join("") || `<p class="muted">這一天還沒有活動。</p>`;
}

function openCalendarDay(date, itemId) {
  calFocus = date;
  const [year, month, day] = date.split("-");
  $("calSheetTitle").textContent = `${Number(month)}月${Number(day)}日 ${WEEKDAYS[weekdayIndex(date)]}`;
  const customers = calCustomers;
  const client = $("calClient");
  const current = client.value;
  client.innerHTML = `<option value="">不連結</option>${customers.map((customer) => `<option value="${esc(customer.id)}">${esc(customer.display_name)}</option>`).join("")}`;
  client.value = current;
  paintDayList(date, customers);
  const item = itemId ? calItems.find((row) => row.id === itemId) : null;
  paintCalForm(item, date);
  $("calNew").hidden = !canEditCalendar();
  $("calSheet").classList.add("show");
  if (!item && canEditCalendar()) $("calForm").elements.title.focus();
}

let calCustomers = [];

async function renderCalendar() {
  const profile = me();
  if (!calCursor) calCursor = isoDate();
  if (!$("calType").dataset.ready) {
    $("calType").innerHTML = EVENT_TYPES.map((type) => `<option value="${type.id}">${esc(type.label)}</option>`).join("");
    $("calType").dataset.ready = "1";
  }
  const today = isoDate();
  const [events, tasks, reminders, profiles, customers] = await Promise.all([
    store.listCalendarEvents(),
    store.listTasks(),
    store.listReminders(),
    store.listProfiles(),
    store.listCustomers(),
  ]);
  calCustomers = customers;
  const ownerId = viewedOwnerId();
  if (!profiles.some((person) => person.id === ownerId)) calOwner = "";
  const activeOwner = viewedOwnerId();
  calItems = calendarItems(events, tasks, reminders, activeOwner);
  const owner = profiles.find((person) => person.id === activeOwner) || profile;
  $("calMember").innerHTML = [`<option value="">我的行事曆</option>`].concat(profiles.filter((person) => person.id !== profile.id).map((person) =>
    `<option value="${esc(person.id)}">${esc(person.display_name)}</option>`)).join("");
  $("calMember").value = calOwner && calOwner !== profile.id ? calOwner : "";
  $("calScope").textContent = canEditCalendar() ? "點一天可以新增或修改。" : `正在看${owner.display_name}的行事曆，不能改對方的活動。`;
  document.querySelectorAll("[data-cal-view]").forEach((button) => button.classList.toggle("on", button.dataset.calView === calView));
  $("calLegend").innerHTML = EVENT_TYPES.map((type) =>
    `<span><i class="dot" style="background:${type.color}"></i>${esc(type.label)}</span>`).join("")
    + `<span><i class="dot" style="background:#c4a574"></i>待辦</span><span><i class="dot" style="background:#b0a89d"></i>提醒</span>`;
  if (calView === "month") {
    const grid = monthGrid(calCursor);
    $("calLabel").textContent = grid.label;
    const head = WEEKDAYS.map((day) => `<div class="cal-dow">${day}</div>`).join("");
    const cells = grid.weeks.flat().map((day) => {
      const mine = calItems.filter((item) => item.date === day.date);
      const classes = ["cal-cell", day.inMonth ? "" : "out", day.date === today ? "today" : ""].filter(Boolean).join(" ");
      return `<button class="${classes}" type="button" data-action="cal-day" data-date="${day.date}"><b>${Number(day.date.slice(8))}</b>${dotsHtml(mine)}</button>`;
    }).join("");
    $("calBoard").innerHTML = `<div class="cal-month">${head}${cells}</div>`;
  } else if (calView === "week") {
    const start = weekStartSafe(calCursor);
    $("calLabel").textContent = `${formatDate(start)} – ${formatDate(addDays(start, 6))}`;
    $("calBoard").innerHTML = `<div class="cal-week">${Array.from({ length: 7 }, (_, index) => {
      const date = addDays(start, index);
      const mine = calItems.filter((item) => item.date === date);
      const chips = mine.map((item) =>
        `<button class="cal-chip ${item.is_done ? "done" : ""}" type="button" style="--c:${itemColor(item)}" data-action="cal-edit" data-id="${esc(item.id)}" data-source="${esc(item.source)}" data-date="${date}">${esc(chipText(item, customers))}</button>`).join("")
        || `<span class="muted">沒有活動</span>`;
      return `<article class="cal-daycard ${date === today ? "today" : ""}"><header><button type="button" data-action="cal-day" data-date="${date}"><b>${Number(date.slice(8))} ${WEEKDAYS[index]}</b></button></header><div class="cal-chips">${chips}</div></article>`;
    }).join("")}</div>`;
  } else {
    const grid = monthGrid(calCursor);
    $("calLabel").textContent = grid.label;
    const mine = calItems.filter((item) => item.date.startsWith(calCursor.slice(0, 7)));
    $("calBoard").innerHTML = `<div class="cal-list">${mine.map((item) =>
      `<button class="cal-row" type="button" data-action="cal-edit" data-id="${esc(item.id)}" data-source="${esc(item.source)}" data-date="${esc(item.date)}"><span>${esc(formatDate(item.date))} ${esc(chipText(item, customers))}</span><i class="dot ${item.is_done ? "done" : ""}" style="background:${itemColor(item)}"></i></button>`).join("") || `<div class="empty">這個月還沒有活動。</div>`}</div>`;
  }
  const tally = stocktake(calItems, today);
  $("calStock").innerHTML = `<div class="cal-stock"><h2>盤點</h2>${stockBlock(`本週 ${formatDate(tally.weekStart)} – ${formatDate(tally.weekEnd)}`, tally.week)}${stockBlock(`${today.slice(0, 4)}年${Number(today.slice(5, 7))}月`, tally.month)}</div>`;
  $("calTeam").innerHTML = canManageTeam(profile.role) ? teamTable(profiles, events, today) : "";
  if ($("calSheet").classList.contains("show") && calFocus) paintDayList(calFocus, customers);
}

function weekStartSafe(iso) {
  const index = weekdayIndex(iso);
  return addDays(iso, -index);
}

function mountAnalysisFields() {
  const root = $("analysisFields");
  if (!root || root.dataset.ready) return;
  root.innerHTML = ANALYSIS_SECTIONS.map((section) => {
    if (section.auto) {
      return `<div class="note-block" id="sec-${section.n}"><div class="note-title">${section.n}. ${esc(section.title)}</div><pre id="profileSummary" class="auto-summary"></pre></div>`;
    }
    const hint = section.hint ? `<span class="note-hint">${esc(section.hint)}</span>` : "";
    const subs = (section.subs || []).map((sub) =>
      `<label class="npss"><span>${esc(sub.label)}</span><input name="${sub.field}" maxlength="80"></label>`).join("");
    return `<div class="note-block" id="sec-${section.n}"><div class="note-title">${section.n}. ${esc(section.title)}</div>${hint}<textarea name="${section.field}" rows="3" maxlength="4000" placeholder="${esc(section.hint || "")}"></textarea>${subs}</div>`;
  }).join("");
  root.dataset.ready = "1";
}

function paintAnalysis() {
  mountAnalysisFields();
  const cells = gridCells(readForm($("customerForm")));
  $("analysisScore").textContent = `完成度 ${filledCount(cells)}/8`;
  const summary = cells.find((cell) => cell.auto);
  if ($("profileSummary")) $("profileSummary").textContent = summary?.text || "";
  const html = `<div class="nine">${cells.map((cell) => {
    const mark = cell.filled ? " filled" : "";
    const body = `<b>${esc(cell.heading)}</b><small>${esc(cell.text)}</small>`;
    if (!cell.editable) return `<div class="nine-cell center${mark}">${body}</div>`;
    return `<button class="nine-cell${mark}" type="button" data-action="edit-cell" data-cell="${esc(cell.key)}">${body}</button>`;
  }).join("")}</div>`;
  $("analysisGrid").innerHTML = html;
  if (!$("gridFull").hidden) $("gridFullBody").innerHTML = html;
  const label = relationLabel($("relationSocial").value, $("relationBusiness").value);
  $("relationText").textContent = label || "請選擇";
}

function fillCustomerForm(customer) {
  const form = $("customerForm");
  mountAnalysisFields();
  form.elements.id.value = customer.id || "";
  form.elements.display_name.value = customer.display_name || "";
  form.elements.nickname.value = customer.nickname || "";
  form.elements.birth_roc.value = rocLabel(customer.birth_date);
  $("birthPicker").value = customer.birth_date ? String(customer.birth_date).slice(0, 10) : "";
  form.elements.birthday_md_keep.value = customer.birth_date ? "" : (customer.birthday_md || "");
  form.querySelectorAll('input[name="gender"]').forEach((radio) => {
    radio.checked = radio.value === customer.gender;
  });
  form.elements.phone.value = customer.phone || "";
  form.elements.referrer.value = customer.referrer || "";
  form.elements.contact_method.value = customer.contact_method || "";
  form.elements.hobbies.value = customer.hobbies || "";
  form.elements.lead_source.value = customer.lead_source || "";
  form.elements.notes.value = customer.notes || "";
  form.elements.relation_social.value = customer.relation_social || "";
  form.elements.relation_business.value = customer.relation_business || "";
  for (const section of ANALYSIS_SECTIONS) {
    if (section.field) form.elements[section.field].value = customer[section.field] || "";
    for (const sub of section.subs || []) form.elements[sub.field].value = customer[sub.field] || "";
  }
  if (customer.owner_id) $("customerOwner").value = customer.owner_id;
  $("customerFormTitle").textContent = customer.id ? "編輯名單" : "新增名單";
  $("customerCancel").hidden = !customer.id;
  paintAnalysis();
}

function scoreOptions(select, current) {
  const options = ['<option value="">請選擇</option>'];
  for (let score = 1; score <= 10; score += 1) {
    options.push(`<option value="${score}" ${String(current) === String(score) ? "selected" : ""}>${score}</option>`);
  }
  select.innerHTML = options.join("");
}

function openRelation() {
  scoreOptions($("relationSocialPick"), $("relationSocial").value);
  scoreOptions($("relationBusinessPick"), $("relationBusiness").value);
  $("relationSheet").classList.add("show");
}

function openCellSheet(key) {
  const section = ANALYSIS_SECTIONS.find((item) => item.key === key);
  if (!section || section.auto) return;
  const form = $("customerForm");
  $("cellSheetTitle").textContent = `${section.n}. ${section.title}`;
  $("cellSheetHint").textContent = section.hint || "";
  $("cellSheetBody").value = form.elements[section.field].value;
  $("cellSheet").dataset.field = section.field;
  $("cellSheetSubs").innerHTML = (section.subs || []).map((sub) =>
    `<label class="npss"><span>${esc(sub.label)}</span><input data-sub="${esc(sub.field)}" maxlength="80"></label>`).join("");
  for (const input of $("cellSheetSubs").querySelectorAll("[data-sub]")) {
    input.value = form.elements[input.dataset.sub].value;
  }
  $("cellSheet").classList.add("show");
  $("cellSheetBody").focus();
}

let pngUrl = "";
async function downloadAnalysis() {
  const draft = readForm($("customerForm"));
  const blob = await renderAnalysisPng(gridCells(draft), draft.display_name || "");
  if (pngUrl) URL.revokeObjectURL(pngUrl);
  pngUrl = URL.createObjectURL(blob);
  $("pngPreview").src = pngUrl;
  $("pngDownload").href = pngUrl;
  $("pngDownload").download = "客戶資料分析表.png";
  $("pngSheet").classList.add("show");
}

async function renderClients() {
  const profile = me();
  const [customers, profiles, reminders] = await Promise.all([
    store.listCustomers(),
    store.listProfiles(),
    store.listReminders(),
  ]);
  const q = $("clientSearch").value.trim().toLowerCase();
  const showArchived = $("showArchived").checked;
    const list = customers.filter((item) => {
    if (!showArchived && item.is_archived) return false;
    const blob = `${item.display_name} ${item.nickname || ""} ${item.ref_code || ""} ${(item.service_tags || []).join(" ")} ${item.notes || ""} ${item.hobbies || ""} ${item.lead_source || ""} ${item.contact_method || ""}`.toLowerCase();
    return blob.includes(q);
  });
  mountAnalysisFields();
  const keepOwner = $("customerForm").elements.id.value ? $("customerOwner").value : profile.id;
  $("customerOwner").innerHTML = profiles.map((item) =>
    `<option value="${esc(item.id)}">${esc(item.display_name)}</option>`).join("");
  $("customerOwner").value = keepOwner || profile.id;
  const clientRows = list.map((item) => {
    const next = reminders.filter((reminder) => reminder.customer_id === item.id && reminder.status === "open").sort((a, b) => String(a.due_at).localeCompare(String(b.due_at)))[0];
    const tags = (item.service_tags || []).map((tag) => `<span class="tag">${esc(tag)}</span>`).join("") || "—";
    const owner = esc(nameOf(item.owner_id, profiles));
    const code = `${esc(item.ref_code || "")}${item.is_archived ? " · 已封存" : ""}`;
    const follow = next ? `<div class="muted">下次${esc(KIND_LABEL[next.kind])} ${formatDate(next.due_at)}</div>` : "";
    return { item, tags, owner, code, follow };
  });
  const emptyClients = `<div class="empty">沒有符合的客戶。</div>`;
  $("clientList").innerHTML = clientRows.length ? clientRows.map(({ item, tags, owner, code, follow }) =>
    `<button class="person" type="button" data-action="open-client" data-id="${esc(item.id)}"><span class="ava">${esc(item.display_name.slice(0, 1))}</span><span><b>${esc(item.display_name)}</b><small class="muted">${code} · ${owner}</small><div>${tags}</div>${follow}</span></button>`).join("") : emptyClients;
  paintAnalysis();
  if (!selectedCustomerId || !customers.some((item) => item.id === selectedCustomerId)) {
    $("clientDetail").innerHTML = "";
    return;
  }
  await renderClientDetail(customers, profiles);
}

async function renderClientDetail(customers, profiles) {
  const customer = customers.find((item) => item.id === selectedCustomerId);
  if (!customer) {
    $("clientDetail").innerHTML = "";
    return;
  }
  const [policies, records, reminders] = await Promise.all([
    store.listPolicies(customer.id),
    store.listServiceRecords(customer.id),
    store.listReminders(customer.id),
  ]);
  const canEdit = canManageTeam(me().role) || customer.owner_id === me().id;
  const areas = coverageOf(policies);
  const coveredCount = areas.filter((area) => area.covered).length;
  const ratio = Math.round((coveredCount / areas.length) * 100);
  const ring = 2 * Math.PI * 32;
  const offset = ring * (1 - coveredCount / areas.length);
  const coverageHtml = `<section class="neo" id="coverageBoard">
    <div class="neo-top">
      <svg class="ring" viewBox="0 0 80 80" aria-hidden="true">
        <circle cx="40" cy="40" r="32" fill="none" stroke="#e7b2a6" stroke-width="8"></circle>
        <circle cx="40" cy="40" r="32" fill="none" stroke="#3d8f5c" stroke-width="8" stroke-linecap="round" stroke-dasharray="${ring.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" transform="rotate(-90 40 40)"></circle>
        <text x="40" y="46" text-anchor="middle" font-size="16" fill="#4e5b67">${ratio}%</text>
      </svg>
      <div>
        <div class="ring-label">保障完整度</div>
        <div class="ring-label"><b>${policies.filter((item) => item.status === "active").length} 張保單</b>涵蓋 ${coveredCount} / ${areas.length} 類</div>
        <div class="pills">
          <button type="button" data-action="coverage-tab" data-tab="policies">紀錄</button>
          <button type="button" data-action="coverage-tab" data-tab="gaps">缺口</button>
          <button type="button" data-nav="ai">指南</button>
        </div>
      </div>
    </div>
    <div class="seg">
      <button type="button" data-action="coverage-tab" data-tab="policies" class="${coverageView === "policies" ? "on" : ""}">保單</button>
      <button type="button" data-action="coverage-tab" data-tab="gaps" class="seg-gap ${coverageView === "gaps" ? "on" : ""}">缺口<span class="seg-dot" aria-hidden="true"></span></button>
    </div>
    ${coverageView === "gaps" ? `<div class="section-head"><h2>保障檢視</h2></div><div class="gap-grid">${areas.map((area) => `<div class="neo-tile ${area.covered ? "ok" : "gap"}"><span class="sym">${area.covered ? "●" : "○"}</span><b>${esc(area.label)}</b><small>${area.covered ? "已涵蓋" : "缺口"}</small></div>`).join("")}</div><p class="muted">依這位客戶的保單摘要歸類，不是完整需求分析。</p>` : ""}
  </section>`;
  $("clientDetail").innerHTML = `${coverageHtml}<div class="panel" style="margin-top:12px" ${coverageView === "gaps" ? "hidden" : ""}>
    <div class="client-top"><div><h3>${esc(customer.display_name)}</h3><p class="sub">${esc([customer.ref_code, customer.nickname, customer.gender, rocLabel(customer.birth_date), customer.contact_method || customer.preferred_contact].filter(Boolean).join(" · "))} · 負責人 ${esc(nameOf(customer.owner_id, profiles))}</p></div>
    <div class="row">${canEdit ? `<button class="btn secondary small" type="button" data-action="edit-client" data-id="${esc(customer.id)}">編輯</button>` : ""}<button class="btn secondary small" type="button" data-action="jump-analysis">五項度</button>${canEdit ? `<button class="btn danger small" type="button" data-action="archive-client" data-id="${esc(customer.id)}" data-archived="${customer.is_archived ? "1" : "0"}">${customer.is_archived ? "取消封存" : "封存"}</button>` : ""}</div></div>
    <p>${esc(customer.notes || "還沒有備註。")}</p>
    ${customer.birthday_md ? `<p class="muted">生日月日 ${esc(customer.birthday_md)}（不含年份）</p>` : ""}
    <h3>保單摘要</h3>
    ${policies.map((item) => `<div class="list-item"><div><b>${esc(item.policy_category)}</b> ${esc(item.insurer_name || "")}<div class="muted">${esc(POLICY_STATUS[item.status] || item.status)} · 到期 ${formatDate(item.expiry_date)} · 續保提醒 ${formatDate(item.renewal_reminder_date)}${item.reference_last4 ? ` · 末四碼 ${esc(item.reference_last4)}` : ""}</div></div><button class="btn secondary small" type="button" data-action="delete-policy" data-id="${esc(item.id)}">刪除</button></div>`).join("") || `<div class="empty">還沒有保單摘要。</div>`}
    ${canEdit ? `<form id="policyForm" data-customer="${esc(customer.id)}" class="form-grid cols-2" style="margin-top:10px">
      <label class="field">種類<select name="policy_category">${POLICY_CATEGORIES.map((item) => `<option>${esc(item)}</option>`).join("")}</select></label>
      <label class="field">保險公司<input name="insurer_name" maxlength="80"></label>
      <label class="field">生效日<input name="effective_date" type="date"></label>
      <label class="field">到期日<input name="expiry_date" type="date"></label>
      <label class="field">續保提醒日<input name="renewal_reminder_date" type="date"></label>
      <label class="field">末四碼（選填）<input name="reference_last4" maxlength="4" inputmode="numeric"></label>
      <label class="field">狀態<select name="status"><option value="active">有效</option><option value="expired">已到期</option><option value="lapsed">已停效</option></select></label>
      <label class="field">備註<input name="notes" maxlength="500"></label>
      <button class="btn" type="submit">新增保單摘要</button>
    </form>` : ""}
    <h3 style="margin-top:18px">服務紀錄</h3>
    ${records.map((item) => `<div class="list-item"><div><b>${formatDate(item.service_date)} · ${esc(item.service_type)}</b><div>${esc(item.summary)}</div><div class="muted">${esc(item.next_action || "")}${item.next_contact_date ? ` · 下次 ${formatDate(item.next_contact_date)}` : ""}</div></div><button class="btn secondary small" type="button" data-action="delete-service" data-id="${esc(item.id)}">刪除</button></div>`).join("") || `<div class="empty">還沒有服務紀錄。</div>`}
    ${canEdit ? `<form id="serviceForm" data-customer="${esc(customer.id)}" style="margin-top:10px">
      <div class="form-grid cols-2">
        <label class="field">日期<input name="service_date" type="date" value="${isoDate()}" required></label>
        <label class="field">類型<select name="service_type">${SERVICE_TYPES.map((item) => `<option>${esc(item)}</option>`).join("")}</select></label>
      </div>
      <label class="field">摘要<textarea name="summary" required maxlength="4000"></textarea></label>
      <div class="form-grid cols-2">
        <label class="field">後續行動<input name="next_action" maxlength="200"></label>
        <label class="field">下次聯絡<input name="next_contact_date" type="date"></label>
      </div>
      <button class="btn" type="submit">新增服務紀錄</button>
    </form>` : ""}
    <h3 style="margin-top:18px">提醒</h3>
    ${reminders.map((item) => `<div class="list-item"><div><b>${esc(KIND_LABEL[item.kind] || "提醒")}</b> ${esc(item.title)}<div class="muted">${formatDate(item.due_at)} · ${item.status === "open" ? "未完成" : item.status === "done" ? "已完成" : "已取消"}</div></div>${item.status === "open" ? `<button class="btn secondary small" type="button" data-action="done-reminder" data-id="${esc(item.id)}">完成</button>` : ""}</div>`).join("") || `<div class="empty">這位客戶還沒有提醒。</div>`}
    ${(me().role === "admin" || customer.owner_id === me().id) ? `<form id="reminderForm" data-customer="${esc(customer.id)}" data-owner="${esc(customer.owner_id)}" class="form-grid cols-3" style="margin-top:10px">
      <label class="field">種類<select name="kind"><option value="birthday">生日</option><option value="policy_expiry">保單到期</option><option value="renewal">續保</option><option value="follow_up">追蹤</option><option value="other">其他</option></select></label>
      <label class="field">標題<input name="title" required maxlength="120"></label>
      <label class="field">日期<input name="due_at" type="date" required></label>
      <button class="btn" type="submit">新增提醒</button>
    </form>` : `<p class="muted">提醒屬於負責夥伴。主管可以查看客戶與服務，個人提醒預設不互相瀏覽。</p>`}
  </div>`;
}

async function renderAnnouncements() {
  const items = await store.listAnnouncements();
  $("announcementList").innerHTML = items.map((item) =>
    `<div class="notice"><span class="dot"></span><div><b>${esc(item.title)}</b>${item.published_at ? "" : ` <span class="badge">草稿</span>`}<small class="muted">${esc(item.body)}</small></div></div>`).join("")
    || `<div class="empty">還沒有公告。</div>`;
}

async function renderMembers() {
  const profile = me();
  const profiles = await store.listProfiles();
  $("memberList").innerHTML = profiles.map((item) => {
    const controls = profile.role === "admin" && store.mode === "cloud" && item.id !== profile.id
      ? `<div class="row"><select data-role-for="${esc(item.id)}">${["member", "manager", "admin"].map((role) => `<option value="${role}" ${item.role === role ? "selected" : ""}>${ROLE_LABEL[role]}</option>`).join("")}</select><button class="btn secondary small" type="button" data-action="save-member" data-id="${esc(item.id)}">更新</button><button class="btn danger small" type="button" data-action="toggle-member" data-id="${esc(item.id)}" data-active="${item.is_active ? "1" : "0"}">${item.is_active ? "停用" : "重新啟用"}</button></div>`
      : "";
    return `<div class="list-item"><div><b>${esc(item.display_name)}</b><div class="muted">${esc(ROLE_LABEL[item.role])}${item.is_active ? "" : " · 已停用"} · ${esc(item.email || "")}</div></div>${controls}</div>`;
  }).join("");
}

function resetCustomerForm() {
  $("customerForm").reset();
  $("customerForm").elements.id.value = "";
  $("birthPicker").value = "";
  $("customerFormTitle").textContent = "新增名單";
  $("customerCancel").hidden = true;
  if (me()) $("customerOwner").value = me().id;
  paintAnalysis();
}

async function handleAction(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const id = target.dataset.id;
  try {
    if (target.dataset.action === "asset-demo") toast("這是素材入口示範。正式版請貼上團隊核准的 https 連結。");
    if (target.dataset.action === "toggle-course") {
      await store.setCourseComplete(id, target.dataset.done !== "1");
      await renderLearn();
    }
    if (target.dataset.action === "toggle-task") {
      const tasks = await store.listTasks();
      const task = tasks.find((item) => item.id === id);
      if (task && task.owner_id === me().id) await store.saveTask({ id, title: task.title, is_done: target.checked });
      await renderCalendar();
    }
    if (target.dataset.action === "toggle-event") {
      const events = await store.listCalendarEvents();
      const row = events.find((item) => item.id === id);
      if (row && row.owner_id === me().id) await store.saveCalendarEvent({ ...row, is_done: target.checked });
      await renderCalendar();
    }
    if (target.dataset.action === "delete-task") {
      await store.deleteTask(id);
      await renderCalendar();
    }
    if (target.dataset.action === "cal-day") {
      openCalendarDay(target.dataset.date);
    }
    if (target.dataset.action === "cal-edit") {
      openCalendarDay(target.dataset.date || calItems.find((item) => item.id === id)?.date, id);
    }
    if (target.dataset.action === "coverage-tab") {
      coverageView = target.dataset.tab === "policies" ? "policies" : "gaps";
      await renderClients();
    }
    if (target.dataset.action === "open-client") {
      coverageView = "gaps";
      selectedCustomerId = id;
      const customers = await store.listCustomers();
      const customer = customers.find((item) => item.id === id);
      if (customer) fillCustomerForm(customer);
      await renderClients();
      $("clientDetail").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (target.dataset.action === "jump-analysis") {
      $("analysisBlock").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (target.dataset.action === "edit-cell") {
      openCellSheet(target.dataset.cell);
    }
    if (target.dataset.action === "edit-client") {
      const customers = await store.listCustomers();
      const customer = customers.find((item) => item.id === id);
      if (!customer) return;
      fillCustomerForm(customer);
      $("customerForm").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (target.dataset.action === "archive-client") {
      const customers = await store.listCustomers();
      const customer = customers.find((item) => item.id === id);
      if (!customer) return;
      await store.saveCustomer({ ...customer, is_archived: target.dataset.archived !== "1", service_tags: customer.service_tags || [] });
      toast(target.dataset.archived === "1" ? "已取消封存" : "已封存這位客戶");
      await renderClients();
    }
    if (target.dataset.action === "delete-policy") {
      await store.deletePolicy(id);
      await renderClients();
    }
    if (target.dataset.action === "delete-service") {
      await store.deleteServiceRecord(id);
      await renderClients();
    }
    if (target.dataset.action === "done-reminder") {
      await store.setReminderStatus(id, "done");
      await renderClients();
    }
    if (target.dataset.action === "save-member") {
      const role = document.querySelector(`[data-role-for="${CSS.escape(id)}"]`).value;
      await store.updateMember({ user_id: id, role });
      toast("已更新角色");
      await renderMembers();
    }
    if (target.dataset.action === "toggle-member") {
      await store.updateMember({ user_id: id, is_active: target.dataset.active !== "1" });
      toast(target.dataset.active === "1" ? "已停用" : "已重新啟用");
      await renderMembers();
    }
  } catch (error) {
    toast(error.message || "沒有完成");
  }
}

function bind() {
  document.body.addEventListener("click", (event) => {
    const nav = event.target.closest("[data-nav]");
    if (nav) {
      event.preventDefault();
      $("secretary").hidden = true;
      go(nav.dataset.nav);
      return;
    }
    const cat = event.target.closest("[data-cat]");
    if (cat) {
      assetCat = cat.dataset.cat;
      renderAssets();
    }
  });
  document.body.addEventListener("click", (event) => {
    if (event.target.closest("[data-action='toggle-task'], [data-action='toggle-event']")) return;
    handleAction(event);
  });
  document.body.addEventListener("change", (event) => {
    if (event.target.matches("[data-action='toggle-task'], [data-action='toggle-event']")) handleAction(event);
  });
  $("menuBtn").onclick = () => ($("drawer").classList.contains("open") ? closeMenu() : openMenu());
  $("avatarBtn").onclick = () => ($("drawer").classList.contains("open") ? closeMenu() : openMenu());
  $("backdrop").onclick = closeMenu;
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
      $("secretary").hidden = true;
      $("relationSheet").classList.remove("show");
      $("cellSheet").classList.remove("show");
      $("pngSheet").classList.remove("show");
      $("calSheet").classList.remove("show");
      $("gridFull").hidden = true;
    }
  });
  $("secretaryBtn").onclick = () => { $("secretary").hidden = false; };
  $("secretaryClose").onclick = () => { $("secretary").hidden = true; };
  $("assetSearch").addEventListener("input", () => renderAssets());
  $("clientSearch").addEventListener("input", () => renderClients());
  $("showArchived").addEventListener("change", () => renderClients());
  $("previewRole").addEventListener("change", async () => {
    store.setPreviewRole($("previewRole").value);
    selectedCustomerId = null;
    calOwner = "";
    calView = "month";
    resetCustomerForm();
    if (page === "announcements" && !canManageTeam(me().role)) page = "home";
    await renderPage();
  });
  $("signOutBtn").onclick = async () => {
    await store.signOut();
    show("loginView");
  };
  $("customerCancel").onclick = () => resetCustomerForm();
  $("resetDemo").onclick = async () => {
    store.resetDemo();
    selectedCustomerId = null;
    calOwner = "";
    resetCustomerForm();
    toast("已回到最初的示範資料");
    await renderPage();
  };
  $("calPrev").onclick = () => {
    calCursor = calView === "week" ? shiftWeek(calCursor || isoDate(), -1) : shiftMonth(calCursor || isoDate(), -1);
    renderCalendar();
  };
  $("calNext").onclick = () => {
    calCursor = calView === "week" ? shiftWeek(calCursor || isoDate(), 1) : shiftMonth(calCursor || isoDate(), 1);
    renderCalendar();
  };
  $("calToday").onclick = () => {
    calCursor = isoDate();
    calFocus = calCursor;
    renderCalendar();
  };
  document.querySelectorAll("[data-cal-view]").forEach((button) => {
    button.onclick = () => {
      calView = button.dataset.calView;
      renderCalendar();
    };
  });
  $("calMember").onchange = () => {
    calOwner = $("calMember").value;
    renderCalendar();
  };
  $("calSheetClose").onclick = () => $("calSheet").classList.remove("show");
  $("calNew").onclick = () => paintCalForm(null, calFocus || isoDate());
  $("calDelete").onclick = async () => {
    const form = $("calForm");
    const id = form.elements.id.value;
    if (!id) return;
    try {
      if (form.elements.source.value === "task") await store.deleteTask(id);
      else await store.deleteCalendarEvent(id);
      paintCalForm(null, form.elements.event_date.value);
      toast("已刪除");
      await renderCalendar();
    } catch (error) { toast(error.message); }
  };
  $("calForm").addEventListener("submit", onCalendar);
  $("forceDemoFromBlock").onclick = () => {
    forceDemoMode();
    location.reload();
  };
  $("showForgot").onclick = () => { $("forgotForm").hidden = !$("forgotForm").hidden; };
  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("loginError").textContent = "";
    try {
      await store.signIn($("loginEmail").value, $("loginPassword").value);
      show("app");
      await renderPage();
    } catch (error) {
      $("loginError").textContent = error.message || "登入沒有成功";
    }
  });
  $("forgotForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await store.requestPasswordReset($("forgotEmail").value);
      $("forgotMsg").textContent = "如果這個信箱有帳號，你會收到重設信。";
    } catch (error) {
      $("forgotMsg").textContent = error.message;
    }
  });
  $("recoveryForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      await store.updatePassword($("newPassword").value);
      toast("密碼已更新");
      history.replaceState({}, "", location.pathname + location.search);
      show("app");
      await renderPage();
    } catch (error) {
      $("recoveryError").textContent = error.message;
    }
  });

  $("assetForm").addEventListener("submit", onAsset);
  $("courseForm").addEventListener("submit", onCourse);
  $("customerForm").addEventListener("submit", onCustomer);
  $("customerForm").addEventListener("input", paintAnalysis);
  $("customerForm").addEventListener("change", paintAnalysis);
  $("relationOpen").onclick = openRelation;
  $("relationCancel").onclick = () => $("relationSheet").classList.remove("show");
  $("relationOk").onclick = () => {
    const social = $("relationSocialPick").value;
    const business = $("relationBusinessPick").value;
    if ((social && !business) || (!social && business)) {
      toast("社交和商業請一起選，或都留空。");
      return;
    }
    $("relationSocial").value = social;
    $("relationBusiness").value = business;
    $("relationSheet").classList.remove("show");
    paintAnalysis();
  };
  $("birthBtn").onclick = () => {
    const picker = $("birthPicker");
    try {
      if (typeof picker.showPicker === "function") picker.showPicker();
      else picker.click();
    } catch {
      picker.click();
    }
  };
  $("birthPicker").addEventListener("change", () => {
    $("birthRoc").value = rocLabel($("birthPicker").value);
    paintAnalysis();
  });
  $("birthRoc").addEventListener("change", () => {
    const parsed = parseRoc($("birthRoc").value);
    if (!parsed.error && parsed.iso) {
      $("birthRoc").value = rocLabel(parsed.iso);
      $("birthPicker").value = parsed.iso;
    }
    paintAnalysis();
  });
  $("cellSheetBody").addEventListener("input", () => {
    const field = $("cellSheet").dataset.field;
    if (!field) return;
    $("customerForm").elements[field].value = $("cellSheetBody").value;
    paintAnalysis();
  });
  $("cellSheetSubs").addEventListener("input", (event) => {
    const input = event.target.closest("[data-sub]");
    if (!input) return;
    $("customerForm").elements[input.dataset.sub].value = input.value;
    paintAnalysis();
  });
  $("cellSheetClose").onclick = () => $("cellSheet").classList.remove("show");
  $("analysisFull").onclick = () => {
    $("gridFull").hidden = false;
    paintAnalysis();
  };
  $("gridFullClose").onclick = () => { $("gridFull").hidden = true; };
  $("analysisDownload").onclick = () => downloadAnalysis().catch((error) => toast(error.message));
  $("gridFullDownload").onclick = () => downloadAnalysis().catch((error) => toast(error.message));
  $("pngClose").onclick = () => $("pngSheet").classList.remove("show");
  $("announcementForm").addEventListener("submit", onAnnouncement);
  $("inviteForm").addEventListener("submit", onInvite);
  document.body.addEventListener("submit", async (event) => {
    const form = event.target;
    if (form.id === "policyForm") return onPolicy(event);
    if (form.id === "serviceForm") return onService(event);
    if (form.id === "reminderForm") return onReminder(event);
  });

  window.addEventListener("popstate", () => {
    page = new URLSearchParams(location.search).get("page") || "home";
    if (!PAGE_NAMES[page]) page = "home";
    renderPage();
  });
}

async function onCalendar(event) {
  event.preventDefault();
  if (!canEditCalendar()) return;
  const form = event.target;
  const data = readForm(form);
  data.is_done = form.elements.is_done.checked;
  try {
    if (data.source === "task") {
      await store.saveTask({ id: data.id, title: data.title, due_date: data.event_date, is_done: data.is_done });
    } else {
      await store.saveCalendarEvent({
        id: data.id || null,
        title: data.title,
        event_date: data.event_date,
        event_time: data.event_time,
        event_type: data.event_type,
        customer_id: data.customer_id,
        note: data.note,
        is_done: data.is_done,
      });
    }
    toast("已存進行事曆");
    calCursor = data.event_date || calCursor;
    await renderCalendar();
    if (data.event_date) openCalendarDay(data.event_date);
  } catch (error) { toast(error.message); }
}

async function onAsset(event) {
  event.preventDefault();
  const data = readForm(event.target);
  if (data.external_url && !isHttpsUrl(data.external_url)) return toast("素材連結請使用 https");
  try {
    await store.saveAsset(data);
    event.target.reset();
    toast("已加入素材庫");
    await renderAssets();
  } catch (error) { toast(error.message); }
}

async function onCourse(event) {
  event.preventDefault();
  const data = readForm(event.target);
  if (data.content_url && !isHttpsUrl(data.content_url)) return toast("教材連結請使用 https");
  try {
    await store.saveCourse(data);
    event.target.reset();
    toast("已發布教材");
    await renderLearn();
  } catch (error) { toast(error.message); }
}

async function onCustomer(event) {
  event.preventDefault();
  const data = readForm(event.target);
  try {
    const existing = data.id ? (await store.listCustomers()).find((item) => item.id === data.id) : null;
    const saved = await store.saveCustomer({
      ...data,
      id: data.id || null,
      is_archived: Boolean(existing?.is_archived),
      owner_id: canManageTeam(me().role) ? data.owner_id : me().id,
      email: existing?.email || "",
      preferred_contact: existing?.preferred_contact || "",
      service_tags: existing?.service_tags || [],
      birth_date: null,
      birthday_md: String(data.birth_roc || "").trim() ? null : (data.birthday_md_keep || null),
    });
    selectedCustomerId = saved.id;
    fillCustomerForm(saved);
    toast("名單已儲存");
    await renderClients();
  } catch (error) { toast(error.message); }
}

async function onPolicy(event) {
  event.preventDefault();
  const form = event.target;
  const data = readForm(form);
  if (!isLast4(data.reference_last4)) return toast("保單只留末四碼，或先留空。");
  try {
    await store.savePolicy({ ...data, customer_id: form.dataset.customer, reference_last4: data.reference_last4.trim() || null });
    toast("已新增保單摘要");
    await renderClients();
  } catch (error) { toast(error.message); }
}

async function onService(event) {
  event.preventDefault();
  const form = event.target;
  const data = readForm(form);
  if (!data.summary.trim()) return;
  try {
    await store.saveServiceRecord({
      ...data,
      customer_id: form.dataset.customer,
      service_date: `${data.service_date}T09:00:00`,
    });
    toast("已新增服務紀錄");
    await renderClients();
  } catch (error) { toast(error.message); }
}

async function onReminder(event) {
  event.preventDefault();
  const form = event.target;
  const data = readForm(form);
  try {
    await store.saveReminder({
      customer_id: form.dataset.customer,
      owner_id: form.dataset.owner,
      kind: data.kind,
      title: data.title,
      due_at: `${data.due_at}T09:00:00`,
    });
    toast("已新增提醒");
    await renderClients();
  } catch (error) { toast(error.message); }
}

async function onAnnouncement(event) {
  event.preventDefault();
  const data = readForm(event.target);
  try {
    await store.saveAnnouncement({ ...data, publish: Boolean(data.publish) });
    event.target.reset();
    event.target.elements.publish.checked = true;
    toast("公告已儲存");
    await renderAnnouncements();
  } catch (error) { toast(error.message); }
}

async function onInvite(event) {
  event.preventDefault();
  const data = readForm(event.target);
  try {
    await store.inviteMember(data);
    event.target.reset();
    toast("邀請信已送出");
    await renderMembers();
  } catch (error) { toast(error.message); }
}

function enterApp() {
  show("app");
  const requested = new URLSearchParams(location.search).get("page") || "home";
  page = PAGE_NAMES[requested] ? requested : "home";
  renderPage();
}

async function main() {
  bind();
  try {
    store = await openStore();
  } catch {
    show("loginView");
    $("loginError").textContent = "現在連不上雲端。請稍後再試，或先把 config.js 留空使用示範資料。";
    return;
  }
  if (store.mode === "blocked") {
    show("blockedView");
    return;
  }
  if (store.mode === "cloud" && location.hash.includes("type=recovery")) {
    show("recoveryView");
    return;
  }
  if (store.mode === "cloud" && !store.profile) {
    show("loginView");
    return;
  }
  enterApp();
}

main();
