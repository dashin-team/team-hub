# 南恩團隊 TEAM HUB

團隊數位總部。給約 20～50 位夥伴使用，手機與電腦都開得了。

現在打開就是**示範資料**：公告、投保指南、素材、教材、任務與客戶都可以操作。競賽頁嵌入本季獎勵頁。客戶與任務留在這台瀏覽器。畫面會標示「示範資料」。

要改成大家一起用的雲端版，請看 [docs/SETUP.zh-TW.md](docs/SETUP.zh-TW.md)。只需要 Supabase 的網址和 anon / publishable key。不要把 service_role 放進 `js/config.js`。

公司還沒同意以前，請不要輸入真實客戶資料。

## 本機預覽

在專案資料夾執行：

```bash
python3 -m http.server 4173
```

然後打開 [http://127.0.0.1:4173/](http://127.0.0.1:4173/)。

右上角可以切換示範視角：管理員、主管、一般夥伴。這只影響這台瀏覽器，不是正式權限。正式權限由資料庫決定。

## 網站位置

靜態檔案放在專案根目錄，給 GitHub Pages 使用：

`https://dashin-team.github.io/team-hub/`

推上 `main` 後，由 `.github/workflows/pages.yml` 發布。倉庫的 Pages 來源要選 **GitHub Actions**。

## 更新前端快取版本

改了 `js/` 或 `css/` 之後，請把 `index.html` 裡所有的 `v=20261117o` 換成新的短碼（樣式、進入點、import map 要同一版）。手機裡的舊模組如果和新程式對不上，頁面會停在開啟畫面。版本號不一致時，用頁面上的「重新載入」會帶一個新的網址參數再抓一次。
