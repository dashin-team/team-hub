import { accountEmail } from "@hub/account";
import { normalizeEvent } from "@hub/calendar";
import { canViewPerson } from "@hub/metrics";
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm";
import { cleanActions, redactNote, summarizeNoteLocal } from "@hub/contact";
import { FINANCE_FIELDS, normalizeCustomerInput, PROFILE_TEXT_FIELDS, taipeiDay } from "@hub/profile";

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

  function optionalColumnMissing(error) {
    if (!error) return false;
    const message = String(error.message || "");
    const known = /strategy_grid|work_role|income|expense|debt|decision_maker|influence_factor|competitor|\bgrade\b/i.test(message);
    if (!known) return false;
    return error.code === "PGRST204" || error.code === "42703" || /schema cache|does not exist|column/i.test(message);
  }

  async function assignRefCode(id) {
    const compact = String(id || "").replace(/-/g, "").toUpperCase();
    const base = compact.slice(0, 8) || "NEW";
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const ref = `TH-${base}${attempt ? attempt.toString(36).toUpperCase() : ""}`.slice(0, 24);
      const { error } = await sb.from("customers").update({ ref_code: ref }).eq("id", id).is("ref_code", null);
      if (!error) return ref;
      if (error.code !== "23505") return null;
    }
    return null;
  }

  async function writeCustomer(payload, id) {
    const send = (body) => (id
      ? sb.from("customers").update(body).eq("id", id).select().single()
      : sb.from("customers").insert(body).select().single());
    let result = await send(payload);
    if (optionalColumnMissing(result.error)) {
      const rest = { ...payload };
      const message = String(result.error.message || "");
      const optionalKeys = ["strategy_grid", "grade", ...FINANCE_FIELDS];
      const mentioned = optionalKeys.filter((key) => new RegExp(`\\b${key}\\b`, "i").test(message));
      for (const key of (mentioned.length ? mentioned : optionalKeys)) delete rest[key];
      result = await send(rest);
      if (!result.error && result.data) {
        result.data.strategy_grid = payload.strategy_grid || {};
        result.data.strategy_pending = true;
        result.data.fields_pending = true;
      }
    }
    return result;
  }

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

    async signIn(account, password) {
      const email = accountEmail(account);
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error("帳號或密碼錯誤");
      await loadProfile(data.user);
      if (!profile) throw new Error("這個帳號還沒加入團隊。請聯絡管理者。");
      if (!profile.is_active) throw new Error("這個帳號已停用，請聯絡管理者。");
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
      if (error) throw new Error("密碼沒有更新。請用至少 8 個字元，且不要和現在的相同。");
    },

    async setAvatar(blob) {
      if (!profile?.id) throw new Error("請先登入");
      const path = `${profile.id}/avatar.jpg`;
      const { error: uploadError } = await sb.storage.from("avatars").upload(path, blob, {
        upsert: true,
        contentType: "image/jpeg",
        cacheControl: "3600",
      });
      if (uploadError) throw new Error("頭像沒有上傳");
      const { data } = sb.storage.from("avatars").getPublicUrl(path);
      const avatarUrl = `${data.publicUrl}?v=${Date.now()}`;
      const { error } = await sb.from("profiles").update({ avatar_url: avatarUrl }).eq("id", profile.id);
      if (error) throw new Error("頭像沒有儲存");
      profile.avatar_url = avatarUrl;
    },

    async markPasswordChanged() {
      const { error } = await sb.rpc("mark_password_changed");
      if (error) throw new Error("新密碼已設定，但登入狀態沒有更新。請再試一次。");
      if (profile) profile.must_change_password = false;
    },

    async listTeamRoster() {
      const { data, error } = await sb.rpc("team_roster");
      fail(error, "讀取同仁名單時發生問題");
      return data || [];
    },

    async listProfiles() {
      const data = await rows(sb.from("profiles").select("*").order("display_name"), "讀取成員時發生問題");
      if (profile?.role !== "manager") return data;
      return data.filter((item) => canViewPerson(profile, item));
    },

    async createMember(input) {
      const { data, error } = await sb.rpc("admin_create_member", {
        p_display_name: input.display_name,
        p_account: input.account,
        p_grade: input.grade,
        p_zone: input.zone,
        p_role: input.role,
      });
      if (!error) return data;
      const message = String(error.message || "");
      if (message.includes("預設密碼")) throw new Error("還沒設定團隊預設密碼。");
      if (message.includes("已經有人使用")) throw new Error("這個帳號已經有人使用。");
      if (message.includes("管理員")) throw new Error("只有管理員可以新增夥伴。");
      throw new Error(message || "夥伴沒有建立。");
    },

    async removeMember(userId) {
      const { error } = await sb.rpc("admin_remove_member", { target: userId });
      if (!error) return;
      const message = String(error.message || "");
      if (message.includes("自己")) throw new Error("不能刪除自己。");
      if (message.includes("管理員")) throw new Error("不能刪除管理員。");
      throw new Error("夥伴沒有刪除。");
    },

    async resetMemberPassword(userId) {
      const { error } = await sb.rpc("admin_reset_password", { target: userId });
      if (!error) return;
      const message = String(error.message || "");
      if (message.includes("預設密碼")) throw new Error("還沒設定團隊預設密碼。");
      if (message.includes("管理員")) throw new Error("只有管理員可以重設密碼。");
      if (message.includes("自己的密碼")) throw new Error("請用修改密碼來改自己的密碼。");
      throw new Error("密碼沒有重設。");
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
        const patch = {
          is_done: Boolean(input.is_done),
          completed_at: input.is_done ? new Date().toISOString() : null,
          title: input.title,
        };
        if (input.due_date) patch.due_date = input.due_date;
        const { data, error } = await sb.from("tasks").update(patch).eq("id", input.id).select().single();
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

    async listTeammates() {
      const { data, error } = await sb.rpc("team_directory");
      if (!error && Array.isArray(data)) return data;
      return rows(sb.from("profiles").select("id, display_name").order("display_name"), "讀取夥伴時發生問題");
    },

    async listCalendarEvents() {
      const data = await rows(sb.from("calendar_events").select("*").order("event_date"), "讀取行事曆時發生問題");
      if (profile?.role !== "manager") return data;
      const people = await this.listProfiles();
      return data.filter((item) => item.owner_id === profile.id || canViewPerson(profile, people.find((person) => person.id === item.owner_id)));
    },

    async saveCalendarEvent(input) {
      const norm = normalizeEvent(input);
      if (norm.error) throw new Error(norm.error);
      const payload = {
        ...norm.fields,
        team_id: profile.team_id,
        owner_id: profile.id,
      };
      if (input.id) {
        const { data, error } = await sb.from("calendar_events").update(payload).eq("id", input.id).select().single();
        fail(error, "活動沒有更新");
        return data;
      }
      const { data, error } = await sb.from("calendar_events").insert(payload).select().single();
      fail(error, "活動沒有新增");
      return data;
    },

    async deleteCalendarEvent(id) {
      const { error } = await sb.from("calendar_events").delete().eq("id", id);
      fail(error, "活動沒有刪除");
    },

    async deleteCustomer(id) {
      const { error } = await sb.from("customers").delete().eq("id", id).eq("owner_id", profile.id);
      fail(error, "客戶沒有刪除");
    },

    async listCustomers() {
      const data = await rows(sb.from("customers").select("*").order("display_name"), "讀取客戶時發生問題");
      if (profile?.role !== "manager") return data;
      const people = await this.listProfiles();
      return data.filter((item) => item.owner_id === profile.id || canViewPerson(profile, people.find((person) => person.id === item.owner_id)));
    },

    async saveCustomer(input) {
      const norm = normalizeCustomerInput(input);
      if (norm.error) throw new Error(norm.error);
      if (input.owner_id && input.owner_id !== profile.id) throw new Error("只能維護自己的客戶");
      const payload = {
        team_id: profile.team_id,
        owner_id: profile.id,
        display_name: norm.fields.display_name,
        phone: norm.fields.phone || null,
        email: (input.email || "").trim() || null,
        preferred_contact: input.preferred_contact || null,
        service_tags: input.service_tags || [],
        birthday_md: norm.fields.birthday_md,
        birth_date: norm.fields.birth_date,
        gender: norm.fields.gender,
        relation_social: norm.fields.relation_social,
        relation_business: norm.fields.relation_business,
        is_archived: Boolean(input.is_archived),
        grade: norm.fields.grade,
        privacy_notice_recorded_at: new Date().toISOString(),
      };
      for (const key of PROFILE_TEXT_FIELDS) payload[key] = norm.fields[key] || null;
      payload.strategy_grid = norm.fields.strategy_grid || {};
      const written = await writeCustomer(payload, input.id || "");
      fail(written.error, input.id ? "客戶沒有更新" : "客戶沒有新增");
      const data = written.data;
      if (input.id) return data;
      if (data && !data.ref_code) data.ref_code = await assignRefCode(data.id);
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
      if (!ownerId || ownerId !== profile.id) throw new Error("只能維護自己的客戶");
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
      if (!ownerId || ownerId !== profile.id) throw new Error("只能維護自己的客戶");
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

    async listContactLogs(customerId) {
      let query = sb.from("contact_logs").select("*").order("log_date", { ascending: false }).order("created_at", { ascending: false });
      if (customerId) query = query.eq("customer_id", customerId);
      const { data, error } = await query;
      if (error && /contact_logs|schema cache|does not exist|42P01/i.test(`${error.message || ""} ${error.code || ""}`)) return [];
      fail(error, "讀取聯絡紀錄時發生問題");
      const rowsOut = data || [];
      if (profile?.role !== "manager") return rowsOut;
      const people = await this.listProfiles();
      return rowsOut.filter((item) => item.owner_id === profile.id || canViewPerson(profile, people.find((person) => person.id === item.owner_id)));
    },

    async saveContactLog(input) {
      if (input.owner_id && input.owner_id !== profile.id) throw new Error("只能維護自己的客戶");
      const actions = cleanActions(input.actions);
      const note = String(input.note || "").trim().slice(0, 4000);
      const summary = String(input.summary || "").trim().slice(0, 2000);
      if (!actions.length && !note) throw new Error("請先選今天做了什麼，或寫一句備註。");
      const { data, error } = await sb.from("contact_logs").insert({
        team_id: profile.team_id,
        owner_id: profile.id,
        customer_id: input.customer_id,
        log_date: taipeiDay(),
        actions,
        note,
        summary,
      }).select().single();
      fail(error, "聯絡紀錄沒有儲存");
      return data;
    },

    async summarizeContactNote(note, customer) {
      const redacted = redactNote(note, customer);
      try {
        const { data, error } = await sb.functions.invoke("summarize-note", { body: { note: redacted } });
        if (!error && data?.summary && !data.fallback) return { summary: String(data.summary).trim(), demo: false };
      } catch {
        /* 沒有密鑰或函式還沒部署時，改用本機整理。 */
      }
      return { summary: summarizeNoteLocal(note), demo: true };
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

    async listMemberActivity() {
      const { data, error } = await sb.rpc("admin_member_activity");
      if (error) return [];
      return data || [];
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
