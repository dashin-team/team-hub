# 南恩團隊 TEAM HUB 設定說明

這份是給團隊負責人看的。網站可以先用示範資料，不必立刻註冊；要讓 20～50 位夥伴各自登入，再照下面做。

做完之前，請先用虛構客戶練習。公司還沒同意以前，不要輸入真實客戶的姓名、電話或保單。

## 你會得到什麼

- 一個網址，手機和電腦都能開。
- 每位夥伴自己的帳號。管理員發邀請，夥伴自己設密碼。
- 客戶、提醒、教材和公告會存在雲端。競賽頁顯示本季獎勵網站。
- 夥伴只能看到自己負責的客戶。主管看得到整個南恩團隊，看不到別的團隊。

## 1. 建立雲端資料庫

1. 用瀏覽器打開 [https://supabase.com/dashboard](https://supabase.com/dashboard)，用你的信箱註冊並登入。
2. 點 **New project**。名稱可以叫 `team-hub`。資料庫密碼請記在只有你知道的地方，不要貼到群組或 GitHub。
3. 區域選離台灣較近的，例如新加坡或東京。免費方案就可以開始。
4. 等專案建立完成。

## 2. 建立資料表

1. 左側點 **SQL Editor**，再點 **New query**。
2. 打開這個專案的 `supabase/migrations/202411170001_base.sql`，全選複製，貼上，按 **Run**。
3. 看到成功之後，再新開一個查詢，貼上 `supabase/migrations/202411170002_social.sql`，再按 **Run**。
4. 再貼上 `supabase/migrations/202411170003_client_profile.sql`，按 **Run**。這份加上名單欄位和五項度筆記。
5. 再貼上 `supabase/migrations/202411170004_calendar.sql`，按 **Run**。這份是行事曆。
6. 再貼上 `supabase/migrations/202411170005_calendar_times.sql`，按 **Run**。這份補上開始、結束、陪同和提醒。
7. 五份都只要執行一次。不要把 `scripts/` 裡的測試檔貼進去。
8. 已經上線的資料庫，再執行一次 `supabase/migrations/202411170007_strategy_grid.sql`。這份加上客戶策略分析圖。還沒執行時，其他名單欄位仍可儲存，策略圖要等欄位加上之後才會寫進雲端。
9. 再執行一次 `supabase/migrations/202411170008_admin_reset_password.sql`。這份讓管理員新增、重設、刪除夥伴，並讓主管只看自己區的客戶。執行完後，請自己在 SQL Editor 放入團隊預設密碼，不要把密碼寫進檔案：`insert into private.app_settings (key, value) values ('default_password', '你的預設密碼');`
10. 再執行 `supabase/migrations/202411170009_avatars.sql`（頭像）、`supabase/migrations/202411170010_last_sign_in.sql`（上次登入）、`supabase/migrations/202411170011_client_readonly.sql`（名單寫入只限本人）、`supabase/migrations/202411170012_contact_logs.sql`（FBFLI 紀錄）、`supabase/migrations/202411180001_customer_fields.sql`（財務與決策欄位）、`supabase/migrations/202411180002_customer_grade.sql`（客戶分級）、`supabase/migrations/202411180003_client_types.sql`（客戶類型）。這幾份都還沒套到正式資料庫，請自己執行。整理備註的函式在 `supabase/functions/summarize-note`，要自己部署，並用 `supabase secrets set OPENAI_API_KEY=...` 放鑰匙。沒有鑰匙時畫面會用本機整理，並標「示範模式」。

左側 **Table Editor** 應看得到 `teams`、`profiles`、`customers` 和 `social_accounts` 等資料表。

## 3. 關掉外人自行註冊

1. 左側點 **Authentication** → **Sign In / Providers**（或 Providers）。
2. 打開 Email。
3. 關掉 **Allow new users to sign up**，讓沒有被邀請的人不能自己註冊。
4. 儲存。

## 4. 建立你的管理員帳號

1. **Authentication** → **Users** → **Add user**。
2. 填你的信箱和一組密碼，勾選 **Auto Confirm**，建立。
3. 點進這位使用者，複製 **User UID**（一長串英文與數字）。

回到 **SQL Editor**，貼上下面這段，把兩處括號裡的內容換成你的 UID 和信箱，再按 Run：

```sql
insert into public.teams (id, name)
values ('11111111-1111-4111-8111-111111111111', '南恩團隊');

insert into public.profiles (id, team_id, display_name, email, role, is_active)
values (
  '這裡貼上 User UID',
  '11111111-1111-4111-8111-111111111111',
  '梁仕翰',
  '這裡貼上你的信箱',
  'admin',
  true
);
```

## 5. 把網站接到資料庫

1. 左側點 **Project Settings**（齒輪）→ **API**。
2. 複製 **Project URL**。
3. 複製 **anon public** 或 **publishable** key。
4. 不要複製 **service_role**。畫面上若寫 secret，就不要複製。
5. 用記事本打開專案裡的 `js/config.js`，填成這樣（保留引號）：

```js
export const SUPABASE_URL = "https://你的專案.supabase.co";
export const SUPABASE_ANON_KEY = "你的 anon key";
```

6. 存檔後上傳到 GitHub。anon key 可以放在網頁設定裡；service_role 不可以。

兩個都留空時，網站會維持示範資料。

## 6. 發布網站

1. 打開 GitHub 這個專案的 **Settings** → **Pages**。
2. **Build and deployment** 的 Source 選 **GitHub Actions**。
3. 程式推上 `main` 之後，Actions 會自動發布。
4. 網址會是：`https://dashin-team.github.io/team-hub/`

第一次若 Actions 失敗，多半是 Pages 還沒改成 GitHub Actions。改好後到 Actions 頁把失敗的那次重跑。

## 7. 新增夥伴

先執行 `supabase/migrations/202411170008_admin_reset_password.sql`，並自己寫入 `private.app_settings` 的 `default_password`。

1. 用管理員帳號登入。
2. 打開 **管理** 或 **同仁名單**，按 **新增夥伴**，填姓名、帳號、職級和區。
3. 夥伴用「帳號」和預設密碼登入，第一次會被要求改密碼。

角色只有三種：

- **管理員**：新增、刪除、重設密碼、調整角色，並看團隊客戶。
- **主管**：看自己區的客戶，可發公告、教材和素材。
- **一般夥伴**：只看自己的客戶、任務和提醒。

刪除夥伴會停用帳號並留下客戶資料。不能刪除自己或管理員。

## 8. 夥伴開始用

請每位夥伴：

1. 打開網站並登入。
2. 到 **競賽** 看本季獎勵。網址寫在 `js/contest.js` 的 `CURRENT_CONTEST`，換季時只改那一處。
3. 若內嵌頁沒有出現，點「富邦 Q4 競賽獎勵」會另開分頁。

## 安全提醒

- 不要把客戶名單、密碼、service_role、資料庫密碼上傳到 GitHub，也不要貼到聊天室。截圖前遮住這些內容。
- 素材檔案若要上傳，請用非公開的空間。這一版先用核准過的 https 連結。
- 定期看成員名單，人離開團隊就停用帳號。
