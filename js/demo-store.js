import { addDays, isoDate, weekStart } from "./metrics.js";

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
  return crypto.randomUUID();
}

function nowIso() {
  return new Date().toISOString();
}

function seed() {
  const today = isoDate();
  const start = weekStart(today);
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

  const accounts = [
    [PEOPLE.admin, "naneun.leader", "business", "manual", 980, 940],
    [PEOPLE.manager, "naneun.digital", "creator", "manual", 640, 610],
    [PEOPLE.lin, "zian.lin", "creator", "manual", 1280, 1160],
    [PEOPLE.huang, "shihan.huang", "business", "manual", 860, 820],
    [PEOPLE.zhang, "boyu.zhang", "creator", "manual", 2450, 2420],
    [PEOPLE.wu, "xinyi.wu", "personal", "expired", 530, 520],
  ].map(([owner, username, type, status, latest, prev]) => ({
    id: uid(),
    owner_id: owner,
    username,
    type,
    status,
    latest,
    prev,
  }));

  const socialAccounts = accounts.map((a) => ({
    id: a.id,
    team_id: DEMO_TEAM_ID,
    owner_id: a.owner_id,
    platform: "instagram",
    instagram_username: a.username,
    profile_url: `https://www.instagram.com/${a.username}/`,
    account_type: a.type,
    connection_status: a.status,
    consented_at: null,
    last_synced_at: null,
    created_at: nowIso(),
    updated_at: nowIso(),
  }));

  const snapshots = accounts.flatMap((a) => [
    snap(a, addDays(today, -7), a.prev, false),
    snap(a, today, a.latest, true),
  ]);

  const stories = [];
  const storyPlan = {
    [PEOPLE.lin]: [true, true, true, false],
    [PEOPLE.huang]: [true, false, true],
    [PEOPLE.zhang]: [true, true, true, true, true],
    [PEOPLE.admin]: [true, true],
    [PEOPLE.manager]: [true],
  };
  for (const [owner, flags] of Object.entries(storyPlan)) {
    const account = socialAccounts.find((item) => item.owner_id === owner);
    flags.forEach((posted, index) => {
      const date = addDays(start, index);
      if (date > today) return;
      stories.push({
        id: uid(),
        account_id: account.id,
        team_id: DEMO_TEAM_ID,
        owner_id: owner,
        story_date: date,
        posted,
        story_count: posted ? (index % 3) + 1 : 0,
        source: "manual",
        note: "",
        recorded_by: owner,
        created_at: nowIso(),
        updated_at: nowIso(),
      });
    });
  }

  const posts = [
    post(PEOPLE.lin, "post", 0, "https://www.instagram.com/p/demo-service/"),
    post(PEOPLE.lin, "reel", -1, "https://www.instagram.com/reel/demo-review/"),
    post(PEOPLE.huang, "post", -2, "https://www.instagram.com/p/demo-care/"),
    post(PEOPLE.zhang, "reel", -1, "https://www.instagram.com/reel/demo-brand/"),
    post(PEOPLE.admin, "post", -3, "https://www.instagram.com/p/demo-team/"),
  ];

  const customers = [
    customer("TH-1001", PEOPLE.lin, "王先生（示範）", "0912-000-101", ["車險", "醫療保障"], "03-18", "虛構資料。有小孩，偏好用 LINE 聯絡。"),
    customer("TH-1002", PEOPLE.lin, "李小姐（示範）", "0912-000-102", ["家庭保障"], "11-02", "虛構資料。準備年度保障檢視。"),
    customer("TH-1003", PEOPLE.huang, "陳媽媽（示範）", "0912-000-103", ["醫療保障"], "06-21", "虛構資料。在意門診與住院。"),
    customer("TH-1004", PEOPLE.zhang, "周先生（示範）", "0912-000-104", ["退休規劃"], "", "虛構資料。五年內打算退休。"),
    customer("TH-1005", PEOPLE.wu, "林小弟（示範）", "0912-000-105", ["意外保障"], "01-09", "虛構資料。常騎車通勤。"),
  ];

  const policies = [
    policy(customers[0], "車險", "示範產險", 45, 20, "1280"),
    policy(customers[0], "醫療保障", "示範人壽", 200, 30, "3341"),
    policy(customers[2], "醫療保障", "示範人壽", 15, 7, "9088"),
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
    reminder(PEOPLE.lin, customers[0].id, policies[0].id, "renewal", "王先生車險續保", 20),
    reminder(PEOPLE.lin, customers[1].id, null, "follow_up", "約李小姐年度檢視", 3),
    reminder(PEOPLE.huang, customers[2].id, policies[2].id, "policy_expiry", "陳媽媽醫療保障即將到期", 15),
    reminder(PEOPLE.admin, null, null, "other", "確認本週團隊公告", 1),
  ];

  const tasks = [
    task(PEOPLE.admin, "看本週社群回報，找出需要協助的夥伴", false, 0),
    task(PEOPLE.admin, "準備週四的 AI 指令小練習", false, 2),
    task(PEOPLE.lin, "關心三位客戶，訊息先寫好再送出", false, 0),
    task(PEOPLE.lin, "完成車險續保提醒的服務紀錄", true, -1),
    task(PEOPLE.huang, "補上本週兩則限動", false, 0),
    task(PEOPLE.manager, "整理新人可以用的素材連結", false, 1),
  ];

  const tools = [
    ["客戶關心訊息", "客戶服務", "依照客戶關係撰寫自然、不推銷的關心訊息。請提供三種版本：親切日常、專業溫暖、簡短自然。避免制式問候，並保留讓對方容易回覆的空間。情境：[填入不含個資的情境]。"],
    ["年度保單檢視邀約", "客戶服務", "請幫我寫一段自然的訊息，邀請既有客戶安排年度保障檢視。重點放在確認保障內容是否符合目前生活階段，不製造恐懼、不強迫推銷。語氣像平常聊天，約 80 字。"],
    ["生日祝福文案", "客戶服務", "請撰寫一段真誠、不油膩的生日祝福，像熟識朋友的日常訊息。不要提商品或銷售，提供三種不同語氣。對象關係：[填寫關係]。"],
    ["IG 服務日常貼文", "社群", "請把以下服務情境改寫成自然的 IG 貼文，口吻真誠、生活化，不要有 AI 腔、不過度推銷。包含一個吸引人的開頭、內文及 3 個相關標籤。情境：[填寫去識別化情境]。"],
    ["Threads 專業分享", "社群", "請以一般民眾聽得懂的方式，把以下保險觀念寫成 Threads 短文。先從生活情境切入，再說明觀念，最後提出一個值得思考的問題。避免誇大或未經查證的數字。主題：[填寫主題]。"],
    ["客戶需求訪談問題", "客戶服務", "請針對以下客戶情境設計 5 個開放式需求訪談問題，避免一開始就推商品。問題要自然、尊重客戶、不帶預設答案。情境：[填寫去識別化情境]。"],
    ["商品簡報架構", "教材", "請協助規劃一份面向一般民眾的保險商品教育簡報。先列出客戶可能遇到的生活風險、保障觀念、需要確認的條款重點及常見問題。不要自行編造商品條款、費率或理賠承諾；未知處標示待查證。主題：[填寫主題]。"],
    ["客戶服務紀錄整理", "工作", "請將以下去識別化的服務筆記整理成：本次服務事項、客戶提出的問題、待確認事項、後續行動及預計追蹤時間。請勿推測未提供的資訊。筆記：[貼上已去識別化內容]。"],
  ].map(([title, category, prompt], index) => ({
    id: uid(),
    team_id: DEMO_TEAM_ID,
    title,
    category,
    prompt,
    is_published: true,
    created_by: PEOPLE.admin,
    created_at: nowIso(),
    updated_at: nowIso(),
    sort_hint: index,
  }));

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
    version: 1,
    profiles,
    customers,
    policies,
    service_records: serviceRecords,
    reminders,
    tasks,
    tools,
    assets,
    courses,
    course_progress: courseProgress,
    announcements,
    social_accounts: socialAccounts,
    social_follower_snapshots: snapshots,
    social_story_logs: stories,
    social_posts: posts,
  };

  function snap(account, date, count, verified) {
    return {
      id: uid(),
      account_id: account.id,
      team_id: DEMO_TEAM_ID,
      owner_id: account.owner_id,
      snapshot_date: date,
      follower_count: count,
      following_count: null,
      source: "manual",
      verified,
      recorded_by: account.owner_id,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
  }

  function post(owner, type, dayOffset, url) {
    const account = socialAccounts.find((item) => item.owner_id === owner);
    const date = addDays(today, dayOffset);
    return {
      id: uid(),
      account_id: account.id,
      team_id: DEMO_TEAM_ID,
      owner_id: owner,
      content_type: type,
      published_at: `${date}T10:00:00`,
      permalink: url,
      source: "manual",
      external_media_id: null,
      recorded_by: owner,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
  }

  function customer(code, owner, name, phone, tags, birthday, notes) {
    return {
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
      privacy_notice_recorded_at: nowIso(),
      is_archived: false,
      created_at: nowIso(),
      updated_at: nowIso(),
    };
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
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seed();
    const parsed = JSON.parse(raw);
    if (parsed?.version !== 1 || !Array.isArray(parsed.profiles)) return seed();
    return parsed;
  } catch {
    return seed();
  }
}

export function createDemoStore() {
  let state = loadState();
  let preview = sessionStorage.getItem(ROLE_KEY) || "admin";
  if (!ROLE_USER[preview]) preview = "admin";

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
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

  function ownAccount() {
    const me = requireProfile();
    return state.social_accounts.find((item) => item.owner_id === me.id) || null;
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
      sessionStorage.setItem(ROLE_KEY, role);
    },

    resetDemo() {
      localStorage.removeItem(STORAGE_KEY);
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

    async updatePassword() {
      throw new Error("示範模式沒有密碼");
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

    async listTools() {
      const me = requireProfile();
      return state.tools.filter((item) => item.team_id === me.team_id && (manager() || item.is_published));
    },

    async saveTool(input) {
      const me = requireProfile();
      if (!manager()) throw new Error("只有主管或管理員可以維護指令");
      const row = {
        id: uid(),
        team_id: me.team_id,
        title: input.title.trim(),
        category: (input.category || "一般").trim(),
        prompt: input.prompt.trim(),
        is_published: true,
        created_by: me.id,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      state.tools.unshift(row);
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
      if (input.id) {
        const row = state.customers.find((item) => item.id === input.id && item.team_id === me.team_id);
        if (!row || (!manager() && row.owner_id !== me.id)) throw new Error("找不到客戶");
        Object.assign(row, {
          owner_id: ownerId,
          display_name: input.display_name.trim(),
          phone: (input.phone || "").trim(),
          email: (input.email || "").trim(),
          preferred_contact: input.preferred_contact || "",
          service_tags: input.service_tags || [],
          birthday_md: input.birthday_md || null,
          notes: (input.notes || "").trim(),
          is_archived: Boolean(input.is_archived),
          updated_at: nowIso(),
        });
        if (row.owner_id !== ownerId) {
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
        display_name: input.display_name.trim(),
        phone: (input.phone || "").trim(),
        email: (input.email || "").trim(),
        preferred_contact: input.preferred_contact || "",
        service_tags: input.service_tags || [],
        birthday_md: input.birthday_md || null,
        notes: (input.notes || "").trim(),
        privacy_notice_recorded_at: nowIso(),
        is_archived: false,
        created_at: nowIso(),
        updated_at: nowIso(),
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

    async listSocialAccounts() {
      const me = requireProfile();
      return state.social_accounts.filter((item) => {
        if (item.team_id !== me.team_id) return false;
        return manager() || item.owner_id === me.id;
      });
    },

    async saveSocialAccount(input) {
      const me = requireProfile();
      const existing = ownAccount();
      if (existing) {
        existing.instagram_username = input.instagram_username.trim().replace(/^@/, "");
        existing.profile_url = input.profile_url?.trim() || null;
        existing.account_type = input.account_type || "unknown";
        existing.updated_at = nowIso();
        persist();
        return existing;
      }
      const row = {
        id: uid(),
        team_id: me.team_id,
        owner_id: me.id,
        platform: "instagram",
        instagram_username: input.instagram_username.trim().replace(/^@/, ""),
        profile_url: input.profile_url?.trim() || null,
        account_type: input.account_type || "unknown",
        connection_status: "manual",
        consented_at: null,
        last_synced_at: null,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      state.social_accounts.push(row);
      persist();
      return row;
    },

    async listSnapshots() {
      const accounts = await this.listSocialAccounts();
      const ids = new Set(accounts.map((item) => item.id));
      return state.social_follower_snapshots.filter((item) => ids.has(item.account_id));
    },

    async upsertSnapshot(input) {
      const me = requireProfile();
      const account = ownAccount();
      if (!account) throw new Error("請先建立自己的 IG 帳號");
      const date = input.snapshot_date;
      let row = state.social_follower_snapshots.find(
        (item) => item.account_id === account.id && item.snapshot_date === date,
      );
      if (!row) {
        row = {
          id: uid(),
          account_id: account.id,
          team_id: me.team_id,
          owner_id: me.id,
          snapshot_date: date,
          follower_count: input.follower_count,
          following_count: null,
          source: "manual",
          verified: Boolean(input.verified),
          recorded_by: me.id,
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        state.social_follower_snapshots.push(row);
      } else {
        row.follower_count = input.follower_count;
        row.verified = Boolean(input.verified);
        row.source = "manual";
        row.recorded_by = me.id;
        row.updated_at = nowIso();
      }
      persist();
      return row;
    },

    async listStories() {
      const accounts = await this.listSocialAccounts();
      const ids = new Set(accounts.map((item) => item.id));
      return state.social_story_logs.filter((item) => ids.has(item.account_id));
    },

    async upsertStory(input) {
      const me = requireProfile();
      const account = ownAccount();
      if (!account) throw new Error("請先建立自己的 IG 帳號");
      let row = state.social_story_logs.find(
        (item) => item.account_id === account.id && item.story_date === input.story_date,
      );
      if (!row) {
        row = {
          id: uid(),
          account_id: account.id,
          team_id: me.team_id,
          owner_id: me.id,
          story_date: input.story_date,
          posted: input.posted,
          story_count: input.story_count,
          source: "manual",
          note: "",
          recorded_by: me.id,
          created_at: nowIso(),
          updated_at: nowIso(),
        };
        state.social_story_logs.push(row);
      } else {
        Object.assign(row, {
          posted: input.posted,
          story_count: input.story_count,
          source: "manual",
          recorded_by: me.id,
          updated_at: nowIso(),
        });
      }
      persist();
      return row;
    },

    async listPosts() {
      const accounts = await this.listSocialAccounts();
      const ids = new Set(accounts.map((item) => item.id));
      return state.social_posts
        .filter((item) => ids.has(item.account_id))
        .sort((a, b) => String(b.published_at).localeCompare(String(a.published_at)));
    },

    async savePost(input) {
      const me = requireProfile();
      const account = ownAccount();
      if (!account) throw new Error("請先建立自己的 IG 帳號");
      const row = {
        id: uid(),
        account_id: account.id,
        team_id: me.team_id,
        owner_id: me.id,
        content_type: input.content_type,
        published_at: `${input.published_on}T10:00:00`,
        permalink: input.permalink || null,
        source: "manual",
        external_media_id: null,
        recorded_by: me.id,
        created_at: nowIso(),
        updated_at: nowIso(),
      };
      state.social_posts.unshift(row);
      persist();
      return row;
    },

    async deletePost(id) {
      const me = requireProfile();
      const row = state.social_posts.find((item) => item.id === id);
      if (!row || row.owner_id !== me.id) throw new Error("只能刪除自己的發布紀錄");
      state.social_posts = state.social_posts.filter((item) => item.id !== id);
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
