// 把 FBFLI 備註整理成重點。只在 Supabase Edge Function 執行。
// OPENAI_API_KEY 要用 supabase secrets set 放在伺服器，不要寫進這個檔案、不要放進 GitHub、不要送到瀏覽器。
// 尚未部署。沒有密鑰時回 fallback，讓前端用本機規則。

import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function redact(note: string) {
  return String(note || "")
    .replace(/0\d[\d\-\s]{7,}\d/g, "")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
    .slice(0, 4000);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "只接受 POST" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!supabaseUrl || !anonKey || !authHeader.toLowerCase().startsWith("bearer ")) {
    return json({ error: "請先登入" }, 401);
  }

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: "請先登入" }, 401);

  let payload: { note?: string } = {};
  try {
    payload = await req.json();
  } catch {
    return json({ error: "內容不是 JSON" }, 400);
  }
  const note = redact(payload.note || "");
  if (!note) return json({ error: "沒有備註可以整理" }, 400);

  const apiKey = Deno.env.get("OPENAI_API_KEY") ?? "";
  if (!apiKey) return json({ fallback: true });

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content: "你幫保險業務整理今天跟客戶聊到的重點。用繁體中文，3 到 5 點，每點一行。只寫備註裡有提到的內容，可使用這些開頭：家人近況、在意的事、答應他的事、下次聯絡時間。沒提到的類別不要寫，也不要補姓名、電話或新的事實。",
        },
        { role: "user", content: note },
      ],
    }),
  });
  if (!response.ok) return json({ fallback: true });
  const body = await response.json();
  const summary = String(body?.choices?.[0]?.message?.content || "").trim();
  if (!summary) return json({ fallback: true });
  return json({ summary, fallback: false });
});
