# 實際驗收記錄

本文保留各階段的歷史驗證結果。最新版本以 examples/web 為唯一正式教材庫並隨 Git 發布；早期的來源教材目錄與轉換流程已移除，不是現行建置前置條件。

日期：2026-10-09（Asia/Taipei）。本機 macOS，Node 24.14.0、npm 11.9.0，Google Chrome 有視窗模式，1440×1000。完整測試程式在 tests/；未使用 mocked VM 代替編輯器驗收。

## 通過

- `npm test`：7 組 Node 測試，包含未設定／不存在／EACCES／空目錄、排序、refresh、預設不遞迴、顯式遞迴、symlink 外逃、字串前綴邊界、非法 ID、檔案大小、損壞 SB3、unsupported extension、原始 binary bytes、protocol payload、攝影機停止與延遲開啟競態。
- `npm run typecheck` 通過。
- `npm run setup` 從兩份 lockfile 乾淨重裝（`npm ci --ignore-scripts`）並重新建置 Scratch 通過；重裝後再次通過 7 組 Node 測試與正式建置。
- Scratch Webpack build 與 `npm run build` 通過；正式 server 由 `npm run start -- --port 3001` 啟動，API 為 Node 動態 route，沒有 static export。
- 開發模式最初 6 組 browser 核心流程全通過；另外真正 ml5 模型測試通過。
- 正式模式完整 9 組 browser tests：**9 passed，52.9 秒**。
- 乾淨重裝後正式模式再次執行主要流程：**2 passed，9.5 秒**（含實際 Music 波形）。
- 正式模式補充 2 組：**2 passed，5.4 秒**；獨立空路徑 server 使用 `SCRATCH_EXAMPLES_DIR='' npm run start -- --port 3002`。

| 驗收 | 實際證據 |
| --- | --- |
| 真正 Scratch workspace | 完整 GUI／renderer／Blockly 顯示；拖曳「移動」積木後真正 VM block 數增加 |
| 唯一範例入口 | iframe 內「範例」精確計數為 1；同網站 native dialog 可開啟 |
| 使用者範例與空狀態 | 28 個真實檔案；另一個正式 Node server 未設定環境路徑時顯示明確空狀態 |
| 作品替換 | 28 課依序透過 UI 載入；角色名稱與所有非 shadow／非內嵌變數 reporter 的可執行 block ID 均與各原始 project.json 一致。Scratch 自行展開的 primitive/shadow 不當成殘留 |
| 舞台與積木顯示 | 實際截圖、VM targets 與 workspace 檢查；非 placeholder 畫面 |
| 競態 | 兩個真實 postMessage load 同時送出，回覆依序 A、B，最後標題與 targets 為 B |
| 未儲存三選項 | 更改名稱後，取消保留作品；直接載入成功；下載後載入產生名稱正確的備份 SB3 |
| 壞檔／unsupported | 本機 invalid.sb3 與 pen fixture 在 VM 之前拒絕；保留原 targets |
| 讀取錯誤 | 瀏覽器網路錯誤注入模擬範例被移除；不破壞目前作品。真實移除後 catalog 更新另有 Node 測試 |
| 備份／VM／復原失敗 | 在真實 VM 上暫時覆寫單一方法以注入 rejection：備份失敗不覆蓋；VM 第一次失敗後真正載入備份；兩次失敗保留可下載的有效 ZIP 備份 |
| 匯出再匯入 | 真實 saveProjectSb3 下載、解析 project.json、重新匯入，角色數與 Music extension 保留 |
| Music | 從 extension library 加入 Music；fixture 真正執行樂器／節奏／鼓／音符，使用者點擊後 AudioContext 為 running，AnalyserNode 量測到非零音訊波形 |
| Handpose 不自動開相機 | 開啟頁面與含 Handpose 作品後，video provider 未啟用 |
| Handpose 啟停／切換 | Chrome fake media；切換作品後 captured tracks 全部 ended、landmarks 清空 |
| 模型失敗 | 刻意中斷模型 network，顯示模型錯誤；非假成功 |
| 模型真正運作 | 未攔截權重請求，ml5 0.12.2 真正下載模型並對 fake video 推論，維持辨識中後可停止；沒有植入手部座標 |
| 權限拒絕 | 在 browser context 對 getUserMedia 注入 NotAllowedError，驗證 GUI provider 錯誤傳播、可讀拒絕訊息與停止。不是實體相機權限視窗人工測試 |
| iframe session | iframe 重載後重新握手；舊 session 的開啟範例通知被忽略 |
| API 防路徑穿越 | HTTP encoded traversal、絕對路徑、無效與不存在 ID 全拒絕；清單不含絕對路徑，Cache-Control: no-store |
| console／network | 核心成功流程無 pageerror、無 HTTP 4xx/5xx。故意注入錯誤的測試另計；相機模型 smoke test 無 requestfailed |

