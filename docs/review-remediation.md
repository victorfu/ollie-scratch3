# Review 修正記錄（2026-10-09）

本節記錄當時處理 15 點 review 的結果；該次未修改教材，也未重啟既有開發伺服器。目前教材已統一納入 examples/web 並隨 Git 發布。保留 Next / Scratch 兩套 React 與既有固定版本。

| # | 處理結果 | 驗證 |
| --- | --- | --- |
| 1 | 操作使用獨立 ID 與 AbortController；iframe 失效時取消讀取、關閉確認並解鎖；舊 callback 不會更動新操作 | 確認對話框中 reload；舊讀取晚回來也不能解除新操作鎖 |
| 2 | 使用與 parser 相同的 project.json 候選規則；拒絕任何多份候選，支援唯一子目錄作品與資產 | 兩種 ZIP 順序皆拒絕；pen 未載入；子目錄 SB3 真正載入成功 |
| 3 | 三個 API 共用 Host 白名單，預設 localhost/127.0.0.1/[::1]；不信任 forwarded headers；Origin 另行同源核對 | 不可信 Host + 匹配的惡意 Origin 仍全部 403；合法請求正常 |
| 4 | pagehide.persisted 只停止作品／相機，保留 VM、listener 與作品；真正銷毀才 dispose | 正式模式實際 BFCache 還原，保留未儲存標題，返回後載入／匯出可用 |
| 5 | videoToggle 開啟在背景初始化，不回傳會阻塞 VM thread 的 Promise；錯誤仍報告 | 模型 promise 尚未完成，後續移動積木已執行 |
| 6 | 子目錄錯誤回傳相對名稱 warnings，保留已找到的有效範例；根目錄錯誤不混淆 | 有有效檔 + 不可讀子目錄，清單仍 ready 且包含警告 |
| 7 | 共用 errorMessage 處理 Error、一般字串、VM JSON 驗證錯誤 | 真實 VM schema failure 顯示結構錯誤及復原結果，沒有 undefined |
| 8 | 分離 ml5 script cache 與 model cache；factory 在 Promise.then 中呼叫，涵蓋同步 throw；失敗 script 清理 | 先同步 throw、再非同步 reject、最後成功，只有一次 ml5 script 載入且沒有 pageerror |
| 9 | File 載入／儲存先呼叫官方 onRequestCloseFile | 兩種操作都關閉選單 |
| 10 | 移除多餘 targets/workspace emit；依 upstream GUI 在下一 task 清除匯入 dirty，不再等固定 80ms | 6 倍 CPU 降速下大型第 28 課載入後 dirty=false；28 份連續載入亦通過。原 review 的持續 dirty 症狀未重現，不誇稱證明所有機器零時序風險 |
| 11 | 共用檔名 helper；空白、全空白／點號標題用 Scratch作品.sb3，移除前導點與不合法字元 | 實際 Chrome 下載為 Scratch作品.sb3 |
| 12 | 成功載入清除復原失敗提示，camera status 在握手與成功載入時同步；新 session 的舊備份改標「先前作品」保留下載 | 連續兩次 VM failure 後成功載入，備份提示消失；相機錯誤清除 |
| 13 | fingerprint 包含完整 src/upstream、package/lockfile、共享協定、建置腳本與 Node 版本 | 改動測試用 upstream/handpose2scratch.js 時 hash 改變 |
| 14 | prepare → 確認／取消 → load(preparedId)，每個候選在 Node 驗證一次；Buffer 轉移到 iframe，不額外 slice | 每次範例載入只有一次 validate POST；原有取消／備份／匯出與 raw v1 載入皆通過 |
| 15 | 移除未使用的 dispose/camera-on/camera-off 協定命令；兩個 runtime 共用純 JS 下載／檔名／錯誤工具；不再手動重複呼叫 handpose.stop | 既有所有攝影機與訊息回歸通過；VM 自身必要的 stopAll 生命周期仍保留 |

## 驗證結果

- `npm test`：**16 passed**。
- `npm run typecheck`：通過。
- Scratch 與 Next 正式建置：通過。
- 開發模式既有瀏覽器流程：**16 passed，1 skipped**（空路徑的獨立伺服器於正式模式另驗）。
- 開發模式 review 專屬回歸：**9 passed**。
- 正式模式完整瀏覽器測試：**27 passed，0 skipped（約 2.2 分鐘）**。含真實 BFCache、空範例環境、28 個網站範例、168 個範例／視窗尺寸組合、Music 波形、原第 28 課相機啟動／網站修正版手勢作答、真正 ml5 模型、refresh、新增九組缺陷回歸。
- 正式測試使用獨立 3103／3104 埠，完成後自動停止。3000 保留使用者的原程序。

測試檔：tests/review-regressions.test.ts、tests/browser/review-fixes.spec.ts、tests/browser/bfcache.spec.ts，加上既有測試。
報告：output/playwright/review-fixes-production.json；失敗時的 traces 會在同名 artifact 目錄。這些產物可重跑生成，不加入 Git。

## 範圍與限制

Host 防護已用實際 HTTP 請求驗證；沒有對外部網站實施 DNS rebinding 攻擊。效能部分確認三次 ZIP 驗證降為一次與移除多餘完整 buffer copy，沒有宣稱已測量 500 MB 專案的峰值記憶體。攝影機使用 fake media；穩定的有手／無手情境使用測試輸入，另有真正模型 smoke test，仍不等於真實手部準確度人工驗收。

GET SB3 API 現在只負責來源／路徑／大小與 bytes 下載，ZIP 驗證統一放在 prepare 階段。正常 UI 與 raw load 都不能繞過驗證進入 VM。詳細生命週期與通訊型別見 [架構文件](architecture.md)。
