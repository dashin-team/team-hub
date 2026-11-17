import { normalizeEvent } from "@hub/calendar";
import { addDays, isoDate } from "@hub/metrics";
import { normalizeCustomerInput, PROFILE_TEXT_FIELDS } from "@hub/profile";
import { randomId, safeLocal, safeSession } from "@hub/safe";

const STORAGE_KEY = "naneun-team-hub-demo-v1";
const ROLE_KEY = "naneun-team-hub-preview-role";
export const DEMO_TEAM_ID = "11111111-1111-4111-8111-111111111111";

const PEOPLE = {
  admin: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
  manager: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
  lin: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3",
  huang: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4",
  zhang: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5",
  wu: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6",
};

const ROLE_USER = { admin: PEOPLE.admin, manager: PEOPLE.manager, member: PEOPLE.lin };

function uid() {
  return randomId();
}

function nowIso() {
  return new Date().toISOString();
}

function seed() {
  const today = isoDate();
  const soonDay = addDays(today, 12);
  const profiles = [
    ["admin", "梁仕翰", "admin", "han@example.com"],
    ["manager", "陳可恩", "manager", "keen@example.com"],
    ["lin", "林子安", "member", "zian@example.com"],
    ["huang", "黃詩涵", "member", "shihan@example.com"],
    ["zhang", "張柏宇", "member", "boyu@example.com"],
    ["wu", "吳心怡", "member", "xinyi@example.com"],
  ].map(([key, name, role, email]) => ({
    id: PEOPLE[key],
    team_id: DEMO_TEAM_ID,
    display_name: name,
    email,
    role,
    is_active: true,
    created_at: nowIso(),
    updated_at: nowIso(),
  }));

  const customers = [
    customer("TH-1001", PEOPLE.lin, "王先生（示範）", "0912-000-101", ["車險", "醫療保障"], "03-18", "虛構資料。有小孩，偏好用 LINE 聯絡。", {
      nickname: "阿王",
      birth_date: `1992-${today.slice(5)}`,
      gender: "男",
      referrer: "陳同事（示範）",
      contact_method: "LINE,IG",
      hobbies: "騎車、手沖咖啡",
      lead_source: "緣故",
      relation_social: 7,
      relation_business: 4,
      analysis_worry: "擔心小孩教育金不夠，也在意突然的醫療支出。",
      analysis_dream: "希望五年內準備一筆教育基金。",
      analysis_work: "業務工作，收入不固定。房貸每月約兩萬。",
      analysis_existing: "已有實支實付與意外險。",
      analysis_insured: "本人",
      analysis_beneficiary: "配偶",
      analysis_pay_method: "年繳",
      analysis_decision: "配偶會一起決定，目前沒有其他業務員聯繫。",
      analysis_health: "目前沒有住院紀錄，偶發過敏。此為虛構描述。",
      analysis_next: "下週約訪，做一次保障檢視。",
      analysis_family: "配偶與一名小孩。",
    }),
    customer("TH-1002", PEOPLE.lin, "李小姐（示範）", "0912-000-102", ["家庭保障"], "11-02", "虛構資料。準備年度保障檢視。", {
      birth_date: `1995-${soonDay.slice(5)}`,
      gender: "女",
      contact_method: "電話",
      hobbies: "烘焙",
      lead_source: "講座",
      analysis_dream: "想在退休前把房貸還清。",
    }),
    customer("TH-1003", PEOPLE.huang, "陳媽媽（示範）", "0912-000-103", ["醫療保障"], "06-21", "虛構資料。在意門診與住院。", {
      gender: "女",
      birth_date: "1975-06-21",
      contact_method: "見面",
    }),
    customer("TH-1004", PEOPLE.zhang, "周先生（示範）", "0912-000-104", ["退休規劃"], "", "虛構資料。五年內打算退休。"),
    customer("TH-1005", PEOPLE.wu, "林小弟（示範）", "0912-000-105", ["意外保障"], "01-09", "虛構資料。常騎車通勤。"),
  ];

  const policies = [
    policy(customers[0], "意外", "示範產險", 45, 20, "1280"),
    policy(customers[0], "實支實付", "示範人壽", 200, 30, "3341"),
    policy(customers[2], "日額・手術", "示範人壽", 15, 7, "9088"),
    policy(customers[3], "身價", "示範人壽", 400, 60, "2201"),
    policy(customers[4], "長照", "示範人壽", 90, 30, "4410"),
  ];

  const serviceRecords = [
    {
      id: uid(),
      team_id: DEMO_TEAM_ID,
      customer_id: customers[0].id,
      owner_id: PEOPLE.lin,
      service_date: `${addDays(today, -4)}T09:30:00`,
      service_type: "保單檢視",
      summary: "一起看了車險到期日與醫療保障範圍，客戶想再確認家人的需求。",
      next_action: "約下次以生活近況打開話，不先談商品。",
      next_contact_date: addDays(today, 10),
      created_at: nowIso(),
      updated_at: nowIso(),
    },
  ];

  const reminders = [
    reminder(PEOPLE.lin, customers[0].id, policies[0].id, "birthday", "王先生生日提醒", 12),
    reminder(PEOPLE.lin, customers[0].id, policies[0].id, "renewal", "王先生意外保障續保", 20),
    reminder(PEOPLE.lin, customers[1].id, null, "follow_up", "約李小姐年度檢視", 3),
    reminder(PEOPLE.huang, customers[2].id, policies[2].id, "policy_expiry", "陳媽媽住院日額即將到期", 15),
    reminder(PEOPLE.admin, null, null, "other", "確認本週團隊公告", 1),
  ];

  const tasks = [
    task(PEOPLE.admin, "看本週客戶提醒，找出需要協助的夥伴", false, 0),
    task(PEOPLE.admin, "準備週四的 AI 指令小練習", false, 2),
    task(PEOPLE.lin, "關心三位客戶，訊息先寫好再送出", false, 0),
    task(PEOPLE.lin, "完成車險續保提醒的服務紀錄", true, -1),
    task(PEOPLE.huang, "整理本週要聯絡的客戶", false, 0),
    task(PEOPLE.manager, "整理新人可以用的素材連結", false, 1),
  ];

  const calendarEvents = [
    calEvent(PEOPLE.lin, "約王先生喝咖啡", "visit", 0, "10:00", 0, "虛構。先聊近況，不先談商品。", false, { minutes: 60, reminder: "30m", companion: PEOPLE.manager }),
    calEvent(PEOPLE.lin, "李小姐年度面談", "meet", 1, "14:30", 1, "虛構。帶保障檢視表。", false, { minutes: 90 }),
    calEvent(PEOPLE.lin, "送件練習（示範）", "deal", -1, "16:00", 0, "虛構。不是真實送件。", true, { minutes: 60 }),
    calEvent(PEOPLE.lin, "週三教材小課", "train", 2, "19:00", null, "虛構。團隊內部分享。", false, { minutes: 120 }),
    calEvent(PEOPLE.lin, "認識一位新人朋友", "recruit", -3, "11:00", null, "虛構。只是約喝咖啡。", true),
    calEvent(PEOPLE.lin, "整理客戶近況", "other", 4, null, null, "", false),
    calEvent(PEOPLE.lin, "上週已完成的約訪", "visit", -6, "09:30", 1, "", true),
    calEvent(PEOPLE.huang, "詩涵示範增員", "recruit", 0, "15:00", 2, "虛構。", false),
    calEvent(PEOPLE.huang, "增員說明會", "recruit", 3, "19:30", null, "虛構。", false),
    calEvent(PEOPLE.manager, "新人陪訪", "meet", 1, "10:30", null, "虛構。", false),
    calEvent(PEOPLE.admin, "看本週團隊行程", "other", 0, "09:00", null, "虛構。", false),
    calEvent(PEOPLE.zhang, "送件前再確認", "deal", 2, "13:00", 3, "虛構。", false),
    calEvent(PEOPLE.wu, "教育訓練簽到", "train", -2, "18:30", null, "虛構。", true),
  ];

  const assets = [
    ["社群貼文版型", "社群貼文", "社群內容與貼文版型的集中入口", "▧"],
    ["保單檢視說明素材", "客戶服務", "年度保單檢視及服務說明", "▤"],
    ["新人訓練簡報", "簡報教材", "新人基礎訓練與工作流程", "▣"],
    ["節慶祝福素材", "節慶活動", "節日問候及客戶互動素材", "✧"],
    ["理賠服務流程", "客戶服務", "理賠協助流程與注意事項", "♡"],
    ["商品教育簡報", "簡報教材", "商品知識與保障觀念教材", "▥"],
  ].map(([title, category, description, symbol]) => ({
    id: uid(),
    team_id: DEMO_TEAM_ID,
    title,
    category,
    description,
    symbol,
    storage_path: null,
    external_url: null,
    is_published: true,
    created_by: PEOPLE.manager,
    created_at: nowIso(),
    updated_at: nowIso(),
  }));

  const courses = [
    ["客戶服務基本流程", "從認識客戶到留下服務紀錄，先把步驟走順。"],
    ["AI 指令入門與實作", "用團隊指令寫關心訊息與社群草稿，記得去掉個資。"],
    ["社群內容經營基礎", "限動、貼文、Reels 怎麼排進一週，而不是每天臨時想。"],
    ["個資保護與資訊安全", "什麼可以記、什麼不能貼進未核准的工具。"],
  ].map(([title, description], index) => ({
    id: uid(),
    team_id: DEMO_TEAM_ID,
    title,
    description,
    content_url: null,
    sort_order: index + 1,
    is_published: true,
    created_by: PEOPLE.manager,
    created_at: nowIso(),
    updated_at: nowIso(),
  }));

  const progressPairs = [
    [PEOPLE.lin, 0], [PEOPLE.lin, 1],
    [PEOPLE.huang, 0],
    [PEOPLE.zhang, 0], [PEOPLE.zhang, 1], [PEOPLE.zhang, 2], [PEOPLE.zhang, 3],
    [PEOPLE.admin, 3],
    [PEOPLE.manager, 0], [PEOPLE.manager, 1], [PEOPLE.manager, 2],
  ];
  const courseProgress = progressPairs.map(([member, index]) => ({
    id: uid(),
    course_id: courses[index].id,
    member_id: member,
    completed_at: nowIso(),
    created_at: nowIso(),
    updated_at: nowIso(),
  }));

  const announcements = [
    announce("歡迎使用南恩團隊 TEAM HUB", "這裡集中每天會用到的工具、教材、客戶服務與社群紀錄。先從示範資料熟悉操作，公司核准前不要輸入真實客戶資料。", true),
    announce("個資及資訊安全提醒", "請勿輸入身分證字號、病歷、完整保單號碼、銀行帳戶，也不要把可識別客戶的資料貼進未核准的 AI 工具。", true),
    announce("素材使用原則", "對外發布前，請確認商品資訊、活動日期、費率及公司規範都是最新且已經核准。", true),
    announce("草稿：下週晨會", "這則還沒發布，一般夥伴不應該看到。", false),
  ];

  return {
    version: 7,
    profiles,
    customers,
    policies,
    service_records: serviceRecords,
    reminders,
    tasks,
    calendar_events: calendarEvents,
    assets,
    courses,
    course_progress: courseProgress,
    announcements,
  };

  function customer(code, owner, name, phone, tags, birthday, notes, extra = {}) {
    const row = {
      id: uid(),
      team_id: DEMO_TEAM_ID,
      owner_id: owner,
      ref_code: code,
      display_name: name,
      phone,
      email: "",
      preferred_contact: "LINE",
      service_tags: tags,
      birthday_md: birthday || null,
      notes,
      gender: null,
      relation_social: null,
      relation_business: null,
      birth_date: null,
      privacy_notice_recorded_at: nowIso(),
      is_archived: false,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
    for (const key of PROFILE_TEXT_FIELDS) row[key] = extra[key] || (key === "notes" ? notes : "");
    if (extra.birth_date) {
      row.birth_date = extra.birth_date;
      row.birthday_md = String(extra.birth_date).slice(5);
    }
    row.gender = extra.gender || null;
    row.relation_social = extra.relation_social ?? null;
    row.relation_business = extra.relation_business ?? null;
    return row;
  }

  function policy(ownerCustomer, category, insurer, expiryIn, renewalIn, last4) {
    return {
      id: uid(),
      team_id: DEMO_TEAM_ID,
      customer_id: ownerCustomer.id,
      owner_id: ownerCustomer.owner_id,
      policy_category: category,
      insurer_name: insurer,
      effective_date: addDays(today, -300),
      expiry_date: addDays(today, expiryIn),
      renewal_reminder_date: addDays(today, renewalIn),
      status: "active",
      reference_last4: last4,
      notes: "示範摘要，不是真實保單。",
      created_at: nowIso(),
      updated_at: nowIso(),
    };
  }

  function reminder(owner, customerId, policyId, kind, title, dueIn) {
    return {
      id: uid(),
      team_id: DEMO_TEAM_ID,
      owner_id: owner,
      customer_id: customerId,
      policy_id: policyId,
      kind,
      title,
      due_at: `${addDays(today, dueIn)}T09:00:00`,
      status: "open",
      created_at: nowIso(),
      updated_at: nowIso(),
    };
  }

  function calEvent(owner, title, type, dayOffset, time, customerIndex, note, done, extra = {}) {
    const date = addDays(today, dayOffset);
    const allDay = !time;
    const starts = allDay ? new Date(`${date}T00:00:00`) : new Date(`${date}T${time}:00`);
    const ends = allDay ? new Date(`${date}T23:59:00`) : new Date(starts.getTime() + (extra.minutes || 60) * 60000);
    return {
      id: uid(),
      team_id: DEMO_TEAM_ID,
      owner_id: owner,
      title,
      event_date: date,
      event_time: time,
      event_type: type,
      customer_id: customerIndex == null ? null : customers[customerIndex].id,
      note: note || "",
      is_done: Boolean(done),
      all_day: allDay,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      companion_id: extra.companion || null,
      reminder: extra.reminder || "none",
      created_at: nowIso(),
      updated_at: nowIso(),
    };
  }

  function task(owner, title, isDone, dueIn) {
    return {
      id: uid(),
      team_id: DEMO_TEAM_ID,
      owner_id: owner,
      title,
      due_date: addDays(today, dueIn),
      is_done: isDone,
      completed_at: isDone ? nowIso() : null,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
  }

  function announce(title, body, published) {
    return {
      id: uid(),
      team_id: DEMO_TEAM_ID,
      title,
      body,
      published_at: published ? nowIso() : null,
      created_by: PEOPLE.admin,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
  }
}

function loadState() {
  try {
    const raw = safeLocal.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 7 || !Array.isArray(parsed.profiles)) return seed();
    return parsed;
  } catch {
    return seed();
  }
}

export function createDemoStore() {
  let state = loadState();
  let preview = safeSession.getItem(ROLE_KEY) || "admin";
  if (!ROLE_USER[preview]) preview = "admin";

  function persist() {
    safeLocal.setItem(STORAGE_KEY, JSON.stringify(state));
  }
  persist();

  function profile() {
    return state.profiles.find((item) => item.id === ROLE_USER[preview]) || null;
  }

  function manager() {
    const role = profile()?.role;
    return role === "admin" || role === "manager";
  }

  function requireProfile() {
    const me = profile();
    if (!me) throw new Error("找不到示範身分");
    return me;
  }

  function nextRef() {
    const nums = state.customers
      .map((item) => Number(String(item.ref_code || "").replace(/\D/g, "")))
      .filter((n) => Number.isInteger(n));
    const next = Math.max(1000, ...nums) + 1;
    return `TH-${next}`;
  }


  return {
    mode: "demo",
    teamName: "南恩團隊",

    async init() {},

    get profile() {
      return profile();
    },

    get previewRole() {
      return preview;
    },

    setPreviewRole(role) {
      if (!ROLE_USER[role]) return;
      preview = role;
      safeSession.setItem(ROLE_KEY, role);
    },

    resetDemo() {
      safeLocal.removeItem(STORAGE_KEY);
      state = seed();
      persist();
    },

    async signIn() {
      throw new Error("示範模式不用登入");
    },

    async signOut() {},

    async requestPasswordReset() {
      throw new Error("示範模式沒有寄信功能");
    },

    async updatePassword() {},

    async markPasswordChanged() {},

    async listTeamRoster() {
      return [];
    },

    async listProfiles() {
      const me = requireProfile();
      if (!manager()) return state.profiles.filter((item) => item.id === me.id);
      return state.profiles.filter((item) => item.team_id === me.team_id);
    },

    async listAnnouncements() {
      const me = requireProfile();
      return state.announcements.filter((item) => {
        if (item.team_id !== me.team_id) return false;
        return manager() || item.published_at;
      });
    },

    async saveAnnouncement(input) {
      const me = requireProfile();
      if (!manager()) throw new Error("只有主管或管理員可以發布公告");
      if (input.id) {
        const row = state.announcements.find((item) => item.id === input.id && item.team_id === me.team_id);
        if (!row) throw new Error("找不到公告");
        Object.assign(row, {
          title: input.title.trim(),
          body: input.body.trim(),
          published_at: input.publish ? row.published_at || nowIso() : null,
          updated_at: nowIso(),
        });
        persist();
        return row;
      }
      const row = {
        id: uid(),
        team_id: me.team_id,
        title: input.title.trim(),
        body: input.body.trim(),
        published_at: input.publish ? nowIso() : null,
        created_by: me.id,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      state.announcements.unshift(row);
      persist();
      return row;
    },

    async listAssets() {
      const me = requireProfile();
      return state.assets.filter((item) => item.team_id === me.team_id && (manager() || item.is_published));
    },

    async saveAsset(input) {
      const me = requireProfile();
      if (!manager()) throw new Error("只有主管或管理員可以維護素材");
      const row = {
        id: uid(),
        team_id: me.team_id,
        title: input.title.trim(),
        category: input.category.trim(),
        description: (input.description || "").trim(),
        symbol: "▤",
        storage_path: null,
        external_url: input.external_url?.trim() || null,
        is_published: true,
        created_by: me.id,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      state.assets.unshift(row);
      persist();
      return row;
    },

    async listCourses() {
      const me = requireProfile();
      return state.courses
        .filter((item) => item.team_id === me.team_id && (manager() || item.is_published))
        .sort((a, b) => a.sort_order - b.sort_order);
    },

    async saveCourse(input) {
      const me = requireProfile();
      if (!manager()) throw new Error("只有主管或管理員可以新增教材");
      const row = {
        id: uid(),
        team_id: me.team_id,
        title: input.title.trim(),
        description: (input.description || "").trim(),
        content_url: input.content_url?.trim() || null,
        sort_order: state.courses.length + 1,
        is_published: true,
        created_by: me.id,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      state.courses.push(row);
      persist();
      return row;
    },

    async listProgress() {
      const me = requireProfile();
      const courseIds = new Set(
        state.courses.filter((item) => item.team_id === me.team_id).map((item) => item.id),
      );
      return state.course_progress.filter((item) => {
        if (!courseIds.has(item.course_id)) return false;
        return manager() || item.member_id === me.id;
      });
    },

    async setCourseComplete(courseId, done) {
      const me = requireProfile();
      const course = state.courses.find((item) => item.id === courseId && item.team_id === me.team_id && item.is_published);
      if (!course) throw new Error("找不到這門教材");
      state.course_progress = state.course_progress.filter(
        (item) => !(item.course_id === courseId && item.member_id === me.id),
      );
      if (done) {
        state.course_progress.push({
          id: uid(),
          course_id: courseId,
          member_id: me.id,
          completed_at: nowIso(),
          created_at: nowIso(),
          updated_at: nowIso(),
        });
      }
      persist();
    },

    async listTasks() {
      const me = requireProfile();
      return state.tasks.filter((item) => {
        if (item.team_id !== me.team_id) return false;
        if (me.role === "admin" || item.owner_id === me.id) return true;
        return false;
      });
    },

    async saveTask(input) {
      const me = requireProfile();
      const ownerId = me.role === "admin" && input.owner_id ? input.owner_id : me.id;
      if (me.role !== "admin" && ownerId !== me.id) throw new Error("只能管理自己的任務");
      if (input.id) {
        const row = state.tasks.find((item) => item.id === input.id);
        if (!row || (row.owner_id !== me.id && me.role !== "admin")) throw new Error("找不到任務");
        row.title = input.title?.trim() || row.title;
        if (input.due_date) row.due_date = input.due_date;
        row.is_done = Boolean(input.is_done);
        row.completed_at = row.is_done ? row.completed_at || nowIso() : null;
        row.updated_at = nowIso();
        persist();
        return row;
      }
      const row = {
        id: uid(),
        team_id: me.team_id,
        owner_id: ownerId,
        title: input.title.trim(),
        due_date: input.due_date || null,
        is_done: false,
        completed_at: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      state.tasks.unshift(row);
      persist();
      return row;
    },

    async deleteTask(id) {
      const me = requireProfile();
      const row = state.tasks.find((item) => item.id === id);
      if (!row || (row.owner_id !== me.id && me.role !== "admin")) throw new Error("找不到任務");
      state.tasks = state.tasks.filter((item) => item.id !== id);
      persist();
    },

    async listTeammates() {
      const me = requireProfile();
      return state.profiles
        .filter((item) => item.team_id === me.team_id)
        .map((item) => ({ id: item.id, display_name: item.display_name }));
    },

    async listCalendarEvents() {
      const me = requireProfile();
      return (state.calendar_events || []).filter((item) => {
        if (item.team_id !== me.team_id) return false;
        return manager() || item.owner_id === me.id;
      });
    },

    async saveCalendarEvent(input) {
      const me = requireProfile();
      const norm = normalizeEvent(input);
      if (norm.error) throw new Error(norm.error);
      if (norm.fields.customer_id) {
        const customer = state.customers.find((item) => item.id === norm.fields.customer_id && item.team_id === me.team_id);
        if (!customer || (!manager() && customer.owner_id !== me.id)) throw new Error("找不到這位客戶");
      }
      if (norm.fields.companion_id && !state.profiles.some((item) => item.id === norm.fields.companion_id && item.team_id === me.team_id)) {
        throw new Error("陪同必須是同團隊的夥伴");
      }
      if (!state.calendar_events) state.calendar_events = [];
      if (input.id) {
        const row = state.calendar_events.find((item) => item.id === input.id && item.team_id === me.team_id);
        if (!row || row.owner_id !== me.id) throw new Error("只能修改自己的行事曆");
        Object.assign(row, norm.fields, { updated_at: nowIso() });
        persist();
        return row;
      }
      const row = {
        id: uid(),
        team_id: me.team_id,
        owner_id: me.id,
        created_at: nowIso(),
        updated_at: nowIso(),
        ...norm.fields,
      };
      state.calendar_events.unshift(row);
      persist();
      return row;
    },

    async deleteCalendarEvent(id) {
      const me = requireProfile();
      const row = (state.calendar_events || []).find((item) => item.id === id);
      if (!row || row.owner_id !== me.id) throw new Error("只能刪除自己的活動");
      state.calendar_events = state.calendar_events.filter((item) => item.id !== id);
      persist();
    },

    async listCustomers() {
      const me = requireProfile();
      return state.customers.filter((item) => {
        if (item.team_id !== me.team_id) return false;
        return manager() || item.owner_id === me.id;
      });
    },

    async saveCustomer(input) {
      const me = requireProfile();
      const ownerId = input.owner_id || me.id;
      if (!manager() && ownerId !== me.id) throw new Error("只能維護自己負責的客戶");
      if (!state.profiles.some((item) => item.id === ownerId && item.team_id === me.team_id)) {
        throw new Error("負責人必須是同團隊的夥伴");
      }
      const norm = normalizeCustomerInput(input);
      if (norm.error) throw new Error(norm.error);
      if (input.id) {
        const row = state.customers.find((item) => item.id === input.id && item.team_id === me.team_id);
        if (!row || (!manager() && row.owner_id !== me.id)) throw new Error("找不到客戶");
        const previousOwner = row.owner_id;
        Object.assign(row, norm.fields, {
          owner_id: ownerId,
          email: (input.email || "").trim(),
          preferred_contact: input.preferred_contact || "",
          service_tags: input.service_tags || [],
          is_archived: Boolean(input.is_archived),
          updated_at: nowIso(),
        });
        if (previousOwner !== ownerId) {
          state.policies.forEach((item) => {
            if (item.customer_id === row.id) item.owner_id = ownerId;
          });
          state.service_records.forEach((item) => {
            if (item.customer_id === row.id) item.owner_id = ownerId;
          });
        }
        persist();
        return row;
      }
      const row = {
        id: uid(),
        team_id: me.team_id,
        owner_id: ownerId,
        ref_code: nextRef(),
        email: (input.email || "").trim(),
        preferred_contact: input.preferred_contact || "",
        service_tags: input.service_tags || [],
        privacy_notice_recorded_at: nowIso(),
        is_archived: false,
        created_at: nowIso(),
        updated_at: nowIso(),
        ...norm.fields,
      };
      state.customers.unshift(row);
      persist();
      return row;
    },

    async listPolicies(customerId) {
      const customers = await this.listCustomers();
      const allowed = new Set(customers.map((item) => item.id));
      return state.policies.filter((item) => allowed.has(item.customer_id) && (!customerId || item.customer_id === customerId));
    },

    async savePolicy(input) {
      const me = requireProfile();
      const customer = state.customers.find((item) => item.id === input.customer_id && item.team_id === me.team_id);
      if (!customer || (!manager() && customer.owner_id !== me.id)) throw new Error("找不到客戶");
      const row = {
        id: uid(),
        team_id: me.team_id,
        customer_id: customer.id,
        owner_id: customer.owner_id,
        policy_category: input.policy_category.trim(),
        insurer_name: (input.insurer_name || "").trim(),
        effective_date: input.effective_date || null,
        expiry_date: input.expiry_date || null,
        renewal_reminder_date: input.renewal_reminder_date || null,
        status: input.status || "active",
        reference_last4: input.reference_last4 || null,
        notes: (input.notes || "").trim(),
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      state.policies.unshift(row);
      persist();
      return row;
    },

    async deletePolicy(id) {
      const me = requireProfile();
      const row = state.policies.find((item) => item.id === id);
      if (!row || (!manager() && row.owner_id !== me.id)) throw new Error("找不到保單摘要");
      state.policies = state.policies.filter((item) => item.id !== id);
      persist();
    },

    async listServiceRecords(customerId) {
      const customers = await this.listCustomers();
      const allowed = new Set(customers.map((item) => item.id));
      return state.service_records
        .filter((item) => allowed.has(item.customer_id) && (!customerId || item.customer_id === customerId))
        .sort((a, b) => String(b.service_date).localeCompare(String(a.service_date)));
    },

    async saveServiceRecord(input) {
      const me = requireProfile();
      const customer = state.customers.find((item) => item.id === input.customer_id && item.team_id === me.team_id);
      if (!customer || (!manager() && customer.owner_id !== me.id)) throw new Error("找不到客戶");
      const row = {
        id: uid(),
        team_id: me.team_id,
        customer_id: customer.id,
        owner_id: customer.owner_id,
        service_date: input.service_date || nowIso(),
        service_type: input.service_type,
        summary: input.summary.trim(),
        next_action: (input.next_action || "").trim(),
        next_contact_date: input.next_contact_date || null,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      state.service_records.unshift(row);
      persist();
      return row;
    },

    async deleteServiceRecord(id) {
      const me = requireProfile();
      const row = state.service_records.find((item) => item.id === id);
      if (!row || (!manager() && row.owner_id !== me.id)) throw new Error("找不到服務紀錄");
      state.service_records = state.service_records.filter((item) => item.id !== id);
      persist();
    },

    async listReminders(customerId) {
      const me = requireProfile();
      return state.reminders.filter((item) => {
        if (item.team_id !== me.team_id) return false;
        if (customerId && item.customer_id !== customerId) return false;
        return me.role === "admin" || item.owner_id === me.id;
      });
    },

    async saveReminder(input) {
      const me = requireProfile();
      const ownerId = me.role === "admin" && input.owner_id ? input.owner_id : me.id;
      if (me.role !== "admin" && ownerId !== me.id) throw new Error("只能建立自己的提醒");
      const row = {
        id: uid(),
        team_id: me.team_id,
        owner_id: ownerId,
        customer_id: input.customer_id || null,
        policy_id: input.policy_id || null,
        kind: input.kind,
        title: input.title.trim(),
        due_at: input.due_at,
        status: "open",
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      state.reminders.unshift(row);
      persist();
      return row;
    },

    async setReminderStatus(id, status) {
      const me = requireProfile();
      const row = state.reminders.find((item) => item.id === id);
      if (!row || (row.owner_id !== me.id && me.role !== "admin")) throw new Error("找不到提醒");
      row.status = status;
      row.updated_at = nowIso();
      persist();
    },

    async inviteMember() {
      throw new Error("示範模式不會寄出邀請信。接上 Supabase 之後，管理員才能邀請夥伴。");
    },

    async updateMember() {
      throw new Error("示範模式的角色切換只影響這台瀏覽器，不會真的變更權限。");
    },
  };
}
