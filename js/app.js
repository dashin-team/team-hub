import {
  EVENT_TYPES,
  HOUR_PX,
  REMINDERS,
  WEEKDAYS,
  addMinutes,
  eventType,
  formatHours,
  layoutDay,
  monthGrid,
  nextHalfHour,
  pad,
  parseInstant,
  reminderLabel,
  shiftMonth,
  shiftWeek,
  stocktake,
  toLocalInput,
  weekdayIndex,
} from "@hub/calendar";
import { teamDay } from "@hub/team";
import { ROSTER_RANKS, TEAM_ROSTER, countRanks, filterRoster, groupRoster, rosterMembers } from "@hub/roster";
import { CURRENT_CONTEST } from "@hub/contest";
import {
  ANALYSIS_SECTIONS,
  filledCount,
  gridCells,
  parseRoc,
  relationLabel,
  upcomingBirthdays,
  renderAnalysisPng,
  dailyClientPick,
  renderStrategyPng,
  rocLabel,
  STRATEGY_SLOTS,
  strategyFrom,
  taipeiDay,
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
  canViewPerson,
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
  roster: "同仁名單",
  announcements: "管理",
};

const $ = (id) => document.getElementById(id);
let store;
let page = "home";
let assetCat = "全部";
let selectedCustomerId = null;
let clientTab = "list";
let coverageView = "gaps";
let calView = "month";
let calCursor = "";
let calFocus = "";
let calOwner = "";
let clientFocus = "";
let rosterQuery = "";
let activityById = new Map();
let rosterRank = "";
let rosterSource = TEAM_ROSTER;
let passwordFirst = false;
let signedInPassword = "";
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
  for (const view of ["boot", "blockedView", "loginView", "recoveryView", "passwordView", "app"]) {
    $(view).hidden = view !== id;
  }
}

function me() {
  return store.profile;
}

function nameOf(id, profiles) {
  return profiles.find((item) => item.id === id)?.display_name || "—";
}

function isAdmin() {
  return me()?.role === "admin";
}

function go(next) {
  next = PAGE_ALIAS[next] || next;
  if (!PAGE_NAMES[next]) next = "home";
  if (next === "clients" && isAdmin()) next = "home";
  if (next === "roster" && !isAdmin()) next = "home";
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
  const name = shownName(profile);
  $("drawerName").textContent = name;
  $("whoName").textContent = profile ? ROLE_LABEL[profile.role] || "" : "";
  paintAvatar(profile, name);
  $("adviceAvatar") && ($("adviceAvatar").textContent = name.slice(0, 1) || "南");
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

function shownName(profile) {
  if (!profile) return "";
  return profile.role === "admin" ? "南恩" : (profile.display_name || "");
}

function paintAvatar(profile, name) {
  const label = name || shownName(profile);
  const letter = $("avatarLetter");
  const image = $("avatarImage");
  if (letter) letter.textContent = label.slice(0, 1) || "南";
  const url = profile?.avatar_url || "";
  if (!image) return;
  if (url) {
    image.src = url;
    image.hidden = false;
    if (letter) letter.hidden = true;
  } else {
    image.removeAttribute("src");
    image.hidden = true;
    if (letter) letter.hidden = false;
  }
}

function cropAvatar(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => {
      const side = Math.min(image.width, image.height);
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      canvas.getContext("2d").drawImage(
        image,
        (image.width - side) / 2,
        (image.height - side) / 2,
        side,
        side,
        0,
        0,
        256,
        256,
      );
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("圖片沒有處理好"));
      }, "image/jpeg", 0.86);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("這張圖片打不開"));
    };
    image.src = url;
  });
}

async function onAvatarFile(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  try {
    const blob = await cropAvatar(file);
    await store.setAvatar(blob);
    paintAvatar(me(), shownName(me()));
    toast("頭像已更新");
  } catch (error) {
    toast(error.message || "頭像沒有更新");
  }
}

function readForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

async function renderPage() {
  page = PAGE_ALIAS[page] || page;
  if (!PAGE_NAMES[page]) page = "home";
  if (page === "clients" && isAdmin()) page = "home";
  if (page === "roster" && !isAdmin()) page = "home";
  if (page === "announcements" && !canManageTeam(me()?.role)) page = "home";
  applyRoleChrome();
  if (page === "home") await renderHome();
  if (page === "ai") await renderTools();
  if (page === "learn") {
    /* 訓練頁先留白。 */
  }
  if (page === "tasks") await renderCalendar();
  if (page === "clients") await renderClients();
  if (page === "social") renderContest();
  if (page === "roster") await loadRoster();
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
    [activity, "近7日活動量", "tasks"],
    [visits, "今日拜訪量", "tasks"],
    [agenda.filter((item) => item.date <= addDays(today, 7)).length, "近7日行程", "tasks"],
  ];
  if (profile.role !== "admin") metrics.unshift([newNames, "近7日新增名單", "clients"]);
  $("homeStats").innerHTML = metrics.map(([value, label, dest]) =>
    `<button class="metric" type="button" data-nav="${dest}"><b>${esc(value)}</b><span>${esc(label)} →</span></button>`).join("");
  const birthdays = upcomingBirthdays(
    customers.filter((item) => !item.is_archived && item.owner_id === profile.id),
    today,
    30,
  );
  $("homeBirthdays").innerHTML = birthdays.length ? birthdays.map((item) => `
    <button class="bday-row ${item.days === 0 ? "today" : ""}" type="button" data-action="open-birthday" data-id="${esc(item.id)}">
      <span><b>${esc(item.name)}</b><small> ${item.month}/${item.day}${item.age != null ? ` · ${item.age} 歲` : ""}</small></span>
      <b>${item.days === 0 ? "今天生日🎂" : `還有 ${item.days} 天`}</b>
    </button>`).join("") : `<div class="empty">近 30 天沒有客戶生日</div>`;
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

