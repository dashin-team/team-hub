// 管理員邀請夥伴。只在 Supabase Edge Function 執行。
// SUPABASE_SERVICE_ROLE_KEY 由平台注入，不要寫進程式、不要放進 GitHub。
// 這個函式尚未串接 Instagram。Meta 權杖以後也只能放在這裡的密鑰。

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const ROLES = new Set(["admin", "manager", "member"]);

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function isEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 200;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "只接受 POST" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !anonKey || !serviceKey) {
    return json({ error: "伺服器還沒設定完成" }, 500);
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ error: "請先登入" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "登入狀態無效" }, 401);

  const { data: me, error: meError } = await userClient
    .from("profiles")
    .select("id, team_id, role, is_active")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (meError || !me || !me.is_active || me.role !== "admin") {
    return json({ error: "只有管理員可以邀請或調整帳號" }, 403);
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "內容格式不正確" }, 400);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const action = body.action === "update_member" ? "update_member" : "invite";

  if (action === "invite") {
    const email = String(body.email ?? "").trim().toLowerCase();
    const displayName = String(body.display_name ?? "").trim();
    const role = String(body.role ?? "member");
    if (!isEmail(email)) return json({ error: "請填寫有效的電子郵件" }, 400);
    if (displayName.length < 1 || displayName.length > 80) {
      return json({ error: "請填寫姓名" }, 400);
    }
    if (!ROLES.has(role)) return json({ error: "角色不正確" }, 400);

    const siteUrl = Deno.env.get("SITE_URL") || "https://dashin-team.github.io/team-hub/";
    const { data: invited, error: inviteError } = await admin.auth.admin.inviteUserByEmail(email, {
      data: { display_name: displayName },
      redirectTo: siteUrl,
    });
    if (inviteError || !invited.user) {
      const message = inviteError?.message || "";
      if (/already/i.test(message)) return json({ error: "這個信箱已經有帳號" }, 409);
      return json({ error: "邀請信沒有寄出，請稍後再試" }, 400);
    }

    const { error: profileError } = await admin.from("profiles").insert({
      id: invited.user.id,
      team_id: me.team_id,
      display_name: displayName,
      email,
      role,
      is_active: true,
    });
    if (profileError) {
      return json({ error: "帳號已建立，但團隊資料沒寫入。請聯絡技術協助，不要重複邀請。" }, 500);
    }
    return json({ ok: true, user_id: invited.user.id });
  }

  const userId = String(body.user_id ?? "");
  const role = body.role == null ? null : String(body.role);
  const isActive = body.is_active;
  if (!/^[0-9a-f-]{36}$/i.test(userId)) return json({ error: "找不到這位夥伴" }, 400);
  if (role != null && !ROLES.has(role)) return json({ error: "角色不正確" }, 400);
  if (isActive != null && typeof isActive !== "boolean") {
    return json({ error: "啟用狀態不正確" }, 400);
  }

  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id, team_id, role, is_active")
    .eq("id", userId)
    .maybeSingle();
  if (targetError || !target || target.team_id !== me.team_id) {
    return json({ error: "只能調整自己團隊的夥伴" }, 403);
  }

  const nextRole = role ?? target.role;
  const nextActive = typeof isActive === "boolean" ? isActive : target.is_active;
  const removesAdmin = target.role === "admin" && target.is_active && (nextRole !== "admin" || !nextActive);
  if (removesAdmin) {
    const { count } = await admin
      .from("profiles")
      .select("id", { count: "exact", head: true })
      .eq("team_id", me.team_id)
      .eq("role", "admin")
      .eq("is_active", true)
      .neq("id", target.id);
    if (!count) return json({ error: "團隊至少要留一位啟用中的管理員" }, 400);
  }

  const { error: updateError } = await admin
    .from("profiles")
    .update({ role: nextRole, is_active: nextActive })
    .eq("id", target.id);
  if (updateError) return json({ error: "沒有更新成功" }, 400);

  if (!nextActive) {
    await admin.auth.admin.updateUserById(target.id, { ban_duration: "876000h" });
  } else if (target.is_active === false && nextActive) {
    await admin.auth.admin.updateUserById(target.id, { ban_duration: "none" });
  }

  return json({ ok: true });
});