截圖：`output/playwright/editor.png`、`gallery.png`、`empty.png`。機器可讀報告：`production-results.json`、`edge-results.json`（同目錄）。報告與截圖被 Git 忽略，可按 README 重跑產生；正式 SB3 未複製到 tests。

## 過程中發現並修正

- sandbox 啟動伺服器 `listen EPERM`：改在正常本機程序執行，沒有把此環境錯誤視為程式通過。
- Playwright 內建 headless Chromium 顯示「瀏覽器不支援 WebGL」：改用實際已安裝 Chrome 有視窗模式重新驗證，沒有跳過 renderer 檢查。
- GUI 預設 projectId 未指定，停在未載入：明確給官方預設專案 ID 0，ready 等待初始化。
- Root Next request URL 的 host 正規化造成同源 validate 403：改以實際 Host 和 Origin 檢查。
- Music 內建 `note` shadow 誤判 unsupported：補上 Scratch 內建 primitive 類型。
- 自動化第一個 Blockly DOM block 其實位於不可見捲動區：改用明確 `motion_movesteps` 目標；真實拖曳測試已通過。
- 模型啟動排隊後立即停止可能仍要求相機：工作開始前檢查 generation，新增兩個 stop race regression tests。
- yauzl 3.2.0 audit DoS：root 更新至固定 3.4.0，ZIP 與 browser 流程重新驗證。

## 已知警告與未驗證

- 真實手／實體相機辨識品質、不同鏡頭解析度的座標位置、裝置被其他程式占用、Safari／Firefox 與手機未人工驗收。fake video 的模型推論成功**不等於真實手辨識成功**。
- 無裝置／裝置占用分別對 NotFoundError／NotReadableError 提供可讀訊息，但本次未使用實體裝置重現。
- 不宣稱完全離線或雙手辨識。模型與選用 Scratch 素材仍需外部網路。
- Chrome 初次載入有 AudioContext 等待使用者手勢警告，點擊後音訊已驗證。Scratch 重複註冊擴充積木有上游「overwrites prior definition」warning；未觀察到功能錯誤。
- 2026-10-09 npm audit：root 更新後剩 1 low（tsx 間接 esbuild，測試工具）；Scratch package 93 項（12 low／29 moderate／36 high／16 critical，含舊工具鏈）。沒有以破壞相容性的 force-upgrade 消除警示，也未宣稱公網安全認證。
- VM 永遠不 settle 的 Promise 無法安全取消；120 秒後鎖定操作，避免舊 load 與 restore 交錯。已驗證 rejection 復原，未以掛死 VM 模擬測完 120 秒 timeout。

## 手動驗收真實手

1. 在 localhost 開啟網站，載入第 08 課（此時不應要求相機）。
2. 點「開啟相機」，允許權限，等待狀態顯示單手辨識中。
3. 將單手放進鏡頭，觀察 landmark 1／指尖的 getX/getY/getZ；比較 on／on-flipped、ratio 0.75／1 的原版語意。
4. 移開手，確認 reporter 清空；停止／切換作品後確認相機指示燈關閉。
5. 拒絕網站權限與占用裝置後重試，確認可讀錯誤；換瀏覽器時另外驗證音訊及 WebGL。

## 修正：第 28 課由遊戲綠旗啟動相機（2026-10-09）

