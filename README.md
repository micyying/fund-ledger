# Micy致富計畫 — Fund Ledger（GitHub Pages 版）

單檔 HTML 基金帳本，純前端、免後端，可直接放到 GitHub Pages 取得**永久固定網址**（不會像雲端 sandbox 那樣休眠後「伺服器停止響應」）。

## 檔案
- `index.html` — 主程式（含「總覽改用即時預估淨值」修復）
- `.nojekyll` — 避免 GitHub 用 Jekyll 重新處理，請一併上傳
- `README.md` — 本說明

## 部署步驟（約 3 分鐘）
1. 到 https://github.com/new 建立新 repository（例如 `fund-ledger`），**Public**（Private 也能開 Pages，但需付費方案），勾選 Add a README 可省略。
2. 在 repo 頁面點 **Add file → Upload files**，把 `index.html` 與 `.nojekyll` 兩個檔拖進去，Commit。
3. 進 **Settings → Pages**，Source 選 `Deploy from a branch`，Branch 選 `main`、資料夾 `/ (root)`，按 Save。
4. 等 1–2 分鐘，網址就會是：
   `https://<你的帳號>.github.io/fund-ledger/`

之後只要重新上傳 `index.html` 覆蓋，就是**原地更新同一個網址**（這正是之前雲端部署做不到的）。

## ⚠️ 純靜態的先天限制
GitHub Pages 只提供靜態檔案，**沒有後端**，所以下列需要伺服器 `/api/*` 的功能會失效（程式已包好 try/catch，不會當機，只會安靜停用）：

| 功能 | 狀態 |
|---|---|
| 交易紀錄、持倉、已實現/未實現損益、淨值圖表 | ✅ 正常 |
| JSON 備份匯出／匯入、CSV 匯出／匯入 | ✅ 正常 |
| 手填「目前淨值」計算市值與浮動盈虧 | ✅ 正常 |
| **即時預估淨值**（依追蹤標的抓行情推算） | ⚠️ 失效 → 自動退回手填淨值 |
| 雲端同步（跨裝置共享） | ⚠️ 失效 → 資料仍存在本機瀏覽器 |
| 截圖 OCR 匯入持倉、股票搜尋、AI 助理 | ⚠️ 失效（需後端/API key） |

換句話說：搬到 GitHub 換到的是**網址永久穩定**，代價是**即時行情估值**會退回手填。若你想要兩者兼得，我可以另外幫你在前端接一個直接抓行情的備援來源（不需要後端）。

## 🔑 重要：資料搬遷（新網址不會自動帶舊資料）
這支 app 的資料存在**瀏覽器的 localStorage，並且是「按網址隔離」**的。GitHub Pages 是全新網址＝全新 origin，所以**舊網址 `micyfundledger` 的資料不會自動出現**。請這樣搬：

1. **先讓舊網址復活**：在 WorkBuddy App 對 `fund-ledger.html` 點「發布」，子網域填/保留 `micyfundledger` → 發布。
2. 開 `https://micyfundledger.bj3.agentos-app.net`，確認你的交易紀錄回來了。
3. 在 app 內用 **備份／匯出 JSON**，下載備份檔（檔名像 `基金交易簿備份-2026-09-22.json`）。
4. 開新的 GitHub Pages 網址 → 用 **匯入 JSON 備份** 把資料匯入。
5. 之後就固定用 GitHub 網址，資料會存在那個網址底下，長期穩定。

> 若舊網址一直復活不了，資料仍然安全地留在 Safari 裡（伺服器掛掉不會刪掉瀏覽器資料），只是暫時讀不到——等舊網址能開就能匯出。

## 資料安全提醒
- 資料存在**你這台電腦的 Safari**，不是存在 GitHub 上；換電腦、換瀏覽器、或清除瀏覽器網站資料都會看不到（所以請定期用 JSON 備份）。
- 不要用無痕模式操作；不要清除該網站的瀏覽器資料。
- 建議每隔一段時間匯出一次 JSON 備份存到雲端硬碟。
