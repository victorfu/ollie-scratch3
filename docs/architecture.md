# 架構與協定

Next.js App Router（React 19）只負責同網域 iframe、範例 dialog、未儲存確認與 Node.js API。Scratch 是獨立 npm package／lockfile／Webpack 4 build（React 16），產物位於 public/scratch-editor。修改 Next UI 不會重建 Scratch；build stamp 同時追蹤 bridge、patch、lockfile、完整 src／upstream（含下載 manifest）、來源取得程式、共享協定、建置腳本與 Node 版本；已驗證的下載快取不屬於 Git 或 fingerprint 的輸入。

```
Next React → postMessage → 同網域 Scratch GUI + VM + Blockly + renderer
    ↓                          ↓ Music 本機內嵌 MP3 / Handpose ml5
Node Route Handlers       Handpose 為官方擴充：載入作品時開啟相機
    ↓
examples/web（隨 Git 部署）；可用 server-only SCRATCH_EXAMPLES_DIR 覆寫
```

## 協定 v1

所有訊息有 `channel: ollie-scratch`、`version: 1`、`type`、`requestId`、`sessionId`。型別在 lib/editor-protocol.ts，兩個 runtime 共同使用 lib/protocol.js 格式檢查。

| 方向 | type | 用途 |
| --- | --- | --- |
| 父 → iframe | connect | 父頁安裝 listener 後及 iframe onLoad 產生握手 requestId；500ms 重試直到 ready 或逾時 |
| iframe → 父 | ready | 回覆握手 ID 與本次 iframe 隨機 session；VM、舞台、預設作品初始化後才發送 |
| iframe → 父 | open-examples / import-request / export-request | 工具列操作 |
| 父 → iframe | prepare | 轉移 bytes、title；驗證後回傳 preparedId |
| 父 → iframe | discard | 取消並釋放 preparedId 的暫存內容 |
| 父 → iframe | load | preparedId、downloadFirst；仍支援 v1 raw bytes 載入並在 iframe 驗證 |
| 父 → iframe | export | 儲存真正 VM SB3 |
| iframe → 父 | result | ok、error、匯出 bytes 或失敗復原 backup |
| iframe → 父 | dirty | 是否有尚未下載修改 |
| iframe → 父 | camera | off/loading/on/error 與可讀訊息 |


雙方檢查 origin、source、格式與 session，targetOrigin 固定 location.origin。ready 必須匹配最新握手 ID；iframe 重載會撤銷 pending requests。每次操作有 requestId；iframe 去重並以 promise queue 序列化 prepare/load/export。父頁 listener 單一 effect 加清理，callback 使用 ref；Strict Mode／Fast Refresh 的 effect cleanup 只撤銷 listener、timer 與 pending requests，不會銷毀仍掛載的 iframe。iframe 的 pagehide 在真正離開時 dispose；進入 BFCache（persisted=true）只停止作品與相機，保留 VM、listener、作品與已驗證候選；pageshow 恢復後回報狀態，仍可編輯。父頁在 listener 安裝完成後立即發 connect，不依賴 hydration 之前可能已觸發的 iframe load；重試沿用同一握手 requestId，ready 僅接受一次，成功／逾時／cleanup 都會清除重試。

握手 90 秒、API 30 秒、載入／匯出 120 秒、模型 60 秒。VM load 沒有安全取消介面：若超時，父頁鎖定操作，絕不以另一個 load/restore 和未完成 VM 同時競跑。若逾時的載入稍後完成，符合該 requestId 的回覆會解除鎖定；否則需重新整理。這點會顯示在畫面。模型 generation token 使停止後的非同步結果失效。媒體權限 prompt 可以由使用者取消／拒絕。

## 替換交易