function formatLastSignIn(value) {
  if (!value) return "從未登入";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "從未登入";
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Taipei",
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${Number(part("month"))}/${Number(part("day"))} ${part("hour").padStart(2, "0")}:${part("minute").padStart(2, "0")}`;
}

function renderRoster() {
  const meId = me()?.id;
  const everyone = rosterMembers(rosterSource);
  const totals = countRanks(everyone);
  $("rosterStats").innerHTML = [
    ["全部", totals.total],
    ["UM", totals.UM],
    ["SP", totals.SP],
    ["CA", totals.CA],
  ].map(([label, count]) => `<span class="roster-stat"><b>${count}</b>${esc(label)}</span>`).join("");
  $("rosterRanks").innerHTML = ["", ...ROSTER_RANKS].map((rank) => {
    const label = rank || "全部";
    const on = rosterRank === rank ? " active" : "";
    return `<button class="tag-outline${on}" type="button" data-roster-rank="${rank}">${label}</button>`;
  }).join("");
  const groups = filterRoster(rosterSource, { query: rosterQuery, rank: rosterRank });
  const shown = groups.reduce((sum, group) => sum + group.members.length, 0);
  $("rosterMatch").textContent = rosterQuery || rosterRank ? `目前顯示 ${shown} 人` : "";
  $("rosterList").innerHTML = groups.map((group) => `
    <article class="panel roster-card">
      <h2>${esc(group.district)} · ${group.members.length}人</h2>
      ${group.members.map((member) => {
        const remove = member.id && member.id !== meId && member.role !== "admin"
          ? `<button class="btn danger small" type="button" data-action="remove-member" data-id="${esc(member.id)}" data-name="${esc(member.name)}">刪除夥伴</button>`
          : "";
        return `<div class="roster-row"><div class="roster-person"><b>${esc(member.name)}</b><small>上次登入 ${esc(formatLastSignIn(member.lastSignIn))}</small></div><span class="rank ${esc(String(member.rank || "").toLowerCase())}">${esc(member.rank)}</span>${remove}</div>`;
      }).join("")}
    </article>`).join("") || `<div class="empty">沒有符合的同仁。</div>`;
}

async function loadActivity() {
  if (me()?.role !== "admin" || !store?.listMemberActivity) {
    activityById = new Map();
    return;
  }
  try {
    const rows = await store.listMemberActivity();
    activityById = new Map((rows || []).map((row) => [row.id, row.last_sign_in_at || null]));
  } catch {
    activityById = new Map();
  }
}

async function loadRoster() {
  if (!isAdmin()) return;
  await loadActivity();
  const rows = store?.mode === "cloud"
    ? await store.listTeamRoster()
    : (await store.listProfiles()).filter((item) => item.is_active !== false);
  rosterSource = groupRoster((rows || []).map((row) => ({
    ...row,
    last_sign_in_at: activityById.has(row.id) ? activityById.get(row.id) : row.last_sign_in_at,
  })));
  const profiles = store?.mode === "cloud" ? rows : await store.listProfiles();
  fillMemberZones(profiles || []);
  renderRoster();
}

function renderTools() {
  $("toolList").innerHTML = GUIDE_LINKS.map((item) => {
    if (!isHttpsUrl(item.href)) return "";
    const subtitle = item.subtitle ? `<small>${esc(item.subtitle)}</small>` : "";
    return `<a class="guide-card" href="${esc(item.href)}" target="_blank" rel="noopener"><span class="guide-icon" aria-hidden="true">${item.icon}</span><b>${esc(item.title)}</b>${subtitle}</a>`;
  }).join("");
}

async function renderAssets() {
  if (!$("assetList")) return;
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
  if (!$("learnSummary")) return;
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
  events.filter((item) => item.owner_id === ownerId).forEach((item) => {
    const date = String(item.event_date || item.starts_at || "").slice(0, 10);
    const start = item.starts_at ? new Date(item.starts_at) : (item.event_time ? new Date(`${date}T${String(item.event_time).slice(0, 5)}:00`) : new Date(`${date}T00:00:00`));
    const end = item.ends_at ? new Date(item.ends_at) : new Date(start.getTime() + (item.all_day || !item.event_time ? 24 * 3600000 - 60000 : 30 * 60000));
    rows.push({
      id: item.id,
      source: "event",
      owner_id: item.owner_id,
      title: item.title,
      date,
      time: item.all_day || !item.event_time ? "" : `${pad(start.getHours())}:${pad(start.getMinutes())}`,
      type: item.event_type,
      customer_id: item.customer_id || "",
      companion_id: item.companion_id || "",
      note: item.note || "",
      is_done: Boolean(item.is_done),
      allDay: Boolean(item.all_day) || !item.event_time,
      starts: start.toISOString(),
      ends: end.toISOString(),
      reminder: item.reminder || "none",
    });
  });
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
    allDay: true,
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
    allDay: true,
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

function timeRange(item) {
  if (!item.starts || !item.ends || item.allDay) return "";
  const start = new Date(item.starts);
  const end = new Date(item.ends);
  return `${pad(start.getHours())}:${pad(start.getMinutes())}–${pad(end.getHours())}:${pad(end.getMinutes())}`;
}

function chipText(item, customers) {
  const who = customers.find((customer) => customer.id === item.customer_id);
  return [timeRange(item) || item.time, itemLabel(item), item.title, who ? who.display_name : ""].filter(Boolean).join(" ");
}

function dotsHtml(items, date) {
  const team = teamDay(date);
  const teamDot = team ? `<i class="dot" style="background:#1b3a5f" title="團隊"></i>` : "";
  const shown = items.slice(0, 3).map((item) =>
    `<i class="dot ${item.is_done ? "done" : ""}" style="background:${itemColor(item)}" title="${esc(itemLabel(item))}"></i>`).join("");
  const more = items.length > 3 ? `<span class="cal-more">+${items.length - 3}</span>` : "";
  return `<span class="cal-dots">${teamDot}${shown}${more}</span>`;
}

function stockBlock(title, tally) {
  const lines = EVENT_TYPES.map((type) => {
    const count = tally.byType[type.id];
    return `<div class="cal-count"><span><i style="background:${type.color}"></i>${esc(type.label)}</span><b>${count.done}/${count.planned} · ${esc(formatHours(count.hours))}</b></div>`;
  }).join("");
  const extra = [
    tally.tasks.planned ? `<p class="muted">原有待辦 ${tally.tasks.done}/${tally.tasks.planned}，不計入完成率。</p>` : "",
    tally.reminders ? `<p class="muted">未完成的客戶提醒 ${tally.reminders} 件。</p>` : "",
    `<p class="muted">團隊固定行程不計入個人盤點。</p>`,
  ].join("");
  return `<h3>${esc(title)}</h3>${lines}<p>計畫 ${tally.planned} · 完成 ${tally.done} · 未完成 ${tally.open} · 完成率 ${tally.rate}% · ${esc(formatHours(tally.hours))}</p>${extra}`;
}

function teamTable(profiles, events, today) {
  const rows = profiles.map((person) => {
    const mine = calendarItems(events, [], [], person.id);
    const tally = stocktake(mine, today);
    const detail = (bucket) => EVENT_TYPES.map((type) => `${type.label} ${bucket.byType[type.id].done}/${bucket.byType[type.id].planned} ${formatHours(bucket.byType[type.id].hours)}`).join("、");
    return `<tr><td>${esc(person.display_name)}</td><td><b>${tally.week.done}/${tally.week.planned} · ${tally.week.rate}%</b><small>${esc(detail(tally.week))}</small></td><td><b>${tally.month.done}/${tally.month.planned} · ${tally.month.rate}%</b><small>${esc(detail(tally.month))}</small></td></tr>`;
  }).join("");
  return `<h3>團隊盤點</h3><div class="table-wrap"><table class="cal-team"><thead><tr><th>夥伴</th><th>本週</th><th>本月</th></tr></thead><tbody>${rows || `<tr><td colspan="3">還沒有夥伴。</td></tr>`}</tbody></table></div>`;
}

function teamChipHtml(chip) {
  return `<span class="team-chip ${esc(chip.kind)}">🔒 ${esc(chip.text)}</span>`;
}

function teamDetailHtml(day) {
  if (!day) return "";
  if (day.weekend) return `<div class="team-chips">${teamChipHtml(day.chips[0])}</div>`;
  const lines = [`<p>早會 08:30–10:00　${esc(day.title.replace(/^早會｜/, ""))}</p>`]
    .concat(day.chips.map((chip) => `<p class="${chip.kind === "important" ? "important" : ""}">${esc(chip.text)}</p>`));
  const chips = day.chips.map(teamChipHtml).join("");
  return `<div class="team-chips">${chips}</div><details class="team-fold"><summary>團隊固定行程</summary>${lines.join("")}</details>`;
}

function hourRows() {
  return Array.from({ length: 24 }, (_, hour) => `<div class="tl-hour"><span>${pad(hour)}:00</span><div></div></div>`).join("");
}

function personalBlocks(items, date, editable = true) {
  const layout = layoutDay(items, date);
  return layout.timed.map((item) => {
    const top = (item.startMin / 60) * HOUR_PX;
    const height = Math.max(22, ((item.endMin - item.startMin) / 60) * HOUR_PX - 2);
    const width = 100 / layout.columns;
    const left = item.column * width;
    const action = editable
      ? `data-action="cal-edit" data-id="${esc(item.id)}" data-source="${esc(item.source)}" data-date="${date}"`
      : `draggable="false"`;
    const tag = editable ? "button" : "div";
    return `<${tag} class="tl-block ${item.is_done ? "done" : ""}" ${editable ? `type="button"` : ""} style="top:${top}px;height:${height}px;left:${left}%;width:${width}%;background:${itemColor(item)}" ${action}><b>${esc(item.title)}</b><small>${esc(timeRange(item))}</small></${tag}>`;
  }).join("");
}

function teamTimedHtml(day) {
  if (!day || day.weekend) return "";
  const top = 8.5 * HOUR_PX;
  const height = 1.5 * HOUR_PX - 2;
  return `<div class="tl-block team" style="top:${top}px;height:${height}px;left:0;width:100%"><b>🔒 ${esc(day.title)}</b><small>08:30–10:00</small></div>`;
}

function allDayPersonal(items, date, customers, editable = true) {
  return items.filter((item) => item.allDay && item.date === date).map((item) => {
    if (!editable) return `<span class="all-chip" draggable="false">${esc(chipText(item, customers))}</span>`;
    return `<button class="all-chip" type="button" data-action="cal-edit" data-id="${esc(item.id)}" data-source="${esc(item.source)}" data-date="${date}">${esc(chipText(item, customers))}</button>`;
  }).join("");
}

function renderTimeline(dates, customers, editable = true) {
  if (dates.length === 1) {
    const date = dates[0];
    const day = teamDay(date);
    return `<div class="tl"><div class="tl-all"><b>全天</b><div>${teamDetailHtml(day)}${allDayPersonal(calItems, date, customers, editable)}</div></div><div class="tl-scroll" data-cal-scroll><div class="tl-grid">${hourRows()}<div class="tl-overlay">${teamTimedHtml(day)}${personalBlocks(calItems, date, editable)}</div></div></div></div>`;
  }
  const head = dates.map((date) => `<button type="button" class="${date === isoDate() ? "today" : ""}" data-action="cal-day" data-date="${date}">${Number(date.slice(8))}<br>${WEEKDAYS[weekdayIndex(date)]}</button>`).join("");
  const allday = dates.map((date) => {
    const day = teamDay(date);
    const holiday = day?.weekend ? teamChipHtml(day.chips[0]) : "";
    const morning = day && !day.weekend ? `<span class="team-chip">🔒 早會</span>` : "";
    return `<div>${holiday}${morning}${allDayPersonal(calItems, date, customers, editable)}</div>`;
  }).join("");
  const cols = dates.map((date) => `<div class="wk-col">${teamTimedHtml(teamDay(date))}${personalBlocks(calItems, date, editable)}</div>`).join("");
  const hours = Array.from({ length: 24 }, (_, hour) => `<div>${pad(hour)}</div>`).join("");
  return `<div class="wk"><div class="wk-head"><span></span>${head}</div><div class="wk-all"><b>全天</b>${allday}</div><div class="wk-scroll" data-cal-scroll><div class="wk-body"><div class="wk-hours">${hours}</div>${cols}</div></div></div>`;
}

function scrollTimeline() {
  const scroller = document.querySelector("[data-cal-scroll]");
  if (scroller) scroller.scrollTop = 8 * HOUR_PX;
}

function paintClientList(query) {
  const q = String(query || "").trim().toLowerCase();
  const matches = calCustomers.filter((customer) => {
    const blob = `${customer.display_name} ${customer.nickname || ""}`.toLowerCase();
    return !q || blob.includes(q);
  }).slice(0, 6);
  $("calClientList").innerHTML = matches.map((customer) =>
    `<button type="button" data-client="${esc(customer.id)}">${esc(customer.display_name)}</button>`).join("");
}

function selectType(typeId) {
  $("calType").value = typeId;
  document.querySelectorAll("#calTypes button").forEach((button) => button.classList.toggle("on", button.dataset.type === typeId));
}

function paintCalForm(item, date, preset = {}) {
  const form = $("calForm");
  const editingTask = item?.source === "task";
  const editing = Boolean(item);
  form.elements.id.value = item?.id || "";
  form.elements.source.value = editingTask ? "task" : "event";
  form.elements.title.value = preset.title || item?.title || "";
  form.elements.note.value = item?.note || "";
  form.elements.is_done.checked = Boolean(item?.is_done);
  form.elements.next_visit.checked = false;
  document.querySelectorAll(".cal-event-only").forEach((node) => { node.hidden = editingTask; });
  document.querySelectorAll(".cal-task-only").forEach((node) => { node.hidden = !editingTask; });
  form.elements.starts_at.required = !editingTask;
  form.elements.ends_at.required = !editingTask;
  if (editingTask) {
    form.elements.event_date.value = item.date || date;
  } else {
    selectType(preset.event_type || (eventType(item?.type) ? item.type : "visit"));
    const customerId = preset.customer_id || item?.customer_id || "";
    form.elements.customer_id.value = customerId;
    const customer = calCustomers.find((row) => row.id === customerId);
    $("calClientSearch").value = customer?.display_name || "";
    $("calClientList").innerHTML = "";
    const options = [`<option value="">不指定</option>`].concat(calTeammates.filter((person) => person.id !== me()?.id).map((person) =>
      `<option value="${esc(person.id)}">${esc(person.display_name)}</option>`));
    $("calCompanion").innerHTML = options.join("");
    $("calCompanion").value = item?.companion_id || "";
    $("calReminder").value = item?.reminder || "none";
    $("calReminderHint").textContent = `提醒：${reminderLabel($("calReminder").value)}。這一版只記錄，不會推播。`;
    if (item?.starts && item?.ends && !preset.title) {
      form.elements.all_day.checked = Boolean(item.allDay);
      form.elements.starts_at.value = toLocalInput(item.starts);
      form.elements.ends_at.value = toLocalInput(item.ends);
    } else {
      const start = nextHalfHour(new Date(), date || isoDate());
      form.elements.all_day.checked = false;
      form.elements.starts_at.value = toLocalInput(start);
      form.elements.ends_at.value = toLocalInput(addMinutes(start, 30));
    }
  }
  $("calDelete").hidden = !editing || item.source === "reminder";
  form.hidden = item?.source === "reminder" || !canEditCalendar();
  $("calSheetTitle").textContent = editingTask ? "編輯待辦" : (editing ? "編輯行程" : "新增行程");
}

function calendarPartners(profile, people, teammates) {
  const allowed = new Map((people || [])
    .filter((person) => person.id !== profile.id && person.is_active !== false && canViewPerson(profile, person))
    .map((person) => [person.id, person]));
  const fromDirectory = (teammates || []).filter((person) => allowed.has(person.id));
  const rows = fromDirectory.length ? fromDirectory.map((person) => allowed.get(person.id)) : [...allowed.values()];
  return rows.sort((a, b) => String(a.display_name).localeCompare(String(b.display_name), "zh-Hant"));
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

function openEventForm(item, date, preset) {
  calFocus = date || item?.date || isoDate();
  paintCalForm(item, calFocus, preset);
  $("calNew").hidden = !canEditCalendar();
  $("calSheet").classList.add("show");
  if (!item && canEditCalendar()) $("calForm").elements.title.focus();
}

let calCustomers = [];
let calTeammates = [];

async function renderCalendar() {
  const profile = me();
  if (!calCursor) calCursor = isoDate();
  if (!$("calTypes").dataset.ready) {
    $("calTypes").innerHTML = EVENT_TYPES.map((type) =>
      `<button type="button" data-type="${type.id}" style="--c:${type.color}">${esc(type.label)}</button>`).join("");
    $("calTypes").dataset.ready = "1";
    $("calReminder").innerHTML = REMINDERS.map((item) => `<option value="${item.id}">${esc(item.label)}</option>`).join("");
  }
  const today = isoDate();
  const [events, tasks, reminders, profiles, customers, teammates] = await Promise.all([
    store.listCalendarEvents(),
    store.listTasks(),
    store.listReminders(),
    store.listProfiles(),
    store.listCustomers(),
    store.listTeammates(),
  ]);
  calCustomers = customers;
  calTeammates = teammates;
  const visibleProfiles = profiles.filter((person) => person.is_active !== false && canViewPerson(profile, person));
  const ownerId = viewedOwnerId();
  if (!visibleProfiles.some((person) => person.id === ownerId)) calOwner = "";
  const activeOwner = viewedOwnerId();
  calItems = calendarItems(events, tasks, reminders, activeOwner);
  const owner = visibleProfiles.find((person) => person.id === activeOwner) || profile;
  const partners = calendarPartners(profile, visibleProfiles, teammates);
  $("calMember").innerHTML = [`<option value="">自己</option>`].concat(partners.map((person) =>
    `<option value="${esc(person.id)}">${esc(person.display_name)}</option>`)).join("");
  $("calMember").value = calOwner && calOwner !== profile.id ? calOwner : "";
  const editingSelf = activeOwner === profile.id;
  $("calReadonly").hidden = editingSelf;
  $("calReadonlyText").textContent = editingSelf ? "" : `正在查看 ${owner.display_name} 的行事曆（唯讀）`;
  $("calScope").textContent = editingSelf ? "點一天看時間表，右下角 ＋ 可新增。" : "";
  $("calAdd").hidden = !editingSelf;
  document.querySelectorAll("[data-cal-view]").forEach((button) => button.classList.toggle("on", button.dataset.calView === calView));
  $("calLegend").innerHTML = EVENT_TYPES.map((type) =>
    `<span><i class="dot" style="background:${type.color}"></i>${esc(type.label)}</span>`).join("")
    + `<span><i class="dot" style="background:#1b3a5f"></i>團隊</span><span><i class="dot" style="background:#c4a574"></i>待辦</span>`;
  if (calView === "month") {
    const grid = monthGrid(calCursor);
    $("calLabel").textContent = grid.label;
    const head = WEEKDAYS.map((day) => `<div class="cal-dow">${day}</div>`).join("");
    const cells = grid.weeks.flat().map((day) => {
      const mine = calItems.filter((item) => item.date === day.date);
      const classes = ["cal-cell", day.inMonth ? "" : "out", day.date === today ? "today" : ""].filter(Boolean).join(" ");
      return `<button class="${classes}" type="button" data-action="cal-day" data-date="${day.date}"><b>${Number(day.date.slice(8))}</b>${dotsHtml(mine, day.date)}</button>`;
    }).join("");
    $("calBoard").innerHTML = `<div class="cal-month">${head}${cells}</div>`;
  } else if (calView === "week") {
    const start = addDays(calCursor, -weekdayIndex(calCursor));
    $("calLabel").textContent = `${formatDate(start)} – ${formatDate(addDays(start, 6))}`;
    const dates = Array.from({ length: 7 }, (_, index) => addDays(start, index));
    $("calBoard").innerHTML = renderTimeline(dates, customers, activeOwner === profile.id);
    scrollTimeline();
  } else {
    $("calLabel").textContent = `${Number(calCursor.slice(5, 7))}月${Number(calCursor.slice(8))}日 ${WEEKDAYS[weekdayIndex(calCursor)]}`;
    $("calBoard").innerHTML = renderTimeline([calCursor], customers, activeOwner === profile.id);
    scrollTimeline();
  }
  const tally = stocktake(calItems, today);
  $("calStock").innerHTML = `<div class="cal-stock"><h2>盤點</h2>${stockBlock(`本週 ${formatDate(tally.weekStart)} – ${formatDate(tally.weekEnd)}`, tally.week)}${stockBlock(`${today.slice(0, 4)}年${Number(today.slice(5, 7))}月`, tally.month)}</div>`;
  $("calTeam").innerHTML = canManageTeam(profile.role) ? teamTable(visibleProfiles, events, today) : "";
}

function applyAllDay(on) {
  const form = $("calForm");
  const start = parseInstant(form.elements.starts_at.value) || nextHalfHour();
  if (!on) {
    const next = nextHalfHour(new Date(), isoDate(start));
    form.elements.starts_at.value = toLocalInput(next);
    form.elements.ends_at.value = toLocalInput(addMinutes(next, 30));
    return;
  }
  const day = isoDate(start);
  form.elements.starts_at.value = `${day}T00:00`;
  form.elements.ends_at.value = `${day}T23:59`;
}

function keepEndAfterStart() {
  const form = $("calForm");
  const start = parseInstant(form.elements.starts_at.value);
  const end = parseInstant(form.elements.ends_at.value);
  if (start && (!end || end.getTime() <= start.getTime())) form.elements.ends_at.value = toLocalInput(addMinutes(start, 30));
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
  paintStrategy();
  const label = relationLabel($("relationSocial").value, $("relationBusiness").value);
  $("relationText").textContent = label || "請選擇";
}

const CONTACT_OPTIONS = ["LINE", "IG", "FB", "Threads"];
const SOURCE_OPTIONS = ["緣故", "陌開", "轉介紹", "其他"];

function splitList(value) {
  return String(value || "").split(/[,，、]/).map((item) => item.trim()).filter(Boolean);
}

function syncContactMethod() {
  const selected = [...document.querySelectorAll("#contactChips button.on")].map((button) => button.dataset.contact);
  const legacy = splitList($("contactChips").dataset.legacy);
  $("contactMethod").value = [...selected, ...legacy].join(",");
  paintAnalysis();
}

function setContactChips(value) {
  const parts = splitList(value);
  const known = new Set(parts.filter((item) => CONTACT_OPTIONS.includes(item)));
  const legacy = parts.filter((item) => !CONTACT_OPTIONS.includes(item));
  $("contactChips").dataset.legacy = legacy.join(",");
  document.querySelectorAll("#contactChips button").forEach((button) => {
    button.classList.toggle("on", known.has(button.dataset.contact));
  });
  $("contactLegacy").hidden = legacy.length === 0;
  $("contactLegacy").textContent = legacy.length ? `原紀錄：${legacy.join("、")}` : "";
  $("contactMethod").value = [...CONTACT_OPTIONS.filter((item) => known.has(item)), ...legacy].join(",");
}

function syncLeadSource() {
  const selected = document.querySelector("#sourceChips button.on");
  const legacy = $("sourceChips").dataset.legacy || "";
  $("leadSource").value = selected ? selected.dataset.source : legacy;
  paintAnalysis();
}

let clientCache = [];

function sourceOptionsFor(customers, extra = "") {
  const ownerId = me()?.id;
  const values = [...SOURCE_OPTIONS];
  const seen = new Set(values);
  for (const customer of customers || []) {
    if (ownerId && customer.owner_id !== ownerId) continue;
    const text = String(customer.lead_source || "").trim();
    if (!text || seen.has(text)) continue;
    seen.add(text);
    values.push(text);
  }
  const more = String(extra || "").trim();
  if (more && !seen.has(more)) values.push(more);
  return values;
}

function renderSourceChips(customers = clientCache, extra = "") {
  const current = $("leadSource")?.value || extra;
  const choices = sourceOptionsFor(customers, extra || current);
  $("sourceChips").innerHTML = `${choices.map((item) =>
    `<button type="button" data-source="${esc(item)}">${esc(item)}</button>`).join("")}<button type="button" id="sourceAdd">＋新增</button>`;
  setLeadSource(current);
}

function setLeadSource(value) {
  const text = String(value || "").trim();
  const buttons = [...document.querySelectorAll("#sourceChips [data-source]")];
  const known = buttons.some((button) => button.dataset.source === text);
  $("sourceChips").dataset.legacy = known || !text ? "" : text;
  buttons.forEach((button) => button.classList.toggle("on", button.dataset.source === text));
  $("sourceLegacy").hidden = known || !text;
  $("sourceLegacy").textContent = known || !text ? "" : `原紀錄：${text}`;
  $("leadSource").value = text;
}

function commitCustomSource() {
  const text = $("sourceCustom").value.trim();
  $("sourceCustom").value = "";
  $("sourceCustom").hidden = true;
  if (!text) return;
  if (text.length > 80) {
    toast("客戶來源請在 80 字以內。");
    return;
  }
  renderSourceChips(clientCache, text);
  setLeadSource(text);
  paintAnalysis();
}

function fillCustomerForm(customer) {
  const form = $("customerForm");
  mountAnalysisFields();
  form.elements.id.value = customer.id || "";
  form.elements.display_name.value = customer.display_name || "";
  form.elements.nickname.value = customer.nickname || "";
  form.elements.referrer.value = customer.referrer || "";
  form.elements.birth_roc.value = rocLabel(customer.birth_date);
  $("birthPicker").value = customer.birth_date ? String(customer.birth_date).slice(0, 10) : "";
  form.elements.birthday_md_keep.value = customer.birth_date ? "" : (customer.birthday_md || "");
  form.querySelectorAll('input[name="gender"]').forEach((radio) => {
    radio.checked = radio.value === customer.gender;
  });
  form.elements.phone.value = customer.phone || "";
  setContactChips(customer.contact_method || "");
  form.elements.hobbies.value = customer.hobbies || "";
  setLeadSource(customer.lead_source || "");
  form.elements.notes.value = customer.notes || "";
  form.elements.relation_social.value = customer.relation_social || "";
  form.elements.relation_business.value = customer.relation_business || "";
  for (const section of ANALYSIS_SECTIONS) {
    if (section.field) form.elements[section.field].value = customer[section.field] || "";
    for (const sub of section.subs || []) form.elements[sub.field].value = customer[sub.field] || "";
  }
  const strategy = strategyFrom(customer);
  for (const slot of STRATEGY_SLOTS) {
    form.elements[`strategy_${slot.key}`].value = strategy[slot.key] || "";
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
const EXPORT_COLUMNS = [
  ["display_name", "姓名"],
  ["ref_code", "編號"],
  ["phone", "手機"],
  ["email", "電子信箱"],
  ["nickname", "暱稱"],
  ["gender", "性別"],
  ["birth_date", "生日"],
  ["birthday_md", "生日月日"],
  ["referrer", "介紹人"],
  ["contact_method", "聯絡方式"],
  ["preferred_contact", "偏好聯絡"],
  ["hobbies", "興趣/嗜好"],
  ["lead_source", "客戶來源"],
  ["relation_social", "社交關係"],
  ["relation_business", "商業關係"],
  ["service_tags", "服務標籤"],
  ["notes", "備註"],
  ["is_archived", "已封存"],
];

function exportValue(customer, key) {
  if (key === "service_tags") return (customer.service_tags || []).join("、");
  if (key === "is_archived") return customer.is_archived ? "是" : "否";
  if (key === "birth_date") return customer.birth_date ? String(customer.birth_date).slice(0, 10) : "";
  const value = customer[key];
  return value === null || value === undefined ? "" : String(value);
}

function clientWorkbookRows(customers, userId) {
  return (customers || []).filter((item) => item.owner_id === userId).map((customer) => {
    const strategy = strategyFrom(customer);
    const row = {};
    for (const [key, label] of EXPORT_COLUMNS) row[label] = exportValue(customer, key);
    for (const section of ANALYSIS_SECTIONS) {
      if (section.field) row[section.title] = customer[section.field] || "";
      for (const sub of section.subs || []) row[sub.label] = customer[sub.field] || "";
    }
    for (const slot of STRATEGY_SLOTS) row[slot.label] = strategy[slot.key] || "";
    return row;
  });
}

function loadSheetJs() {
  if (window.XLSX?.writeFile) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js";
    script.onload = () => (window.XLSX?.writeFile ? resolve(window.XLSX) : reject(new Error("Excel 沒有載入")));
    script.onerror = () => reject(new Error("Excel 沒有載入"));
    document.head.appendChild(script);
  });
}

function exportHeaders() {
  const headers = EXPORT_COLUMNS.map(([, label]) => label);
  for (const section of ANALYSIS_SECTIONS) {
    if (section.field) headers.push(section.title);
    for (const sub of section.subs || []) headers.push(sub.label);
  }
  for (const slot of STRATEGY_SLOTS) headers.push(slot.label);
  return headers;
}

async function exportClients() {
  const XLSX = await loadSheetJs();
  const headers = exportHeaders();
  const rows = clientWorkbookRows(await store.listCustomers(), clientFocusId());
  const sheet = XLSX.utils.aoa_to_sheet([
    headers,
    ...rows.map((row) => headers.map((header) => row[header] ?? "")),
  ]);
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "名單總覽");
  XLSX.writeFile(book, `名單總覽_${taipeiDay().replace(/-/g, "")}.xlsx`);
}

function showPng(blob, title, filename) {
  if (pngUrl) URL.revokeObjectURL(pngUrl);
  pngUrl = URL.createObjectURL(blob);
  $("pngSheetTitle").textContent = title;
  $("pngPreview").alt = title;
  $("pngPreview").src = pngUrl;
  $("pngDownload").href = pngUrl;
  $("pngDownload").download = filename;
  $("pngSheet").classList.add("show");
}

async function downloadAnalysis() {
  const draft = readForm($("customerForm"));
  const blob = await renderAnalysisPng(gridCells(draft), draft.display_name || "");
  showPng(blob, "客戶資料分析表", "客戶資料分析表.png");
}

function fitStrategyText(node) {
  if (!node || node.clientHeight < 8) return;
  let size = 15;
  node.style.fontSize = `${size}px`;
  while (size > 8 && node.scrollHeight > node.clientHeight + 1) {
    size -= 1;
    node.style.fontSize = `${size}px`;
  }
}

function paintStrategy() {
  const grid = strategyFrom(readForm($("customerForm")));
  for (const slot of STRATEGY_SLOTS) {
    const node = document.querySelector(`[data-strategy-text="${slot.key}"]`);
    if (!node) continue;
    node.textContent = grid[slot.key] || "";
    fitStrategyText(node);
  }
}

async function downloadStrategy() {
  const draft = readForm($("customerForm"));
  const blob = await renderStrategyPng(strategyFrom(draft), draft.display_name || "", isoDate().replace(/-/g, "/"));
  showPng(blob, "客戶策略分析圖", "客戶策略分析圖.png");
}

function nameButton(item) {
  return `<button class="name-line" type="button" data-action="open-client" data-id="${esc(item.id)}">${esc(item.display_name)}</button>`;
}

function clientFocusId() {
  const profile = me();
  if (!profile || profile.role !== "manager") return profile?.id || "";
  return clientFocus || profile.id;
}

function clientsAreEditable() {
  const profile = me();
  return Boolean(profile) && profile.role !== "admin" && clientFocusId() === profile.id;
}

function paintClientSwitch(profile, profiles) {
  const select = $("clientMember");
  const banner = $("clientReadonly");
  if (!select || !banner) return;
  const focus = clientFocusId();
  const viewing = profile?.role === "manager" && focus && focus !== profile.id;
  const partners = (profiles || [])
    .filter((person) => person.id !== profile?.id && person.is_active !== false && canViewPerson(profile, person))
    .sort((a, b) => String(a.display_name).localeCompare(String(b.display_name), "zh-Hant"));
  if (profile?.role === "manager") {
    const chosen = viewing && partners.some((person) => person.id === focus) ? focus : profile.id;
    if (chosen === profile.id) clientFocus = "";
    else clientFocus = chosen;
    select.innerHTML = [`<option value="${esc(profile.id)}">自己</option>`]
      .concat(partners.map((person) => `<option value="${esc(person.id)}">${esc(person.display_name)}</option>`))
      .join("");
    select.value = clientFocus || profile.id;
  }
  const name = profiles.find((person) => person.id === (clientFocus || focus))?.display_name || "夥伴";
  $("clientReadonlyText").textContent = viewing && clientFocus ? `正在查看 ${name} 的名單（唯讀）` : "";
  banner.hidden = !(viewing && clientFocus);
}

async function renderClients() {
  const profile = me();
  const [customers, profiles] = await Promise.all([
    store.listCustomers(),
    store.listProfiles(),
  ]);
  paintClientSwitch(profile, profiles);
  const focus = clientFocusId();
  const scoped = customers.filter((item) => item.owner_id === focus);
  const q = $("clientSearch").value.trim().toLowerCase();
  const showArchived = $("showArchived").checked;
  const list = scoped.filter((item) => {
    if (!showArchived && item.is_archived) return false;
    const blob = `${item.display_name} ${item.nickname || ""} ${item.ref_code || ""} ${(item.service_tags || []).join(" ")} ${item.notes || ""} ${item.hobbies || ""} ${item.lead_source || ""} ${item.contact_method || ""}`.toLowerCase();
    return blob.includes(q);
  }).sort((a, b) => String(a.display_name).localeCompare(String(b.display_name), "zh-Hant"));
  mountAnalysisFields();
  const owners = profiles.filter((person) => person.is_active !== false && canViewPerson(profile, person));
  const keepOwner = $("customerForm").elements.id.value ? $("customerOwner").value : profile.id;
  $("customerOwner").innerHTML = owners.map((item) =>
    `<option value="${esc(item.id)}">${esc(item.display_name)}</option>`).join("");
  $("customerOwner").value = owners.some((item) => item.id === keepOwner) ? keepOwner : profile.id;
  $("clientList").innerHTML = list.length
    ? list.map(nameButton).join("")
    : `<div class="empty">沒有符合的客戶。</div>`;
  const picks = dailyClientPick(customers, focus, taipeiDay(), 30);
  $("clientPicks").innerHTML = picks.length
    ? picks.map(nameButton).join("")
    : `<div class="empty">目前沒有客戶</div>`;
  clientCache = scoped;
  renderSourceChips(customers);
  paintAnalysis();
  syncClientPanes();
  if (!selectedCustomerId || !scoped.some((item) => item.id === selectedCustomerId)) {
    $("clientDetail").innerHTML = "";
    return;
  }
  await renderClientDetail(customers, profiles);
  syncClientPanes();
}

function syncClientPanes() {
  const editable = clientsAreEditable();
  if (!editable && clientTab === "new") clientTab = "list";
  const adding = clientTab === "new";
  const browsing = clientTab !== "new" && Boolean(selectedCustomerId);
  const addTab = document.querySelector('#clientTabs [data-client-tab="new"]');
  if (addTab) addTab.hidden = !editable;
  if ($("clientListPane")) $("clientListPane").hidden = clientTab !== "list";
  if ($("clientPickPane")) $("clientPickPane").hidden = clientTab !== "today";
  if ($("clientDetail")) $("clientDetail").hidden = !browsing;
  if ($("customerForm")) {
    $("customerForm").hidden = !adding && !browsing;
    $("customerForm").classList.toggle("locked", !editable);
  }
  document.querySelectorAll("#clientTabs [data-client-tab]").forEach((button) => {
    button.classList.toggle("on", button.dataset.clientTab === clientTab);
  });
}

function showClientTab(tab) {
  let next = tab === "today" ? "today" : tab === "new" ? "new" : "list";
  if (next === "new" && !clientsAreEditable()) next = "list";
  if (next !== clientTab) {
    selectedCustomerId = null;
    if ($("clientDetail")) $("clientDetail").innerHTML = "";
  }
  clientTab = next;
  if (clientTab === "new") resetCustomerForm();
  syncClientPanes();
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
  const canEdit = clientsAreEditable() && customer.owner_id === me().id;
  $("clientDetail").innerHTML = `<div class="panel" style="margin-top:12px">
    <div class="client-top"><div><h3>${esc(customer.display_name)}</h3><p class="sub">${esc([customer.ref_code, customer.nickname, customer.gender, rocLabel(customer.birth_date), customer.contact_method || customer.preferred_contact].filter(Boolean).join(" · "))} · 負責人 ${esc(nameOf(customer.owner_id, profiles))}</p></div>
    <div class="row">${canEdit ? `<button class="btn secondary small" type="button" data-action="edit-client" data-id="${esc(customer.id)}">編輯</button>` : ""}<button class="btn secondary small" type="button" data-action="jump-analysis">五項度</button>${canEdit ? `<button class="btn danger small" type="button" data-action="archive-client" data-id="${esc(customer.id)}" data-archived="${customer.is_archived ? "1" : "0"}">${customer.is_archived ? "取消封存" : "封存"}</button>` : ""}</div></div>
    <p>${esc(customer.notes || "還沒有備註。")}</p>
    ${customer.birthday_md ? `<p class="muted">生日月日 ${esc(customer.birthday_md)}（不含年份）</p>` : ""}
    <h3>保單摘要</h3>
    ${policies.map((item) => `<div class="list-item"><div><b>${esc(item.policy_category)}</b> ${esc(item.insurer_name || "")}<div class="muted">${esc(POLICY_STATUS[item.status] || item.status)} · 到期 ${formatDate(item.expiry_date)} · 續保提醒 ${formatDate(item.renewal_reminder_date)}${item.reference_last4 ? ` · 末四碼 ${esc(item.reference_last4)}` : ""}</div></div>${canEdit ? `<button class="btn secondary small" type="button" data-action="delete-policy" data-id="${esc(item.id)}">刪除</button>` : ""}</div>`).join("") || `<div class="empty">還沒有保單摘要。</div>`}
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
    ${records.map((item) => `<div class="list-item"><div><b>${formatDate(item.service_date)} · ${esc(item.service_type)}</b><div>${esc(item.summary)}</div><div class="muted">${esc(item.next_action || "")}${item.next_contact_date ? ` · 下次 ${formatDate(item.next_contact_date)}` : ""}</div></div>${canEdit ? `<button class="btn secondary small" type="button" data-action="delete-service" data-id="${esc(item.id)}">刪除</button>` : ""}</div>`).join("") || `<div class="empty">還沒有服務紀錄。</div>`}
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
    ${reminders.map((item) => `<div class="list-item"><div><b>${esc(KIND_LABEL[item.kind] || "提醒")}</b> ${esc(item.title)}<div class="muted">${formatDate(item.due_at)} · ${item.status === "open" ? "未完成" : item.status === "done" ? "已完成" : "已取消"}</div></div>${canEdit && item.status === "open" ? `<button class="btn secondary small" type="button" data-action="done-reminder" data-id="${esc(item.id)}">完成</button>` : ""}</div>`).join("") || `<div class="empty">這位客戶還沒有提醒。</div>`}
    ${canEdit ? `<form id="reminderForm" data-customer="${esc(customer.id)}" data-owner="${esc(customer.owner_id)}" class="form-grid cols-3" style="margin-top:10px">
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

function fillZoneSelect(select, custom) {
  if (!select) return;
  const current = select.value;
  const zones = [...new Set((select._zones || []).map((zone) => String(zone || "").trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "zh-Hant"));
  select.innerHTML = `${zones.map((zone) => `<option value="${esc(zone)}">${esc(zone)}</option>`).join("")}<option value="__new">＋輸入新區</option>`;
  if ([...select.options].some((option) => option.value === current)) select.value = current;
  if (custom) custom.hidden = select.value !== "__new";
}

function fillMemberZones(profiles) {
  const zones = (profiles || []).map((item) => item.zone);
  for (const [selectId, customId] of [["memberZone", "memberZoneCustom"], ["rosterZone", "rosterZoneCustom"]]) {
    const select = $(selectId);
    if (!select) continue;
    select._zones = zones;
    fillZoneSelect(select, $(customId));
  }
}

function roleForGrade(grade) {
  return grade === "CA" ? "member" : "manager";
}

async function renderMembers() {
  const profile = me();
  const profiles = await store.listProfiles();
  await loadActivity();
  const shown = profiles.filter((item) => item.is_active !== false || $("showRemovedMembers")?.checked);
  const changed = shown.filter((item) => item.must_change_password === false).length;
  const summary = `<p class="member-summary">已改 ${changed} / 未改 ${shown.length - changed}</p>`;
  const cards = shown.map((item) => {
    const changedPw = item.must_change_password === false;
    const account = item.account ? `帳號 ${item.account}` : "帳號 —";
    const grade = item.grade ? ` · ${item.grade}` : "";
    const email = item.email ? `<div class="muted">${esc(item.email)}</div>` : "";
    const signedIn = activityById.has(item.id) ? activityById.get(item.id) : item.last_sign_in_at;
    const controls = profile.role === "admin" && item.id !== profile.id && item.role !== "admin" && item.is_active !== false
      ? `<div class="member-actions"><select data-role-for="${esc(item.id)}">${["member", "manager", "admin"].map((role) => `<option value="${role}" ${item.role === role ? "selected" : ""}>${esc(ROLE_LABEL[role])} (${role})</option>`).join("")}</select><button class="btn secondary small" type="button" data-action="save-member" data-id="${esc(item.id)}">更新</button><button class="btn danger small" type="button" data-action="reset-password" data-id="${esc(item.id)}" data-name="${esc(item.display_name)}">重設密碼</button><button class="btn danger small" type="button" data-action="remove-member" data-id="${esc(item.id)}" data-name="${esc(item.display_name)}">刪除夥伴</button></div>`
      : "";
    return `<div class="list-item member-card"><div><b>${esc(item.display_name)}</b><div class="muted">${esc(account)}${esc(grade)} · ${esc(ROLE_LABEL[item.role] || item.role)}${item.is_active === false ? " · 已刪除" : ""}</div>${email}<div class="muted">上次登入 ${esc(formatLastSignIn(signedIn))}</div><span class="pw-badge ${changedPw ? "ok" : "wait"}">${changedPw ? "已改密碼" : "未改密碼"}</span></div>${controls}</div>`;
  }).join("");
  $("memberList").innerHTML = summary + (cards || `<div class="empty">還沒有成員。</div>`);
  fillMemberZones(profiles);
}

function resetCustomerForm() {
  $("customerForm").reset();
  $("customerForm").elements.id.value = "";
  $("birthPicker").value = "";
  setContactChips("");
  renderSourceChips();
  setLeadSource("");
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
      calCursor = target.dataset.date;
      calFocus = calCursor;
      calView = "day";
      await renderCalendar();
    }
    if (target.dataset.action === "cal-edit") {
      if (!canEditCalendar()) return;
      const item = calItems.find((row) => row.id === id && row.source === (target.dataset.source || row.source));
      openEventForm(item, item?.date || target.dataset.date);
    }
    if (target.dataset.action === "coverage-tab") {
      coverageView = target.dataset.tab === "policies" ? "policies" : "gaps";
      await renderClients();
    }
    if (target.dataset.action === "open-birthday") {
      clientTab = "list";
      selectedCustomerId = id;
      page = "clients";
      const url = new URL(location.href);
      url.searchParams.set("page", "clients");
      history.pushState({}, "", url);
      const customers = await store.listCustomers();
      const customer = customers.find((item) => item.id === id);
      await renderPage();
      if (customer) fillCustomerForm(customer);
      syncClientPanes();
      $("customerForm").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (target.dataset.action === "open-client") {
      coverageView = "gaps";
      if (clientTab === "new") clientTab = "list";
      selectedCustomerId = id;
      const customers = await store.listCustomers();
      const customer = customers.find((item) => item.id === id);
      if (customer) fillCustomerForm(customer);
      await renderClients();
      $("customerForm").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (target.dataset.action === "jump-analysis") {
      $("analysisBlock").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (target.dataset.action === "edit-cell") {
      if (!clientsAreEditable()) return;
      openCellSheet(target.dataset.cell);
    }
    if (target.dataset.action === "edit-client") {
      if (!clientsAreEditable()) return;
      const customers = await store.listCustomers();
      const customer = customers.find((item) => item.id === id);
      if (!customer) return;
      clientTab = "list";
      selectedCustomerId = id;
      fillCustomerForm(customer);
      syncClientPanes();
      $("customerForm").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (target.dataset.action === "archive-client") {
      if (!clientsAreEditable()) return;
      const customers = await store.listCustomers();
      const customer = customers.find((item) => item.id === id);
      if (!customer) return;
      await store.saveCustomer({ ...customer, is_archived: target.dataset.archived !== "1", service_tags: customer.service_tags || [] });
      toast(target.dataset.archived === "1" ? "已取消封存" : "已封存這位客戶");
      await renderClients();
    }
    if (target.dataset.action === "delete-policy") {
      if (!clientsAreEditable()) return;
      await store.deletePolicy(id);
      await renderClients();
    }
    if (target.dataset.action === "delete-service") {
      if (!clientsAreEditable()) return;
      await store.deleteServiceRecord(id);
      await renderClients();
    }
    if (target.dataset.action === "done-reminder") {
      if (!clientsAreEditable()) return;
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
    if (target.dataset.action === "reset-password") {
      const name = target.dataset.name || "這位夥伴";
      if (!window.confirm(`要把${name}的密碼重設成團隊預設密碼嗎？對方下次登入必須再改一次。`)) return;
      await store.resetMemberPassword(id);
      toast("已重設密碼，對方下次登入要再改一次");
      await renderMembers();
    }
    if (target.dataset.action === "remove-member") {
      const name = target.dataset.name || "這位夥伴";
      if (!window.confirm(`確定要刪除${name}嗎？這位夥伴會從名單消失，也不能再登入。客戶資料會留下。`)) return;
      await store.removeMember(id);
      toast("已刪除夥伴");
      await renderMembers();
      if (isAdmin()) await loadRoster();
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
    const clientTabButton = event.target.closest("[data-client-tab]");
    if (clientTabButton) {
      showClientTab(clientTabButton.dataset.clientTab);
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
  $("avatarBtn").onclick = () => $("avatarFile").click();
  $("avatarFile").addEventListener("change", onAvatarFile);
  $("avatarImage").addEventListener("error", () => {
    $("avatarImage").hidden = true;
    $("avatarLetter").hidden = false;
  });
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
  if ($("assetSearch")) $("assetSearch").addEventListener("input", () => renderAssets());
  $("clientSearch").addEventListener("input", () => renderClients());
  $("rosterSearch").addEventListener("input", () => {
    rosterQuery = $("rosterSearch").value;
    renderRoster();
  });
  $("rosterRanks").addEventListener("click", (event) => {
    const button = event.target.closest("[data-roster-rank]");
    if (!button) return;
    rosterRank = button.dataset.rosterRank;
    renderRoster();
  });
  $("showArchived").addEventListener("change", () => renderClients());
  $("previewRole").addEventListener("change", async () => {
    store.setPreviewRole($("previewRole").value);
    selectedCustomerId = null;
    clientFocus = "";
    calOwner = "";
    calView = "month";
    resetCustomerForm();
    if (page === "clients" && isAdmin()) page = "home";
    if (page === "roster" && !isAdmin()) page = "home";
    if (page === "announcements" && !canManageTeam(me().role)) page = "home";
    await renderPage();
  });
  $("signOutBtn").onclick = async () => {
    await store.signOut();
    show("loginView");
  };
  $("customerCancel").onclick = () => showClientTab("new");
  $("resetDemo").onclick = async () => {
    store.resetDemo();
    selectedCustomerId = null;
    calOwner = "";
    resetCustomerForm();
    toast("已回到最初的示範資料");
    await renderPage();
  };
  $("calPrev").onclick = () => {
    const cursor = calCursor || isoDate();
    calCursor = calView === "week" ? shiftWeek(cursor, -1) : calView === "day" ? addDays(cursor, -1) : shiftMonth(cursor, -1);
    renderCalendar();
  };
  $("calNext").onclick = () => {
    const cursor = calCursor || isoDate();
    calCursor = calView === "week" ? shiftWeek(cursor, 1) : calView === "day" ? addDays(cursor, 1) : shiftMonth(cursor, 1);
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
  $("clientMember").onchange = async () => {
    const chosen = $("clientMember").value;
    clientFocus = chosen && chosen !== me().id ? chosen : "";
    selectedCustomerId = null;
    if (clientTab === "new") clientTab = "list";
    resetCustomerForm();
    await renderClients();
  };
  $("clientBack").onclick = async () => {
    clientFocus = "";
    selectedCustomerId = null;
    clientTab = "list";
    resetCustomerForm();
    await renderClients();
  };
  $("calBack").onclick = () => {
    calOwner = "";
    renderCalendar();
  };
  $("calSheetClose").onclick = () => $("calSheet").classList.remove("show");
  $("calAdd").onclick = () => openEventForm(null, calView === "month" ? isoDate() : (calCursor || isoDate()));
  $("calNew").onclick = () => paintCalForm(null, calFocus || calCursor || isoDate());
  $("calAllDay").addEventListener("change", () => applyAllDay($("calAllDay").checked));
  $("calForm").elements.starts_at.addEventListener("change", keepEndAfterStart);
  $("calReminder").addEventListener("change", () => {
    $("calReminderHint").textContent = `提醒：${reminderLabel($("calReminder").value)}。這一版只記錄，不會推播。`;
  });
  $("calClientSearch").addEventListener("input", () => {
    $("calClient").value = "";
    paintClientList($("calClientSearch").value);
  });
  $("calClientList").addEventListener("click", (event) => {
    const button = event.target.closest("[data-client]");
    if (!button) return;
    $("calClient").value = button.dataset.client;
    $("calClientSearch").value = button.textContent;
    $("calClientList").innerHTML = "";
  });
  $("calTypes").addEventListener("click", (event) => {
    const button = event.target.closest("[data-type]");
    if (button) selectType(button.dataset.type);
  });
  $("calDelete").onclick = async () => {
    const form = $("calForm");
    const id = form.elements.id.value;
    if (!id) return;
    try {
      if (form.elements.source.value === "task") await store.deleteTask(id);
      else await store.deleteCalendarEvent(id);
      $("calSheet").classList.remove("show");
      toast("已刪除");
      await renderCalendar();
    } catch (error) { toast(error.message); }
  };
  $("calForm").addEventListener("submit", onCalendar);
  $("forceDemoFromBlock").onclick = () => {
    forceDemoMode();
    location.reload();
  };
  $("loginForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    $("loginError").textContent = "";
    const password = $("loginPassword").value;
    try {
      await store.signIn($("loginAccount").value, password);
      signedInPassword = password;
      await afterLogin();
    } catch (error) {
      $("loginError").textContent = error.message || "帳號或密碼錯誤";
    }
  });
  $("changePasswordBtn").onclick = () => openPassword(false);
  $("passwordCancel").onclick = () => {
    if (passwordFirst) return;
    show("app");
  };
  $("passwordForm").addEventListener("submit", onPassword);

  if ($("assetForm")) $("assetForm").addEventListener("submit", onAsset);
  if ($("courseForm")) $("courseForm").addEventListener("submit", onCourse);
  $("customerForm").addEventListener("submit", onCustomer);
  $("exportClients").onclick = () => exportClients().catch((error) => toast(error.message || "Excel 沒有下載"));
  $("contactChips").addEventListener("click", (event) => {
    const button = event.target.closest("[data-contact]");
    if (!button) return;
    button.classList.toggle("on");
    syncContactMethod();
  });
  $("sourceChips").addEventListener("click", (event) => {
    if (event.target.closest("#sourceAdd")) {
      $("sourceCustom").hidden = false;
      $("sourceCustom").focus();
      return;
    }
    const button = event.target.closest("[data-source]");
    if (!button) return;
    const on = button.classList.contains("on");
    document.querySelectorAll("#sourceChips [data-source]").forEach((item) => item.classList.remove("on"));
    $("sourceChips").dataset.legacy = "";
    $("sourceLegacy").hidden = true;
    if (!on) button.classList.add("on");
    syncLeadSource();
  });
  $("sourceCustom").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      commitCustomSource();
    }
  });
  $("sourceCustom").addEventListener("change", commitCustomSource);
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
  $("strategyDownload").onclick = () => downloadStrategy().catch((error) => toast(error.message));
  $("gridFullDownload").onclick = () => downloadAnalysis().catch((error) => toast(error.message));
  $("pngClose").onclick = () => $("pngSheet").classList.remove("show");
  $("announcementForm").addEventListener("submit", onAnnouncement);
  $("memberAddToggle").onclick = () => {
    $("memberCreateForm").hidden = !$("memberCreateForm").hidden;
  };
  for (const [gradeId, roleId, zoneId, customId] of [
    ["memberGrade", "memberRole", "memberZone", "memberZoneCustom"],
    ["rosterGrade", "rosterRole", "rosterZone", "rosterZoneCustom"],
  ]) {
    $(gradeId).addEventListener("change", () => {
      $(roleId).value = roleForGrade($(gradeId).value);
    });
    $(zoneId).addEventListener("change", () => {
      const custom = $(customId);
      custom.hidden = $(zoneId).value !== "__new";
      custom.required = !custom.hidden;
    });
  }
  $("rosterAddToggle").onclick = () => {
    $("rosterCreateForm").hidden = !$("rosterCreateForm").hidden;
  };
  $("rosterCreateForm").addEventListener("submit", onCreateMember);
  $("showRemovedMembers").addEventListener("change", () => renderMembers());
  $("memberCreateForm").addEventListener("submit", onCreateMember);
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
  data.all_day = form.elements.all_day.checked;
  const nextVisit = form.elements.next_visit.checked;
  try {
    if (data.source === "task") {
      await store.saveTask({ id: data.id, title: data.title, due_date: data.event_date, is_done: data.is_done });
      calCursor = data.event_date || calCursor;
      $("calSheet").classList.remove("show");
    } else {
      const saved = await store.saveCalendarEvent({
        id: data.id || null,
        title: data.title,
        event_type: data.event_type,
        customer_id: data.customer_id,
        companion_id: data.companion_id,
        all_day: data.all_day,
        starts_at: data.starts_at,
        ends_at: data.ends_at,
        reminder: data.reminder,
        note: data.note,
        is_done: data.is_done,
      });
      calCursor = saved.event_date || String(data.starts_at).slice(0, 10);
      calView = "day";
      if (nextVisit && data.customer_id) {
        toast("已儲存。接著安排下次約訪。");
        await renderCalendar();
        openEventForm(null, addDays(calCursor, 1), { title: "下次約訪", event_type: "visit", customer_id: data.customer_id });
        return;
      }
      $("calSheet").classList.remove("show");
    }
    toast("已存進行事曆");
    await renderCalendar();
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
  if (!clientsAreEditable()) return;
  const data = readForm(event.target);
  try {
    const adding = clientTab === "new";
    const existing = !adding && data.id ? (await store.listCustomers()).find((item) => item.id === data.id) : null;
    const saved = await store.saveCustomer({
      ...data,
      id: adding ? null : (data.id || null),
      is_archived: Boolean(existing?.is_archived),
      owner_id: me().id,
      email: existing?.email || "",
      preferred_contact: existing?.preferred_contact || "",
      service_tags: existing?.service_tags || [],
      birth_date: null,
      birthday_md: String(data.birth_roc || "").trim() ? null : (data.birthday_md_keep || null),
    });
    const message = saved.strategy_pending ? "名單已儲存。策略分析圖要等資料欄位加上後才會留在雲端。" : "名單已儲存";
    if (adding) {
      selectedCustomerId = null;
      resetCustomerForm();
      toast(message);
      await renderClients();
      return;
    }
    selectedCustomerId = saved.id;
    clientTab = "list";
    fillCustomerForm(saved);
    toast(message);
    await renderClients();
  } catch (error) { toast(error.message); }
}

async function onPolicy(event) {
  event.preventDefault();
  if (!clientsAreEditable()) return;
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
  if (!clientsAreEditable()) return;
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
  if (!clientsAreEditable()) return;
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

async function onCreateMember(event) {
  event.preventDefault();
  const data = readForm(event.target);
  const zone = data.zone === "__new" ? String(data.zone_custom || "").trim() : String(data.zone || "").trim();
  if (!zone) return toast("請填區");
  try {
    await store.createMember({
      display_name: data.display_name,
      account: data.account,
      grade: data.grade,
      zone,
      role: data.role || roleForGrade(data.grade),
    });
    event.target.reset();
    const grade = event.target.querySelector("[name=grade]");
    const role = event.target.querySelector("[name=role]");
    if (grade && role) role.value = roleForGrade(grade.value);
    toast("已新增夥伴");
    await renderMembers();
    if (isAdmin()) await loadRoster();
  } catch (error) { toast(error.message); }
}

function enterApp() {
  show("app");
  const requested = new URLSearchParams(location.search).get("page") || "home";
  page = PAGE_NAMES[requested] ? requested : "home";
  renderPage();
}

function openPassword(first) {
  passwordFirst = Boolean(first);
  $("passwordTitle").textContent = first ? "第一次登入，請設定新密碼" : "修改密碼";
  $("passwordHint").textContent = first
    ? "新密碼至少 8 個字元，而且要和現在的不一樣。"
    : "輸入目前密碼，再設定一組至少 8 個字元的新密碼。";
  $("passwordCancel").hidden = Boolean(first);
  $("passwordError").textContent = "";
  $("passwordForm").reset();
  show("passwordView");
}

async function afterLogin() {
  if (store.profile?.must_change_password) {
    openPassword(true);
    return;
  }
  enterApp();
}

function passwordProblem(current, next, confirm) {
  if (next.length < 8) return "新密碼至少 8 個字元。";
  if (next !== confirm) return "兩次輸入的新密碼不相同。";
  const previous = current || signedInPassword;
  if (previous && next === previous) return "新密碼不能和現在的相同。";
  return "";
}

async function onPassword(event) {
  event.preventDefault();
  const current = $("currentPassword").value;
  const next = $("nextPassword").value;
  const confirm = $("confirmPassword").value;
  const problem = passwordProblem(current, next, confirm);
  $("passwordError").textContent = problem;
  if (problem) return;
  try {
    if (store.mode === "demo") {
      toast("示範模式不會更改密碼");
      show("app");
      return;
    }
    await store.updatePassword(next);
    if (passwordFirst) await store.markPasswordChanged();
    signedInPassword = next;
    toast("密碼已更新");
    enterApp();
  } catch (error) {
    $("passwordError").textContent = error.message;
  }
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
  if (store.mode === "cloud" && !store.profile) {
    show("loginView");
    return;
  }
  if (store.mode === "cloud" && store.profile.must_change_password) {
    openPassword(true);
    return;
  }
  enterApp();
}

main();
