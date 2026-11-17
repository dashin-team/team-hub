import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm";

function fail(error, fallback) {
  if (!error) return;
  if (error.code === "23505") throw new Error("這一筆和已有的資料重複了。同一天的限動或粉絲數會直接更新，請再送出一次。");
  if (error.code === "23514") throw new Error("有欄位不符合格式，請再檢查一次。");
  if (error.code === "42501" || /row-level security|permission denied/i.test(error.message || "")) {
    throw new Error("你沒有權限做這件事。");
  }
  throw new Error(fallback);
}

async function rows(query, fallback) {
  const { data, error } = await query;
  fail(error, fallback);
  return data || [];
}

export function createCloudStore(url, anonKey) {
  const sb = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });
  let profile = null;
  const listeners = new Set();

  function emit() {
    listeners.forEach((fn) => fn(profile));
  }

  async function loadProfile(user) {
    if (!user) {
      profile = null;
      return null;
    }
    const { data, error } = await sb.from("profiles").select("*").eq("id", user.id).maybeSingle();
    fail(error, "讀取個人資料時發生問題");
    profile = data;
    return data;
  }

  sb.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") {
      profile = null;
      emit();
    }
    if (event === "PASSWORD_RECOVERY") {
      listeners.forEach((fn) => fn(profile, "recovery"));
    }
    if (session?.user && event !== "PASSWORD_RECOVERY") {
      loadProfile(session.user).then(() => emit()).catch(() => emit());
    }
  });

  return {
    mode: "cloud",
    teamName: "南恩團隊",
    sb,

    get profile() {
      return profile;
    },

    onChange(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    async init() {
      const { data, error } = await sb.auth.getSession();
      fail(error, "無法連上登入服務");
      if (data.session?.user) await loadProfile(data.session.user);
    },

    async signIn(email, password) {
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error) {
        if (/invalid login/i.test(error.message)) throw new Error("信箱或密碼不正確。");
        if (/email not confirmed/i.test(error.message)) throw new Error("請先到信箱點開邀請信，完成確認後再登入。");
        throw new Error("登入沒有成功，請稍後再試。");
      }
      await loadProfile(data.user);
      if (!profile) throw new Error("這個帳號還沒加入團隊。請請管理員重新邀請，或用 SQL 建立管理員資料。");
      if (!profile.is_active) throw new Error("這個帳號已停用，請聯絡管理員。");
      return profile;
    },

    async signOut() {
      await sb.auth.signOut();
      profile = null;
    },

    async requestPasswordReset(email) {
      const redirectTo = `${location.origin}${location.pathname}`;
      const { error } = await sb.auth.resetPasswordForEmail(email.trim(), { redirectTo });
      if (error) throw new Error("重設信沒有寄出，請確認信箱是否正確。");
    },

    async updatePassword(password) {
      const { error } = await sb.auth.updateUser({ password });
      if (error) throw new Error("密碼沒有更新，請改用至少 6 個字元再試一次。");
    },

    async listProfiles() {
      return rows(sb.from("profiles").select("*").order("display_name"), "讀取成員時發生問題");
    },

    async listAnnouncements() {
      return rows(sb.from("announcements").select("*").order("created_at", { ascending: false }), "讀取公告時發生問題");
    },

    async saveAnnouncement(input) {
      const me = profile;
      const payload = {
        team_id: me.team_id,
        title: input.title.trim(),
        body: input.body.trim(),
        published_at: input.publish ? new Date().toISOString() : null,
        created_by: me.id,
      };
      const { data, error } = await sb.from("announcements").insert(payload).select().single();
      fail(error, "公告沒有儲存");
      return data;
    },

    async listAssets() {
      return rows(sb.from("assets").select("*").order("created_at", { ascending: false }), "讀取素材時發生問題");
    },

    async saveAsset(input) {
      const { data, error } = await sb.from("assets").insert({
        team_id: profile.team_id,
        title: input.title.trim(),
        category: input.category.trim(),
        description: (input.description || "").trim(),
        external_url: input.external_url?.trim() || null,
        is_published: true,
        created_by: profile.id,
      }).select().single();
      fail(error, "素材沒有儲存");
      return data;
    },

    async listCourses() {
      return rows(sb.from("courses").select("*").order("sort_order"), "讀取教材時發生問題");
    },

    async saveCourse(input) {
      const { data, error } = await sb.from("courses").insert({
        team_id: profile.team_id,
        title: input.title.trim(),
        description: (input.description || "").trim(),
        content_url: input.content_url?.trim() || null,
        sort_order: 100,
        is_published: true,
        created_by: profile.id,
      }).select().single();
      fail(error, "教材沒有儲存");
      return data;
    },

    async listProgress() {
      return rows(sb.from("course_progress").select("*"), "讀取學習進度時發生問題");
    },

    async setCourseComplete(courseId, done) {
      if (!done) {
        const { error } = await sb.from("course_progress").delete().eq("course_id", courseId).eq("member_id", profile.id);
        fail(error, "沒有取消完成");
        return;
      }
      const { error } = await sb.from("course_progress").upsert({
        course_id: courseId,
        member_id: profile.id,
        completed_at: new Date().toISOString(),
      }, { onConflict: "course_id,member_id" });
      fail(error, "沒有標記完成");
    },

    async listTasks() {
      return rows(sb.from("tasks").select("*").order("created_at", { ascending: false }), "讀取任務時發生問題");
    },

    async saveTask(input) {
      if (input.id) {
        const { data, error } = await sb.from("tasks").update({
          is_done: Boolean(input.is_done),
          completed_at: input.is_done ? new Date().toISOString() : null,
          title: input.title,
        }).eq("id", input.id).select().single();
        fail(error, "任務沒有更新");
        return data;
      }
      const { data, error } = await sb.from("tasks").insert({
        team_id: profile.team_id,
        owner_id: profile.id,
        title: input.title.trim(),
        due_date: input.due_date || null,
        is_done: false,
      }).select().single();
      fail(error, "任務沒有新增");
      return data;
    },

    async deleteTask(id) {
      const { error } = await sb.from("tasks").delete().eq("id", id);
      fail(error, "任務沒有刪除");
    },

    async listCustomers() {
      return rows(sb.from("customers").select("*").order("display_name"), "讀取客戶時發生問題");
    },

    async saveCustomer(input) {
      const payload = {
        team_id: profile.team_id,
        owner_id: input.owner_id || profile.id,
        display_name: input.display_name.trim(),
        phone: (input.phone || "").trim() || null,
        email: (input.email || "").trim() || null,
        preferred_contact: input.preferred_contact || null,
        service_tags: input.service_tags || [],
        birthday_md: input.birthday_md || null,
        notes: (input.notes || "").trim() || null,
        is_archived: Boolean(input.is_archived),
        privacy_notice_recorded_at: new Date().toISOString(),
      };
      if (input.id) {
        const { data, error } = await sb.from("customers").update(payload).eq("id", input.id).select().single();
        fail(error, "客戶沒有更新");
        return data;
      }
      const { data, error } = await sb.from("customers").insert(payload).select().single();
      fail(error, "客戶沒有新增");
      if (data && !data.ref_code) {
        const ref = `TH-${data.id.slice(0, 4).toUpperCase()}`;
        await sb.from("customers").update({ ref_code: ref }).eq("id", data.id);
        data.ref_code = ref;
      }
      return data;
    },

    async listPolicies(customerId) {
      let query = sb.from("policies").select("*").order("expiry_date");
      if (customerId) query = query.eq("customer_id", customerId);
      return rows(query, "讀取保單摘要時發生問題");
    },

    async savePolicy(input) {
      const customerRows = await rows(
        sb.from("customers").select("owner_id").eq("id", input.customer_id).limit(1),
        "找不到客戶",
      );
      const ownerId = customerRows[0]?.owner_id;
      if (!ownerId) throw new Error("找不到客戶");
      const { data, error } = await sb.from("policies").insert({
        team_id: profile.team_id,
        customer_id: input.customer_id,
        owner_id: ownerId,
        policy_category: input.policy_category.trim(),
        insurer_name: (input.insurer_name || "").trim() || null,
        effective_date: input.effective_date || null,
        expiry_date: input.expiry_date || null,
        renewal_reminder_date: input.renewal_reminder_date || null,
        status: input.status || "active",
        reference_last4: input.reference_last4 || null,
        notes: (input.notes || "").trim() || null,
      }).select().single();
      fail(error, "保單摘要沒有儲存");
      return data;
    },

    async deletePolicy(id) {
      const { error } = await sb.from("policies").delete().eq("id", id);
      fail(error, "保單摘要沒有刪除");
    },

    async listServiceRecords(customerId) {
      let query = sb.from("service_records").select("*").order("service_date", { ascending: false });
      if (customerId) query = query.eq("customer_id", customerId);
      return rows(query, "讀取服務紀錄時發生問題");
    },

    async saveServiceRecord(input) {
      const customerRows = await rows(
        sb.from("customers").select("owner_id").eq("id", input.customer_id).limit(1),
        "找不到客戶",
      );
      const ownerId = customerRows[0]?.owner_id;
      if (!ownerId) throw new Error("找不到客戶");
      const { data, error } = await sb.from("service_records").insert({
        team_id: profile.team_id,
        customer_id: input.customer_id,
        owner_id: ownerId,
        service_date: input.service_date,
        service_type: input.service_type,
        summary: input.summary.trim(),
        next_action: (input.next_action || "").trim() || null,
        next_contact_date: input.next_contact_date || null,
      }).select().single();
      fail(error, "服務紀錄沒有儲存");
      return data;
    },

    async deleteServiceRecord(id) {
      const { error } = await sb.from("service_records").delete().eq("id", id);
      fail(error, "服務紀錄沒有刪除");
    },

    async listReminders(customerId) {
      let query = sb.from("reminders").select("*").order("due_at");
      if (customerId) query = query.eq("customer_id", customerId);
      return rows(query, "讀取提醒時發生問題");
    },

    async saveReminder(input) {
      const { data, error } = await sb.from("reminders").insert({
        team_id: profile.team_id,
        owner_id: profile.role === "admin" && input.owner_id ? input.owner_id : profile.id,
        customer_id: input.customer_id || null,
        policy_id: input.policy_id || null,
        kind: input.kind,
        title: input.title.trim(),
        due_at: input.due_at,
        status: "open",
      }).select().single();
      fail(error, "提醒沒有儲存");
      return data;
    },

    async setReminderStatus(id, status) {
      const { error } = await sb.from("reminders").update({ status }).eq("id", id);
      fail(error, "提醒沒有更新");
    },

    async inviteMember(input) {
      const { data, error } = await sb.functions.invoke("admin-invite", { body: { action: "invite", ...input } });
      if (error) {
        let message = "邀請沒有送出。請確認「管理員邀請」功能已經部署。";
        try {
          const body = await error.context?.json?.();
          if (body?.error) message = body.error;
        } catch { /* 保留通用說明 */ }
        throw new Error(message);
      }
      if (data?.error) throw new Error(data.error);
      return data;
    },

    async updateMember(input) {
      const { data, error } = await sb.functions.invoke("admin-invite", {
        body: { action: "update_member", ...input },
      });
      if (error) throw new Error("沒有更新成員。請確認邀請功能已經部署。");
      if (data?.error) throw new Error(data.error);
      return data;
    },
  };
}