1. 父頁取得單一 SB3；GET 只負責 Host、catalog 路徑／副檔名與壓縮大小界線，回傳原始 bytes，不重複解壓。
2. 父頁把 ArrayBuffer 的所有權轉移給 iframe 的 prepare；iframe 在瀏覽器內以 `lib/sb3-validate.js`（與伺服器共用同一份規則）驗證 ZIP/CRC/結構/extension **一次**，作品 bytes 不會上傳；因此不受託管平台的 request body 上限（Vercel 4.5 MB）影響。成功後把 bytes 暫存在該 editor session，回傳不可猜測的 preparedId。單次最多保留一份候選。
3. 有 dirty 時顯示三選一；取消發 discard 釋放候選，不停止作品／相機，也不更動 VM。新的握手或 iframe 銷毀會使舊候選失效。
4. 確認後發 load(preparedId)，僅載入剛才驗證過的同一份 bytes；未知或失效 ID 拒絕。先用 saveProjectSb3 備份，失敗立即中止。選擇下載時先下載備份，再停止作品並載入。
5. 使用 vm.loadProject 自帶的 targets/workspace 更新；切回程式頁，依 upstream GUI 做下一個 task 的 dirty reset，不額外 emit 或等固定 80ms。
6. VM 拒絕時載入備份，恢復標題與原 dirty；第二次失敗時回傳獨立備份 copy。之後成功載入會清除錯誤提示；iframe 重載時仍保留可下載的先前備份，但不把它標成新 session 的復原失敗。

父頁每次操作有獨立 operation ID 和 AbortController；session 失效會取消讀取、關閉確認並解鎖。舊操作的 catch/finally 不能更動或解鎖新操作。

正常載入不做整份 slice：輸入以 transferable 移交，已驗證候選只由 iframe 持有。備份不轉移；只有復原失敗時額外製作可傳給父頁的 copy。匯出時用 revision 避免把匯出途中新增的修改標為已儲存。兩套 React 共用純 JS 檔名／下載／錯誤工具，沒有共用 React runtime。空白標題一律下載成 Scratch作品.sb3。

瀏覽器能確認下載已發起，不能確認使用者是否最後保留下載檔案。

## 本機檔案界線

API 在讀取前檢查 Host，預設僅允許 localhost、127.0.0.1、[::1]；可用 server-only SCRATCH_ALLOWED_HOSTS 額外列出精確可信 hostname，不支援萬用字元。POST 必須同源，GET 若帶 Origin 也必須同源；不依賴 Origin 或 forwarded headers 自動擴大 Host 白名單。

API 每次重新掃描，清單和 bytes 回應均 no-store。ID 為相對檔名 SHA-256，不包含路徑也不接受任意路徑參數。以 realpath + path.relative 檢查邊界，不跟隨目錄 symlink；檔案 symlink 只有解析後仍在目錄內才可讀。下載重新解析並使用 O_NOFOLLOW、檔案 descriptor、檔案大小檢查。root 僅存在 Node runtime；client 只 import type，不包含 server 實作。預設目錄是 process.cwd() 下的 examples/web，已透過 Next outputFileTracingIncludes 納入 API 產物；外部覆寫目錄不會自動打包，需由部署環境掛載。未設定變數使用內建教材，明確設為空字串則停用範例庫。

遞迴子目錄讀取失敗會加入 warnings，但保留其他有效範例；根目錄錯誤仍回傳 missing／denied。

ZIP 依 scratch-parser 規則接受唯一的根目錄或單層子目錄 project.json；多份候選一律拒絕。資產允許根目錄或單層子目錄。ZIP 驗證逐項串流解壓、驗證 CRC 與宣告／實際大小，最多 10000 項／總解壓 200 MB／project.json 10 MB。必須有單一舞台、targets/blocks/costumes/sounds 與封裝資源；extensions 與非核心 opcode prefix 都會檢查。上限預設壓縮 50 MB，可設定到 500 MB；手動匯入前端上限仍為 50 MB。

這是 localhost 開發工具，不提供登入或公網隔離。檔案系統若由另一個不受信任的本機程序持續競態替換祖先目錄，不屬於此應用的隔離保證；不要把範例目錄交給不受信任的共同使用者寫入。
