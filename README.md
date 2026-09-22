# Micy致富計畫 — Fund Ledger（GitHub Pages 版）

單檔 HTML 基金帳本，介面與本機資料由瀏覽器處理，頁面部署在 GitHub Pages；需要同步、行情、OCR、股票搜尋的功能會連到原 WorkBuddy API。

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
GitHub Pages 只提供靜態檔案，**沒有後端**；本版本把需要伺服器的功能改為呼叫原 WorkBuddy API。若該 API 不可用，程式已包好 try/catch，不會當機，只會安靜停用：

| 功能 | 狀態 |
|---|---|
| 交易紀錄、持倉、已實現/未實現損益、淨值圖表 | ✅ 正常 |
| JSON 備份匯出／匯入、CSV 匯出／匯入 | ✅ 正常 |
| 手填「目前淨值」計算市值與浮動盈虧 | ✅ 正常 |
| **即時預估淨值**（依追蹤標的抓行情推算） | ✅ 由 WorkBuddy API 提供 |
| 雲端同步（跨裝置共享） | ✅ 由 WorkBuddy API 提供 |
| 截圖 OCR 匯入持倉、股票搜尋 | ✅ 由 WorkBuddy API 提供 |
| AI 助理 | 已移除 |

GitHub Pages 讓頁面網址穩定，但上述功能仍依賴 WorkBuddy API；如果原 API 再次停止，頁面仍可開啟，但同步、行情、OCR 和股票搜尋會暫時失效。

## 🔑 重要：資料搬遷（新網址不會自動帶舊資料）
這支 app 的資料存在**瀏覽器的 localStorage，並且是「按網址隔離」**的。GitHub Pages 是全新網址＝全新 origin，所以**舊網址 `micyfundledger` 的資料不會自動出現**。請這樣搬：

1. **先讓舊網址復活**：在 WorkBuddy App 對 `fund-ledger.html` 點「發布」，子網域填/保留 `micyfundledger` → 發布。
2. 開 `https://micyfundledger.bj3.agentos-app.net`，確認你的交易紀錄回來了。
3. 在 app 內用 **備份／匯出 JSON**，下載備份檔（檔名像 `基金交易簿備份-2026-09-22.json`）。
4. 開新的 GitHub Pages 網址 → 用 **匯入 JSON 備份** 把資料匯入。
5. 之後就固定用 GitHub 網址，資料會存在那個網址底下，長期穩定。

> 若舊網址一直復活不了，資料仍然安全地留在 Safari 裡（伺服器掛掉不會刪掉瀏覽器資料），只是暫時讀不到——等舊網址能開就能匯出。

## 資料安全提醒
- 交易資料同時存在瀏覽器 `localStorage` 與 WorkBuddy 同步服務；GitHub 倉庫不會保存你的帳本內容。
- 多設備使用同一個 Micy 帳號時，頁面會透過 WorkBuddy API 自動拉取/上傳資料；若同時在多台設備編輯，以較新的同步時間為準。
- 換電腦、換瀏覽器或清除網站資料前，請確認同步已完成，並定期匯出 JSON 備份。
- 不要用無痕模式操作；不要清除該網站的瀏覽器資料。
- 已移除騰訊 Beacon 統計腳本；頁面不再向 Beacon 發送訪問資料。
