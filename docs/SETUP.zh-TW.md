# 南恩團隊 TEAM HUB 設定說明

這份是給團隊負責人看的。網站可以先用示範資料，不必立刻註冊；要讓 20～50 位夥伴各自登入，再照下面做。

做完之前，請先用虛構客戶練習。公司還沒同意以前，不要輸入真實客戶的姓名、電話或保單。

## 你會得到什麼

- 一個網址，手機和電腦都能開。
- 每位夥伴自己的帳號。管理員發邀請，夥伴自己設密碼。
- 客戶、提醒、教材、公告和 IG 回報會存在雲端。
- 夥伴只能看到自己負責的客戶和自己的社群紀錄。主管看得到整個南恩團隊，看不到別的團隊。

## 1. 建立雲端資料庫

1. 用瀏覽器打開 [https://supabase.com/dashboard](https://supabase.com/dashboard)，用你的信箱註冊並登入。
2. 點 **New project**。名稱可以叫 `team-hub`。資料庫密碼請記在只有你知道的地方，不要貼到群組或 GitHub。
3. 區域選離台灣較近的，例如新加坡或東京。免費方案就可以開始。
4. 等專案建立完成。

## 2. 建立資料表

1. 左側點 **SQL Editor**，再點 **New query**。
2. 打開這個專案的 `supabase/migrations/202411170001_base.sql`，全選複製，貼上，按 **Run**。
3. 看到成功之後，再新開一個查詢，貼上 `supabase/migrations/202411170002_social.sql`，再按 **Run**。
4. 兩份都只要執行一次。不要把 `scripts/` 裡的測試檔貼進去。

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

## 7. 邀請夥伴

網頁上的「邀請」需要一支只活在伺服器的小程式。請有人用終端機，在專案資料夾執行（需要先安裝並登入 Supabase CLI）：

```bash
npx supabase login
npx supabase link --project-ref 你的專案代碼
npx supabase functions deploy admin-invite
```

專案代碼在 Supabase 的 Project Settings → General。  
`SUPABASE_SERVICE_ROLE_KEY` 由 Supabase 自己帶進這支程式，不要寫進 `config.js`，也不要貼到聊天室。

部署完成後：

1. 用你的信箱到網站登入。
2. 打開 **團隊成員**，填夥伴的姓名、公司信箱和角色，寄出邀請。
3. 夥伴到信箱點邀請信，設定密碼，就能登入。
4. 忘記密碼用登入頁的「忘記密碼」。

角色只有三種：

- **管理員**：邀請、停用、調整角色，並看團隊客戶與社群。
- **主管**：看團隊客戶與社群，可發公告、教材和素材。不能邀請。
- **一般夥伴**：只看自己的客戶、任務、提醒和社群紀錄。

停用帳號也在團隊成員頁。至少要留下一位啟用中的管理員。

## 8. 夥伴開始用

請每位夥伴：

1. 打開網站並登入。
2. 到 **社群追蹤** 填自己的 IG 帳號名稱。不要填密碼。
3. 每天下班前回報今天有沒有發限動。
4. 每週更新一次粉絲數。同一天再送出，會改掉當天那一筆，不會重複。
5. 有發貼文或 Reels 就補一筆，連結要是 `https://` 開頭。

建議起步，不是業績規定：每週貼文 2 則、Reels 1 則、限動 5 天。粉絲少不代表沒有在服務客戶。

## 以後才做：Instagram 自動同步

這一版不會自動抓 IG。原因是官方 API 只開放給符合資格的商業帳號或創作者帳號，還要通過 Meta 審核，個人帳號通常抓不到。

以後若要做，請遵守這幾件事：

- 只走 Meta 官方 API，不爬蟲、不跟夥伴要 IG 密碼。
- 授權得到的 token 只放在 Supabase Edge Function 的密鑰，不放進網頁、GitHub、一般資料表或瀏覽器。
- 授權過期時，畫面顯示「需重新授權」，手動回報仍然可用。
- 限動有時效，手動每日回報要留著。

## 安全提醒

- 不要把客戶名單、密碼、service_role、資料庫密碼上傳到 GitHub，也不要貼到聊天室。截圖前遮住這些內容。
- 素材檔案若要上傳，請用非公開的空間。這一版先用核准過的 https 連結。
- 定期看成員名單，人離開團隊就停用帳號。
