# Micy致富計畫 — Fund Ledger（GitHub Pages 版）

單檔 HTML 基金帳本，介面與本機資料由瀏覽器處理，頁面部署在 GitHub Pages；行情與股票搜尋會連到原 WorkBuddy API，OCR 在瀏覽器本機執行。

目前版本：**GitHub版 · v1.6.1**（2026-10-04）。新增「基金透視」，按帳本目前持倉顯示已核對的官方月報主要持倉、比例、資料日期及來源。GitHub Actions 每個工作日核查月報並重新發佈網站；另可自行選擇啟用付費 DeepSeek API，生成有來源連結的公開市場觀察。**AI 更新預設關閉**。此版本不會把使用者的交易或配置上傳至 GitHub。

## 檔案
- `index.html` — 主程式
- `micy-icon.png` — 主屏幕與頁面內使用的滿版圖標
- `micy-icon.svg` — 同款網頁圖標
- `research.json` — 只有官方公開的基金月報資料，沒有個人帳本內容
- `analysis.json` — 可選的公開市場觀察；尚未啟用時是空內容
- `scripts/update_research.py`、`scripts/update_analysis.py`、`.github/workflows/update-research.yml` — 自動核查月報，選擇性生成 AI 研究並直接發佈 Pages
- `.nojekyll` — 避免 GitHub 用 Jekyll 重新處理，請一併上傳
- `README.md` — 本說明