使用者回報後確認：第 28 課 AI偵測角色只有透明度與座標讀取積木，沒有 videoToggle，依賴 upstream constructor 自動開相機。先前的工具列／模型測試沒有覆蓋這個遊戲啟動相容性，先前的驗收不能作為此流程通過的證據。

現在在 runtime PROJECT_START（綠旗）檢查**目前作品**：有 Handpose 積木且沒有明確 videoToggle 控制時，啟動相機。作品自己有 videoToggle 時尊重其積木控制；只載入作品不啟動；切到普通作品後快取的 extension 不會造成綠旗開相機。停止會撤銷模型等待，重按綠旗會等前一次清理後啟動，不需要再次按工具列。未修改使用者 SB3。

驗證：Scratch 重新建置、TypeScript、8 組 Node 測試通過。3 組 Chrome 瀏覽器 regression tests 全通過（19.6 秒）：模型失敗／停止／切換、權限拒絕、**真實第 28 課按綠旗開相機，模型下載期間重按綠旗、紅色停止、再次執行，以及切換第 01 課後綠旗不再開相機**。使用 fake media 與真正 ml5 模型，未 mock 模型座標；真手精準度仍待人工驗收。報告：output/playwright/greenflag-results.json。


## 全 28 範例介面版面回歸（2026-10-09）

已完成原始 bytes、作品座標／資產欄位，以及 28 × 6 視窗尺寸共 168 組修正前後量測。修正 iframe 最小尺寸與捲動外框後，tests/browser/layout.spec.ts 真實瀏覽器測試通過（30.9 秒測試時間，含啟閉瀏覽器 46.9 秒）；8 組 Node 測試、TypeScript、Scratch／Next 正式建置亦通過。逐檔結果與未涵蓋的像素比對範圍見 [版面檢查](layout-review.md)。

## 修正：重新整理停在「正在準備 Scratch 編輯器…」（2026-10-09）

根因是父頁握手只由 React 的 iframe onLoad 啟動；SSR 產生的 iframe 可能在 Next.js hydration 安裝 listener 之前完成載入，該事件不會重播，甚至沒有啟動原本的 90 秒 timeout。

修正：message listener 安裝完成後立即主動握手，初始化期間每 500ms 以同一 requestId 重試；onLoad 仍處理 iframe 真正重新載入。ready 僅接受一次，成功、90 秒逾時與 effect cleanup 都清除 timer。Strict Mode／Fast Refresh 重播 effect 不再直接 dispose 仍存在的 iframe，文件離開時由 iframe pagehide 清理 VM／相機。

可重現的 regression：先正常開啟，refresh 時暫緩 Next JS 的下載，等待真正 Scratch iframe 完成載入，再釋放 Next JS。修正前 `.editor-status` 持續存在，測試失敗；修正後通過。此測試不 mock VM。

- 開發模式 5 組瀏覽器測試通過：延遲 hydration、連續 3 次整頁刷新及 iframe reload、漏接 ready 回覆後重試且成功後停止探測、原有 SB3 載入／匯出流程、舊 session 隔離。
- 獨立正式伺服器 3103 的 3 組 refresh／握手測試通過（12.5 秒），測試後自動關閉。
- 8 組 Node 測試、TypeScript 與 Next 正式建置通過；Scratch bundle 未修改，不需重建 Scratch。
- 使用者自行啟動的 3000 伺服器未被停止或重新啟動。

測試程式：tests/browser/refresh.spec.ts。報告：output/playwright/refresh-before.json、refresh-final-dev.json、refresh-production.json。

## 網站版第 28 課無手防護與範例庫分離（2026-10-09）

依使用者選擇，保留當時的來源教材，網站改讀 examples/web。兩個目錄的 28 個檔案均核對 SHA-256：原始庫 28/28 與先前稽核一致；網站庫只有第 28 課 project.json 改動，該課所有封裝資產 bytes 仍與原檔相同。重跑當時的轉換流程後 28 份 source/web hash 均未變，可重現。

