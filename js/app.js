import { openStore, forceDemoMode } from "./store.js";
import {
  COVERAGE_AREAS,
  CONNECTION_LABEL,
  KIND_LABEL,
  POLICY_CATEGORIES,
  POLICY_STATUS,
  ROLE_LABEL,
  SERVICE_TYPES,
  SOURCE_LABEL,
  addDays,
  canManageTeam,
  esc,
  formatDate,
  formatNet,
  formatRate,
  growth,
  isBirthdayMd,
  isHttpsUrl,
  isLast4,
  isoDate,
  normalizeFollowers,
  normalizeStory,
  weekStart,
} from "./metrics.js";

const PAGE_ALIAS = { assets: "learn", members: "announcements" };
const PAGE_NAMES = {
  home: "總覽",
  clients: "名單",
  tasks: "行程",
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
let modalOriginal = "";
let toastTimer = 0;

function toast(message) {
  const el = $("toast");
  el.textContent = message;
  el.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("show"), 2800);
}

function show(id) {
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

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

function openModal(title, text) {
  modalOriginal = text;
  $("modalTitle").textContent = title;
  $("modalText").value = text;
  $("modal").classList.add("show");
}

function readForm(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function tagsFrom(value) {
  return String(value || "").split(/[、,，]/).map((item) => item.trim()).filter(Boolean);
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
  if (page === "tasks") await renderTasks();
  if (page === "clients") await renderClients();
  if (page === "social") await renderSocial();
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

function upcomingItems(tasks, reminders, profile, today, days) {
  const end = addDays(today, days);
  const rows = [];
  reminders
    .filter((item) => item.status === "open" && (profile.role === "admin" || item.owner_id === profile.id))
    .forEach((item) => rows.push({ date: String(item.due_at).slice(0, 10), title: item.title, kind: KIND_LABEL[item.kind] || "提醒" }));
  tasks
    .filter((item) => !item.is_done && item.due_date && (profile.role === "admin" || item.owner_id === profile.id))
    .forEach((item) => rows.push({ date: item.due_date, title: item.title, kind: "任務" }));
  return rows.filter((item) => item.date >= today && item.date <= end).sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, "zh-Hant"));
}

function podiumHtml(title, note, ranked) {
  const slots = [
    { place: "第二", person: ranked[1] },
    { place: "領先", person: ranked[0] },
    { place: "第三", person: ranked[2] },
  ];
  return `<section class="slide"><div class="slide-head"><b>${esc(title)}</b><span>${esc(note)}</span></div><div class="podium">${slots.map(({ place, person }) => `
    <div class="podium-col ${place === "領先" ? "first" : ""}">
      <div class="rank-label">${place}</div>
      <div class="ava">${esc(person ? person.name.slice(0, 1) : "—")}</div>
      <b>${esc(person?.name || "—")}</b>
      <strong>${esc(person?.score || "—")}</strong>
      <small>${esc(person?.sub || "")}</small>
    </div>`).join("")}</div></section>`;
}

async function renderHome() {
  const profile = me();
  const [tasks, reminders, announcements, customers, accounts, stories, posts, snapshots, profiles, records] = await Promise.all([
    store.listTasks(),
    store.listReminders(),
    store.listAnnouncements(),
    store.listCustomers(),
    store.listSocialAccounts(),
    store.listStories(),
    store.listPosts(),
    store.listSnapshots(),
    store.listProfiles(),
    store.listServiceRecords(),
  ]);
  const today = isoDate();
  const start = weekStart(today);
  const since = addDays(today, -7);
  const mine = accounts.find((item) => item.owner_id === profile.id);
  const reportedToday = stories.some((item) => item.owner_id === profile.id && item.story_date === today);
  const agenda = upcomingItems(tasks, reminders, profile, today, 14);
  const nearest = agenda[0];
  let advice = "這幾天沒有到期的提醒。按自己的拜訪節奏進行即可。";
  if (nearest) advice = `近期有一件事：${nearest.title}，${formatDate(nearest.date)} 前處理即可。`;
  else if (mine && !reportedToday) advice = "今天的限動還沒回報。記一筆就好，未回報不會被看成沒有發。";
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
  const growthRank = accounts.map((account) => {
    const result = accountGrowth(snapshots, account.id);
    return { name: nameOf(account.owner_id, profiles), score: formatNet(result.net), sub: "粉絲淨增", net: result.net ?? -999999 };
  }).sort((a, b) => b.net - a.net);
  const storyRank = accounts.map((account) => {
    const days = new Set(stories.filter((item) => item.account_id === account.id && item.posted && item.story_date >= start && item.story_date <= today).map((item) => item.story_date)).size;
    return { name: nameOf(account.owner_id, profiles), score: `${days} 天`, sub: "本週有發限動", net: days };
  }).sort((a, b) => b.net - a.net);
  $("podium").innerHTML = `<div class="carousel-track" id="podiumTrack">${podiumHtml("粉絲成長", "相較前一筆快照", growthRank)}${podiumHtml("限動回報", "本週有發布的天數", storyRank)}</div><div class="dots" id="podiumDots"><button type="button" class="on" data-slide="0" aria-label="粉絲成長"></button><button type="button" data-slide="1" aria-label="限動回報"></button></div>`;
  const track = $("podiumTrack");
  track.onscroll = () => {
    const index = Math.round(track.scrollLeft / Math.max(track.clientWidth, 1));
    document.querySelectorAll("#podiumDots button").forEach((dot, i) => dot.classList.toggle("on", i === index));
  };
  const visibleNews = announcements.filter((item) => item.published_at).slice(0, 3);
  $("homeNotices").innerHTML = visibleNews.map((item) =>
    `<div class="notice"><b>${esc(item.title)}</b><small>${esc(item.body)}</small></div>`).join("")
    || `<div class="empty">目前沒有公告。</div>`;
  $("secretaryBody").innerHTML = `<p>${esc(advice)}</p><div class="row"><button class="btn secondary small" type="button" data-nav="tasks">看行程</button><button class="btn secondary small" type="button" data-nav="social">去回報</button><button class="btn secondary small" type="button" data-nav="ai">找工作指令</button></div>`;
  void posts;
}

async function refreshDot() {
  const reminders = await store.listReminders();
  const today = isoDate();
  const soon = reminders.some((item) => item.status === "open" && item.owner_id === me()?.id && String(item.due_at).slice(0, 10) <= addDays(today, 7));
  $("avatarDot").hidden = !soon;
}

function weekNetTotal(accounts, snapshots, today) {
  const start = weekStart(today);
  let total = 0;
  let any = false;
  for (const account of accounts) {
    const rows = snapshots.filter((item) => item.account_id === account.id).sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
    const latest = [...rows].reverse().find((item) => item.snapshot_date >= start && item.snapshot_date <= today);
    if (!latest) continue;
    const prev = [...rows].reverse().find((item) => item.snapshot_date < latest.snapshot_date);
    if (!prev) continue;
    total += latest.follower_count - prev.follower_count;
    any = true;
  }
  return any ? total : null;
}

async function renderTools() {
  const q = $("toolSearch").value.trim().toLowerCase();
  const tools = (await store.listTools()).filter((item) =>
    `${item.title} ${item.category || ""} ${item.prompt}`.toLowerCase().includes(q));
  $("toolList").innerHTML = tools.map((item) =>
    `<article class="tool-card"><h3>${esc(item.title)}</h3><p>${esc(item.prompt)}</p><div class="tag-row"><button class="tag-outline" type="button" data-action="open-tool" data-id="${esc(item.id)}">${esc(item.category || "一般")}</button></div></article>`).join("")
    || `<div class="empty">找不到符合的工具。</div>`;
  $("toolList").dataset.tools = JSON.stringify(tools.map((item) => ({ id: item.id, title: item.title, prompt: item.prompt })));
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

async function renderTasks() {
  const profile = me();
  const tasks = await store.listTasks();
  const visible = profile.role === "admin" ? tasks : tasks.filter((item) => item.owner_id === profile.id);
  const profiles = profile.role === "admin" ? await store.listProfiles() : [profile];
  const pending = visible.filter((item) => !item.is_done).length;
  const reminders = await store.listReminders();
  const agenda = upcomingItems(visible, reminders, profile, isoDate(), 14);
  $("scheduleBoard").innerHTML = agenda.length ? agenda.map((item) =>
    `<div class="schedule-item"><span>${esc(item.title)}</span><small class="muted">${esc(item.kind)} ${formatDate(item.date)}</small></div>`).join("")
    : `<div class="schedule-empty">（此區間沒有行程）</div>`;
  $("taskSummary").textContent = `共 ${visible.length} 項，待完成 ${pending} 項，已完成 ${visible.length - pending} 項`;
  $("taskList").innerHTML = visible.map((item) =>
    `<div class="list-item ${item.is_done ? "done" : ""}"><label class="task-line"><input type="checkbox" data-action="toggle-task" data-id="${esc(item.id)}" ${item.is_done ? "checked" : ""}><span>${esc(item.title)}${profile.role === "admin" && item.owner_id !== profile.id ? `（${esc(nameOf(item.owner_id, profiles))}）` : ""}</span></label><span class="muted">${formatDate(item.due_date)}</span><button class="btn secondary small" type="button" data-action="delete-task" data-id="${esc(item.id)}">刪除</button></div>`).join("")
    || `<div class="empty">目前沒有任務。先加一件今天想完成的事。</div>`;
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
    const blob = `${item.display_name} ${item.ref_code || ""} ${(item.service_tags || []).join(" ")} ${item.notes || ""}`.toLowerCase();
    return blob.includes(q);
  });
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
        <circle cx="40" cy="40" r="32" fill="none" stroke="#d5dee8" stroke-width="8"></circle>
        <circle cx="40" cy="40" r="32" fill="none" stroke="#b0894f" stroke-width="8" stroke-linecap="round" stroke-dasharray="${ring.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}" transform="rotate(-90 40 40)"></circle>
        <text x="40" y="46" text-anchor="middle" font-size="16" fill="#4e5b67">${ratio}%</text>
      </svg>
      <div>
        <div class="ring-label">保障完整度</div>
        <div class="ring-label"><b>${policies.filter((item) => item.status === "active").length} 張保單</b>涵蓋 ${coveredCount} / ${areas.length} 類</div>
        <div class="pills">
          <button type="button" data-action="coverage-tab" data-tab="policies">紀錄</button>
          <button type="button" data-action="coverage-tab" data-tab="gaps">缺口</button>
          <button type="button" data-nav="ai">指令</button>
        </div>
      </div>
    </div>
    <div class="seg">
      <button type="button" data-action="coverage-tab" data-tab="policies" class="${coverageView === "policies" ? "on" : ""}">保單</button>
      <button type="button" data-action="coverage-tab" data-tab="gaps" class="${coverageView === "gaps" ? "on" : ""}">缺口</button>
    </div>
    ${coverageView === "gaps" ? `<div class="section-head"><h2>保障檢視</h2></div><div class="gap-grid">${areas.map((area) => `<div class="neo-tile ${area.covered ? "ok" : "gap"}"><span class="sym">${area.covered ? "●" : "○"}</span><b>${esc(area.label)}</b><small>${area.covered ? "已涵蓋" : "缺口"}</small></div>`).join("")}</div><p class="muted">依這位客戶的保單摘要歸類，不是完整需求分析。</p>` : ""}
  </section>`;
  $("clientDetail").innerHTML = `${coverageHtml}<div class="panel" style="margin-top:12px" ${coverageView === "gaps" ? "hidden" : ""}>
    <div class="client-top"><div><h3>${esc(customer.display_name)}</h3><p class="sub">${esc(customer.ref_code || "")} · 負責人 ${esc(nameOf(customer.owner_id, profiles))} · ${esc(customer.preferred_contact || "未填聯絡偏好")}</p></div>
    <div class="row">${canEdit ? `<button class="btn secondary small" type="button" data-action="edit-client" data-id="${esc(customer.id)}">編輯</button>` : ""}${canEdit ? `<button class="btn danger small" type="button" data-action="archive-client" data-id="${esc(customer.id)}" data-archived="${customer.is_archived ? "1" : "0"}">${customer.is_archived ? "取消封存" : "封存"}</button>` : ""}</div></div>
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

function storyLabel(log) {
  if (!log) return { text: "未回報", cls: "miss" };
  if (log.posted) return { text: "已發布", cls: "yes" };
  return { text: "未發布", cls: "no" };
}

async function renderSocial() {
  const profile = me();
  const today = isoDate();
  const start = weekStart(today);
  const [accounts, snapshots, stories, posts, profiles] = await Promise.all([
    store.listSocialAccounts(),
    store.listSnapshots(),
    store.listStories(),
    store.listPosts(),
    store.listProfiles(),
  ]);
  const mine = accounts.find((item) => item.owner_id === profile.id);
  const weekPosts = posts.filter((item) => {
    const day = String(item.published_at).slice(0, 10);
    return day >= start && day <= today;
  });
  const reportedOwners = new Set(stories.filter((item) => item.story_date >= start && item.story_date <= today).map((item) => item.owner_id));
  const myStoryDays = new Set(stories.filter((item) => item.owner_id === profile.id && item.posted && item.story_date >= start && item.story_date <= today).map((item) => item.story_date)).size;
  const weekNet = weekNetTotal(accounts, snapshots, today);
  const cards = canManageTeam(profile.role)
    ? [
      ["追蹤帳號", accounts.length, "同團隊"],
      ["本週限動回報", `${reportedOwners.size}/${accounts.length || 0}`, "未回報≠未發布"],
      ["本週貼文／Reels", weekPosts.length, `貼文 ${weekPosts.filter((item) => item.content_type === "post").length}・Reels ${weekPosts.filter((item) => item.content_type === "reel").length}`],
      ["本週粉絲淨增", formatNet(weekNet), "有本週快照才計入"],
    ]
    : [
      ["我的粉絲", mine ? (snapshots.filter((item) => item.account_id === mine.id).sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)).at(-1)?.follower_count ?? "—") : "—", mine ? `@${mine.instagram_username}` : "尚未建立帳號"],
      ["本週限動天數", myStoryDays, "有發布的日子"],
      ["本週貼文／Reels", weekPosts.filter((item) => item.owner_id === profile.id).length, "只算自己的紀錄"],
      ["粉絲淨增", formatNet(accountGrowth(snapshots, mine?.id).net), "相較前一筆"],
    ];
  $("socialStats").innerHTML = cards.map(([label, value, hint]) =>
    `<div class="card"><small>${esc(label)}</small><strong>${esc(value)}</strong><em>${esc(hint)}</em></div>`).join("");

  const ranks = accounts.map((account) => {
    const g = accountGrowth(snapshots, account.id);
    return { account, ...g, name: nameOf(account.owner_id, profiles) };
  }).sort((a, b) => (b.net ?? -999999) - (a.net ?? -999999));
  const rankRows = ranks.map((item) => {
    const cls = item.net > 0 ? "growth" : item.net < 0 ? "down" : "";
    const status = item.account.connection_status === "expired" ? "需重新授權" : (CONNECTION_LABEL[item.account.connection_status] || "手動回報");
    const count = item.latest == null ? "—" : Number(item.latest).toLocaleString("zh-TW");
    return { item, cls, status, count };
  });
  $("socialRank").innerHTML = rankRows.length ? `<div class="stack cards-only">${rankRows.map(({ item, cls, status, count }) =>
    `<article class="card"><div class="client-top"><div><b>${esc(item.name)}</b><div class="muted">@${esc(item.account.instagram_username)}</div></div><strong>${count}</strong></div><div class="${cls}">${formatNet(item.net)} · ${formatRate(item.rate)}</div><div class="muted">${esc(SOURCE_LABEL[item.source] || "—")} · ${esc(status)}</div></article>`).join("")}</div>
    <div class="table-only"><table><thead><tr><th>夥伴</th><th>帳號</th><th>粉絲</th><th>增減</th><th>成長率</th><th>來源</th><th>授權</th></tr></thead><tbody>${rankRows.map(({ item, cls, status, count }) =>
      `<tr><td><b>${esc(item.name)}</b></td><td>@${esc(item.account.instagram_username)}</td><td>${count}</td><td class="${cls}">${formatNet(item.net)}</td><td>${formatRate(item.rate)}</td><td>${esc(SOURCE_LABEL[item.source] || "—")}</td><td>${esc(status)}</td></tr>`).join("")}</tbody></table></div>`
    : `<div class="empty">還沒有 IG 帳號。</div>`;

  const days = ["一", "二", "三", "四", "五", "六", "日"];
  $("storyWeek").innerHTML = days.map((label, index) => {
    const date = addDays(start, index);
    if (date > today) return `<div class="day">${label}<b>·</b></div>`;
    const log = stories.find((item) => item.owner_id === profile.id && item.story_date === date);
    const state = storyLabel(log);
    return `<div class="day ${state.cls}">${label}<b>${esc(state.text === "已發布" ? "✓" : state.text === "未發布" ? "○" : "—")}</b></div>`;
  }).join("");

  if (mine) {
    $("accountForm").elements.instagram_username.value = mine.instagram_username;
    $("accountForm").elements.account_type.value = mine.account_type;
    $("accountForm").elements.profile_url.value = mine.profile_url || "";
    const status = mine.connection_status === "expired"
      ? "這個帳號顯示為需重新授權。手動回報仍可使用，不用把密碼交給任何人。"
      : `目前以${CONNECTION_LABEL[mine.connection_status] || "手動回報"}記錄。官方自動同步還沒有開啟。`;
    $("accountStatus").textContent = status;
  } else {
    $("accountStatus").textContent = "先留下帳號名稱即可開始回報。不要填密碼。";
  }

  if (canManageTeam(profile.role)) {
    const rows = accounts.map((account) => {
      const todayLog = stories.find((item) => item.account_id === account.id && item.story_date === today);
      const state = storyLabel(todayLog);
      const active = new Set(stories.filter((item) => item.account_id === account.id && item.posted && item.story_date >= start && item.story_date <= today).map((item) => item.story_date)).size;
      return `<tr><td>${esc(nameOf(account.owner_id, profiles))}</td><td class="${state.cls === "yes" ? "growth" : ""}">${esc(state.text)}</td><td>${active} 天</td></tr>`;
    }).join("");
    $("teamStories").innerHTML = `<h3>本週團隊限動</h3><p class="sub">分開看「未回報」、「已回報但沒發」、「已發布」。</p><div class="table-wrap"><table><thead><tr><th>夥伴</th><th>今天</th><th>本週有發的天數</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  } else {
    $("teamStories").innerHTML = "";
  }

  const visiblePosts = posts.filter((item) => canManageTeam(profile.role) || item.owner_id === profile.id).slice(0, 30);
  $("postList").innerHTML = `<table><thead><tr><th>日期</th><th>夥伴</th><th>類型</th><th>連結</th><th></th></tr></thead><tbody>${
    visiblePosts.map((item) => {
      const link = item.permalink && isHttpsUrl(item.permalink) ? `<a href="${esc(item.permalink)}" target="_blank" rel="noopener">開啟</a>` : "—";
      const del = item.owner_id === profile.id ? `<button class="btn secondary small" type="button" data-action="delete-post" data-id="${esc(item.id)}">刪除</button>` : "";
      return `<tr><td>${formatDate(item.published_at)}</td><td>${esc(nameOf(item.owner_id, profiles))}</td><td>${item.content_type === "reel" ? "Reels" : "一般貼文"}</td><td>${link}</td><td>${del}</td></tr>`;
    }).join("") || `<tr><td colspan="5" class="empty">還沒有發布紀錄。</td></tr>`
  }</tbody></table>`;

  const scopePosts = canManageTeam(profile.role) ? weekPosts : weekPosts.filter((item) => item.owner_id === profile.id);
  const postCount = scopePosts.filter((item) => item.content_type === "post").length;
  const reelCount = scopePosts.filter((item) => item.content_type === "reel").length;
  const people = canManageTeam(profile.role) ? Math.max(accounts.length, 1) : 1;
  $("socialGoals").textContent = `建議起步（不是業績標準）：每週貼文 2、Reels 1、限動 5 天。${canManageTeam(profile.role) ? "團隊目前" : "你目前"}貼文 ${postCount}/${people * 2}、Reels ${reelCount}/${people}、你的限動 ${myStoryDays}/5。內容有沒有幫助客戶，比粉絲數更重要。`;
}

function accountGrowth(snapshots, accountId) {
  if (!accountId) return { latest: null, net: null, rate: null, source: null };
  const rows = snapshots.filter((item) => item.account_id === accountId).sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date));
  const latestRow = rows.at(-1);
  const prevRow = rows.length > 1 ? rows.at(-2) : null;
  const result = growth(latestRow?.follower_count ?? null, prevRow?.follower_count ?? null);
  return { latest: latestRow?.follower_count ?? null, source: latestRow?.source || null, ...result };
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
  $("customerFormTitle").textContent = "新增客戶";
  $("customerCancel").hidden = true;
  if (me()) $("customerOwner").value = me().id;
}

async function handleAction(event) {
  const target = event.target.closest("[data-action]");
  if (!target) return;
  const id = target.dataset.id;
  try {
    if (target.dataset.action === "open-tool") {
      const tools = JSON.parse($("toolList").dataset.tools || "[]");
      const tool = tools.find((item) => item.id === id);
      if (tool) openModal(tool.title, tool.prompt);
    }
    if (target.dataset.action === "asset-demo") toast("這是素材入口示範。正式版請貼上團隊核准的 https 連結。");
    if (target.dataset.action === "toggle-course") {
      await store.setCourseComplete(id, target.dataset.done !== "1");
      await renderLearn();
    }
    if (target.dataset.action === "toggle-task") {
      const tasks = await store.listTasks();
      const task = tasks.find((item) => item.id === id);
      if (task) await store.saveTask({ id, title: task.title, is_done: target.checked });
      await renderTasks();
    }
    if (target.dataset.action === "delete-task") {
      await store.deleteTask(id);
      await renderTasks();
    }
    if (target.dataset.action === "coverage-tab") {
      coverageView = target.dataset.tab === "policies" ? "policies" : "gaps";
      await renderClients();
    }
    if (target.dataset.action === "open-client") {
      coverageView = "gaps";
      selectedCustomerId = id;
      await renderClients();
      $("clientDetail").scrollIntoView({ behavior: "smooth", block: "start" });
    }
    if (target.dataset.action === "edit-client") {
      const customers = await store.listCustomers();
      const customer = customers.find((item) => item.id === id);
      if (!customer) return;
      const form = $("customerForm");
      form.elements.id.value = customer.id;
      form.elements.display_name.value = customer.display_name;
      form.elements.phone.value = customer.phone || "";
      form.elements.email.value = customer.email || "";
      form.elements.preferred_contact.value = customer.preferred_contact || "LINE";
      form.elements.birthday_md.value = customer.birthday_md || "";
      form.elements.service_tags.value = (customer.service_tags || []).join("、");
      form.elements.notes.value = customer.notes || "";
      $("customerOwner").value = customer.owner_id;
      $("customerFormTitle").textContent = "編輯客戶";
      $("customerCancel").hidden = false;
      form.scrollIntoView({ behavior: "smooth", block: "start" });
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
    if (target.dataset.action === "delete-post") {
      await store.deletePost(id);
      await renderSocial();
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
    const slide = event.target.closest("[data-slide]");
    if (slide && $("podiumTrack")) {
      $("podiumTrack").scrollTo({ left: Number(slide.dataset.slide) * $("podiumTrack").clientWidth, behavior: "smooth" });
    }
    const cat = event.target.closest("[data-cat]");
    if (cat) {
      assetCat = cat.dataset.cat;
      renderAssets();
    }
  });
  document.body.addEventListener("click", (event) => {
    if (event.target.closest("[data-action='toggle-task']")) return;
    handleAction(event);
  });
  document.body.addEventListener("change", (event) => {
    if (event.target.matches("[data-action='toggle-task']")) handleAction(event);
  });
  $("menuBtn").onclick = () => ($("drawer").classList.contains("open") ? closeMenu() : openMenu());
  $("avatarBtn").onclick = () => ($("drawer").classList.contains("open") ? closeMenu() : openMenu());
  $("backdrop").onclick = closeMenu;
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      closeMenu();
      $("secretary").hidden = true;
      $("modal").classList.remove("show");
    }
  });
  $("secretaryBtn").onclick = () => { $("secretary").hidden = false; };
  $("secretaryClose").onclick = () => { $("secretary").hidden = true; };
  $("toolSearch").addEventListener("input", () => renderTools());
  $("assetSearch").addEventListener("input", () => renderAssets());
  $("clientSearch").addEventListener("input", () => renderClients());
  $("showArchived").addEventListener("change", () => renderClients());
  $("previewRole").addEventListener("change", async () => {
    store.setPreviewRole($("previewRole").value);
    selectedCustomerId = null;
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
    resetCustomerForm();
    toast("已回到最初的示範資料");
    await renderPage();
  };
  $("clearDone").onclick = async () => {
    const tasks = await store.listTasks();
    for (const task of tasks) {
      if (task.is_done && task.owner_id === me().id) await store.deleteTask(task.id);
    }
    await renderTasks();
  };
  $("modalClose").onclick = () => $("modal").classList.remove("show");
  $("modal").onclick = (event) => { if (event.target === $("modal")) $("modal").classList.remove("show"); };
  $("modalReset").onclick = () => { $("modalText").value = modalOriginal; };
  $("modalCopy").onclick = async () => {
    const ok = await copyText($("modalText").value);
    toast(ok ? "已複製" : "請手動選取文字複製");
  };
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

  $("taskForm").addEventListener("submit", onTask);
  $("toolForm").addEventListener("submit", onTool);
  $("assetForm").addEventListener("submit", onAsset);
  $("courseForm").addEventListener("submit", onCourse);
  $("customerForm").addEventListener("submit", onCustomer);
  $("announcementForm").addEventListener("submit", onAnnouncement);
  $("storyForm").addEventListener("submit", onStory);
  $("followerForm").addEventListener("submit", onFollower);
  $("postForm").addEventListener("submit", onPost);
  $("accountForm").addEventListener("submit", onAccount);
  $("inviteForm").addEventListener("submit", onInvite);
  document.body.addEventListener("submit", async (event) => {
    const form = event.target;
    if (form.id === "policyForm") return onPolicy(event);
    if (form.id === "serviceForm") return onService(event);
    if (form.id === "reminderForm") return onReminder(event);
  });

  for (const id of ["story_date", "snapshot_date", "published_on"]) {
    const input = document.querySelector(`[name="${id}"]`);
    if (input && !input.value) input.value = isoDate();
  }
  window.addEventListener("popstate", () => {
    page = new URLSearchParams(location.search).get("page") || "home";
    if (!PAGE_NAMES[page]) page = "home";
    renderPage();
  });
}

async function onTask(event) {
  event.preventDefault();
  const data = readForm(event.target);
  if (!data.title.trim()) return;
  try {
    await store.saveTask({ title: data.title, due_date: data.due_date || null });
    event.target.reset();
    toast("已新增任務");
    await renderTasks();
  } catch (error) { toast(error.message); }
}

async function onTool(event) {
  event.preventDefault();
  const data = readForm(event.target);
  try {
    await store.saveTool(data);
    event.target.reset();
    toast("已加入工具箱");
    await renderTools();
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
  if (!isBirthdayMd(data.birthday_md)) return toast("生日請只填月日，例如 03-18。");
  try {
    let archived = false;
    if (data.id) {
      const existing = (await store.listCustomers()).find((item) => item.id === data.id);
      archived = Boolean(existing?.is_archived);
    }
    const saved = await store.saveCustomer({
      id: data.id || null,
      is_archived: archived,
      owner_id: canManageTeam(me().role) ? data.owner_id : me().id,
      display_name: data.display_name,
      phone: data.phone,
      email: data.email,
      preferred_contact: data.preferred_contact,
      birthday_md: data.birthday_md.trim() || null,
      service_tags: tagsFrom(data.service_tags),
      notes: data.notes,
    });
    selectedCustomerId = saved.id;
    resetCustomerForm();
    toast("客戶已儲存");
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

async function onStory(event) {
  event.preventDefault();
  const data = readForm(event.target);
  const normalized = normalizeStory(Boolean(data.posted), data.story_count);
  if (normalized.error) return toast(normalized.error);
  try {
    await store.upsertStory({ story_date: data.story_date, ...normalized });
    toast("每日限動回報已儲存");
    await renderSocial();
  } catch (error) { toast(error.message); }
}

async function onFollower(event) {
  event.preventDefault();
  const data = readForm(event.target);
  const normalized = normalizeFollowers(data.follower_count);
  if (normalized.error) return toast(normalized.error);
  try {
    await store.upsertSnapshot({
      snapshot_date: data.snapshot_date,
      follower_count: normalized.follower_count,
      verified: Boolean(data.verified),
    });
    toast("粉絲數已儲存");
    await renderSocial();
  } catch (error) { toast(error.message); }
}

async function onPost(event) {
  event.preventDefault();
  const data = readForm(event.target);
  const link = data.permalink.trim();
  if (link && !isHttpsUrl(link)) return toast("請輸入有效的 https 網址");
  try {
    await store.savePost({
      published_on: data.published_on,
      content_type: data.content_type,
      permalink: link || null,
    });
    event.target.elements.permalink.value = "";
    toast("發布紀錄已新增");
    await renderSocial();
  } catch (error) { toast(error.message); }
}

async function onAccount(event) {
  event.preventDefault();
  const data = readForm(event.target);
  if (data.profile_url && !isHttpsUrl(data.profile_url)) return toast("主頁連結請使用 https");
  try {
    await store.saveSocialAccount(data);
    toast("IG 帳號已儲存");
    await renderSocial();
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