## 現有倉庫部署
倉庫是 [`micyying/fund-ledger`](https://github.com/micyying/fund-ledger)，網站是 https://micyying.github.io/fund-ledger/ 。此版本須在 **Settings → Pages → Build and deployment → Source** 改選 **GitHub Actions**，再於 **Actions** 手動執行一次 `Update public fund research`。以後推送 `main` 或週一至週五的定時更新，都會由同一個 workflow 發佈 Pages。不要再選「Deploy from a branch」：GitHub 官方說明，由 workflow 的 `GITHUB_TOKEN` 推送的 commit 不會觸發分支型 Pages 建置。

## ⚠️ 純靜態的先天限制
GitHub Pages 只提供靜態檔案，**沒有後端**；行情與股票搜尋仍呼叫原 WorkBuddy API。若該 API 不可用，相關功能會停用：

| 功能 | 狀態 |
|---|---|
| 交易紀錄、持倉、已實現/未實現損益、淨值圖表 | ✅ 正常 |
| 資料表（配置計畫、基金持倉、銀行／平台彙總、每月資金進出） | ✅ 正常；現金流與投資報酬分開呈現 |
| 圖表總覽（持倉配置、最近六個交易月份的資金淨流入） | ✅ 正常；不同幣種分開顯示 |
| 基金透視（公開月報主要持倉） | ✅ 已核對五檔基金；每個工作日自動檢查月報，列明報告日期及來源。需啟用 GitHub Actions |
| 近期市場觀察 | 可選：啟用 DeepSeek API 後每個工作日根據已核對的官方月報產生附來源的 AI 解讀（沒有即時新聞搜尋）；不保證有當日基金淨值，也不會把新聞直接斷言為漲跌原因 |
| 自訂配置計畫與回升觀察提醒 | ✅ 開啟帳本時檢查已儲存淨值；需先分類基金、補齊淨值及換算匯率 |
| JSON 備份匯出／匯入、CSV 匯出／匯入 | ✅ 正常 |
| 手填「目前淨值」計算市值與浮動盈虧 | ✅ 正常 |
| **即時預估淨值**（依追蹤標的抓行情推算） | ✅ 由 WorkBuddy API 提供 |
| 雲端同步（跨裝置共享） | ⛔ 舊固定同步代碼已停用；需要有身分驗證的新後端 |
| 截圖 OCR 匯入持倉 | ✅ 在瀏覽器本機辨識（Tesseract.js） |
| 股票搜尋 | ⚠️ 常用標的可本機搜尋；完整搜尋需後端跨域代理 |
| 舊版 AI 助理 | 已移除；新增的公開研究摘要與私人帳本隔離 |
| 備份提醒 | ✅ 每週一、五開啟並解鎖帳本時提醒 |

備份請優先下載 **JSON**：它包含交易、目前淨值、基金名稱、價格歷史、追蹤設定和配置計畫；CSV 只匯出交易欄位，適合用試算表檢視，不應作為唯一備份。兩種檔案都不包含解鎖密碼，也都可能含私人財務資料，請妥善保存。

GitHub Pages 讓頁面網址穩定，但目前原 WorkBuddy API 沒有允許 GitHub Pages 跨域請求的回應標頭。跨設備同步還需要有身分驗證與資料保護的新後端；不能再用公開的固定同步代碼。完整股票搜尋仍需要後端跨域代理。OCR 已改為在瀏覽器本機執行，不會把截圖上傳到 WorkBuddy。

## 基金透視的資料邊界

此分頁只根據帳本本機持倉決定要顯示哪些公開基金資料；公開程式碼中只有基金公司月報的主要持倉快照，不含用戶的交易、金額或帳號。初版核對了 `U50005`、`U50011`、`U45076`、`U50004`、`U50009`。每張卡片均標示資料截至日期並連到基金公司月報。開啟 App 時會讀取同一網站上的 `research.json`；若讀取失敗，會明示使用內建快照。官方月報網址可能更新，因此頁內舊快照和連結中的最新月報可能不同，以最新官方文件為準。前六大持倉並不是完整組合，也不等於使用者個人資產配置。當日基金淨值與當日新聞未經驗證時，程式不會提供虛假的「今日漲跌原因」或確定的價格趨勢。

GitHub Actions 排程可能延遲，基金公司通常按月發佈持倉，並非每天更新成份。自動核查一旦遇到來源無法下載、基金名稱／日期不符、或持倉格式改變，更新會中止並保留上一版資料；網站不會把舊月報冒充成當日成份。倉庫需允許此 workflow 的 Contents 寫入和 Pages 部署。可在 Actions 手動執行 `Update public fund research` 驗證第一次更新。

### 啟用公開市場 AI 摘要（選擇性付費）

1. 在 [DeepSeek 開放平台](https://platform.deepseek.com/) 建立 API key 並確認 API 帳戶餘額。不要把 key 寫入 HTML、公開倉庫、JSON 備份或聊天訊息。
2. 到倉庫 **Settings → Secrets and variables → Actions → Repository secrets** 建立 `DEEPSEEK_API_KEY`。在 **Repository variables** 將 `ENABLE_AI_RESEARCH` 設為 `true`。沒有明確啟用時不會進行付費呼叫。舊 `OPENAI_API_KEY` 不再使用，可刪除。
3. 可選：設定 Repository variable `DEEPSEEK_MODEL`；預設 `deepseek-flash`。模型名稱須以 [DeepSeek 官方文件](https://api-docs.deepseek.com/api/create-chat-completion/) 為準。
4. 在 **Actions → Update public fund research → Run workflow** 執行一次。成功後 `analysis.json` 隨網站發佈。之後工作日香港時間約 21:25 更新；排程可能延遲。停止付費更新可將 `ENABLE_AI_RESEARCH` 改為 `false`。

每次執行最多一次 DeepSeek Chat Completions API 請求；同一香港日期已有 DeepSeek 摘要便略過。API 費用按模型和 token 用量計算，以 [官方定價](https://api-docs.deepseek.com/quick_start/pricing) 為準。請求由 GitHub 雲端執行，不需要手機開著或連 VPN。

**此版沒有即時新聞搜尋。** DeepSeek 接口不能直接使用原 OpenAI Responses 的 `web_search` 工具，因此只解讀已核對的官方月報快照；不提供最新 NAV、今日漲跌原因或假冒最新新聞。若要恢復新聞摘要，需另外接入新聞／搜尋來源。來源連結由程式從月報快照加入，不採用模型生成的 URL。只傳公開基金資料，不讀取私人帳本、交易、金額或密碼。AI 解讀仍可能出錯，應按月報原文核對。失敗時保留上次摘要並顯示其原有日期。

## 解鎖密碼

GitHub 版首次在每個瀏覽器開啟時，請設定一個**與舊版不同**、至少 12 字元的新密碼。密碼不寫入 HTML 或 GitHub；瀏覽器只保存用隨機鹽值與 PBKDF2 產生的驗證資料。重新整理頁面仍需輸入密碼，但設定新密碼不會清除這個瀏覽器原有的帳本資料。不同裝置目前各自設定密碼，資料也不會自動同步。

這只是瀏覽器內的畫面鎖；帳本資料仍以未加密形式保存在該網站的 localStorage。舊版密碼及舊同步代碼曾經出現在公開倉庫的歷史版本中，不能再把它們當作秘密使用；如舊後端仍在儲存私人資料，需另行撤銷舊同步代碼並保護或刪除伺服器上的資料。更新目前的 HTML 不會抹去 GitHub 歷史紀錄。

## 使用 OCR 與股票搜尋

1. 進入「資產總覽」→ 選擇基金 →「十大持倉」→「從截圖匯入」，上傳銀行 App 或基金頁面的持倉截圖；可一次選多張，辨識後逐行檢查名稱、代碼和百分比，再儲存。
2. OCR 第一次使用會在瀏覽器下載語言模型，之後在本機辨識；圖片不會上傳到 WorkBuddy。圖片請盡量清晰，並包含「股票名稱＋百分比」；辨識不準時可直接手動修正。
3. 在同一個「十大持倉」設定畫面，於「搜尋標的（股票／指數）」輸入名稱或代碼後按「搜尋」。常用港股、A 股、美股與指數可直接由內建目錄找到；其他標的則需要後端搜尋跨域代理正常運作。

## 備份提醒

每週一、五開啟並解鎖帳本時，頁面會彈出備份提醒；可直接下載 JSON 備份，也可按「允許系統通知」。提醒使用本機日期，並按版本號記錄，升級後會重新判斷當天是否需要提醒。由於 GitHub Pages 是靜態頁面，頁面完全關閉時無法在背景自行彈出通知。

## 🔑 重要：資料搬遷（新網址不會自動帶舊資料）
這支 app 的資料存在**瀏覽器的 localStorage，並且是「按網址隔離」**的。GitHub Pages 是全新網址＝全新 origin，所以**舊網址 `micyfundledger` 的資料不會自動出現**。請這樣搬：

1. **先讓舊網址復活**：在 WorkBuddy App 對 `fund-ledger.html` 點「發布」，子網域填/保留 `micyfundledger` → 發布。
2. 開 `https://micyfundledger.bj3.agentos-app.net`，確認你的交易紀錄回來了。
3. 在 app 內用 **備份／匯出 JSON**，下載備份檔（檔名像 `基金交易簿備份-2026-09-22.json`）。
4. 開新的 GitHub Pages 網址 → 先設定此瀏覽器的新密碼，再用 **匯入 JSON 備份** 把資料匯入。
5. 之後就固定用 GitHub 網址，資料會存在那個網址底下，長期穩定。

> 若舊網址一直復活不了，資料仍然安全地留在 Safari 裡（伺服器掛掉不會刪掉瀏覽器資料），只是暫時讀不到——等舊網址能開就能匯出。

## 資料安全提醒
- 交易資料目前保存在瀏覽器 `localStorage`；GitHub 倉庫不會保存你的帳本內容。
- 配置計畫的基金分類、觀察淨值與換算匯率也只存在該瀏覽器，並會隨 JSON 備份匯出；清除網站資料前請先備份。頁面原始碼中可看到預設的四類目標區間，但看不到你的實際持倉或自訂觀察價。
- 在建好有身分驗證的新後端前，GitHub 網址不會跨設備同步；請先使用 JSON 備份搬遷資料。
- 換電腦、換瀏覽器或清除網站資料前，請定期匯出 JSON 備份。
- 不要用無痕模式操作；不要清除該網站的瀏覽器資料。
- 已移除騰訊 Beacon 統計腳本；頁面不再向 Beacon 發送訪問資料。