- 新增 isHandDetected reporter；原座標公式、倍率與第 10 號關節不變。推論改成單一 requestAnimationFrame 循環，移除額外 100ms 等待。
- 網站版第 28 課增加無手防護、動作重設、紅點隱藏／恢復；新增積木所需的間距只在網站副本調整。
- Node 測試 **10 passed**；TypeScript、Scratch build、Next build 通過。
- 開發模式攝影機／第 28 課回歸 **4 passed（47.5 秒）**；包含無手與鍵盤備援、匯出再匯入、綠旗重啟與權限拒絕。
- 正式模式（獨立 3103，測完自動停止）**3 passed（51.0 秒）**：全部 28 個網站範例依序載入；第 28 課可控手勢失去／恢復、第一回合完整作答得分、Blockly 防重疊、匯出再匯入；真正 ml5 模型下載及 fake video 推論。

模型輸出注入僅用於重現確定性的遊戲輸入場景，不代表真人辨識準確度驗收。真實手部辨識品質仍需實體攝影機確認。完整修改界線、使用方式與新增 reporter 的相容性限制見 [手部追蹤修正](hand-tracking-fix.md)。

## Review 缺陷修正回歸（2026-10-09）

完成已核准的 15 點修正／清理，含高優先 SB3 validator/parser 歧義、Host 白名單、iframe reload 操作鎖及真實 BFCache 恢復。Node 測試 16 passed；專屬開發模式 browser tests 9 passed；正式模式完整 27 passed、0 skipped（含 BFCache 與空路徑）。兩階段準備使正常範例每次只驗證一次 ZIP，備份與失敗復原流程仍通過。詳見 [逐項修正與證據](review-remediation.md)。

## 上游原始碼改為下載快取（2026-10-09）

Scratch GUI 不再以 61.55 MB 的重打包 archive 放入 Git。版本控制改保留固定 commit 與官方 codeload SHA-256 manifest、來源取得程式、patch 與授權。prepare 會校驗 `.cache/` 中的 archive，缺失或損毀才下載；下載使用暫存檔，通過完整 hash 後才發布快取。

- 官方 archive 與舊封存檔的 src/static/LICENSE/TRADEMARK 共 **2,065 個檔案逐 byte 一致**。
- 使用新程式從空暫存目錄完成真實下載，校驗 **65,095,197 bytes**；禁止網路的第二次呼叫成功重用快取。
- Node 測試 **18 passed**，新增下載／快取／損毀／checksum mismatch／HTTP failure 回歸；TypeScript 通過。
- Scratch 重建、Next 正式建置通過。
- 最初 smoke test 因使用者的 3000 未啟動而遇到 ERR_CONNECTION_REFUSED；改用獨立 3103 正式 server 後，workspace／範例載入／匯出再匯入 **1 passed（6.0 秒）**，測後已關閉。

## 公開 repo 與部署範例庫（2026-10-09）

README 已改成通用 clone／執行／部署說明，不包含開發者個人絕對路徑。依使用者指示移除舊來源教材與轉換腳本，`examples/web` 的 28 個正式 SB3、manifest 與說明一起納入 Git。預設無環境變數即讀取此目錄；明確空字串仍可停用，自訂絕對路徑仍可覆寫。

- 從暫存區匯出一份只含即將發布檔案的乾淨 checkout，沒有 `.env.local`、舊教材目錄、node_modules 或任何本機快取。
- 在該 checkout 執行完整 `npm run setup`、`npm test`、`npm run build`：安裝／來源下載／兩套建置成功，**18 tests passed**。
- 新增 postbuild 檢查：兩個範例 API 的 tracing 清單都含 **28 個 SB3**；Scratch index、主程式、ml5 與 extension worker 均存在；未把環境檔或下載快取加入 API trace。
- 從乾淨 checkout 啟動正式 server，未設定範例目錄：清單 28 個、28/28 下載與 manifest SHA-256 一致。
- 真實瀏覽器驗證 workspace、未儲存流程、匯出再匯入、全部 28 個範例連續載入：**2 passed（17.5 秒）**。

這是 Node.js 正式模式與部署檔案完整性驗證，不代表已發布到特定雲端平台；雲端部署 workflow 尚未建立。公開 hostname 仍須加入 SCRATCH_ALLOWED_HOSTS，相機需 HTTPS。
