// 登入帳號對應到 Supabase 的信箱。沒有寄信，只是帳號的內部形式。

export function accountEmail(account) {
  const text = String(account ?? "").trim();
  if (text === "南恩") return "admin@nanen-team.app";
  return `${text.toLowerCase()}@nanen-team.app`;
}
