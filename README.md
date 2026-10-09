# Scratch 工作室

Next.js 網站內的完整 Scratch 3 編輯器，整合原生 Music、Handpose 手部辨識，以及隨專案發布的 **28 個 SB3 範例**。介面預設繁體中文，不需登入，也不會把使用者的作品上傳到外部服務。

## 快速開始

需要 Node **24.14.0**（見 `.nvmrc`）與 npm。

```sh
git clone https://github.com/victorfu/ollie-scratch3.git
cd ollie-scratch3
nvm install
npm run setup
npm run dev
```

開啟 [http://127.0.0.1:3000](http://127.0.0.1:3000)。不需要 `.env.local` 或額外教材資料夾，預設就會讀取版本控制內的 `examples/web`。

`setup` 依兩份 lockfile 安裝 Next 與獨立 Scratch 套件，再建置編輯器。第一次建置會下載固定 commit 的官方 Scratch GUI 原始碼、驗證 SHA-256，快取至 `vendor/scratch-editor/.cache/`；快取與建置產物不加入 Git。已有有效快取時不需重新下載來源。不要用無版本升級或 `npm audit fix --force` 替換相容組合。

## 範例庫

[`examples/web`](examples/web) 是唯一的正式教材目錄，包含第 28 課的手部追蹤修正版。SB3 與完整性 manifest 一起納入 Git，clone 與部署都能取得同一份內容。

新增、更新或刪除範例後：

```sh
npm run examples:index
npm test
```

提交變更的 `.sb3` 和 `manifest.json`。本機服務按「重新整理」即可更新清單，不必重建 Scratch；部署環境則需重新部署範例檔案。API 預設掃描此目錄單層，按檔名排序；個別壞檔不會使其他範例失效。編輯作品後下載的 SB3 不會覆寫教材。

若要改讀伺服器上的其他資料夾，可複製 `.env.example` 為 `.env.local`，只設定 server-only 變數：

```dotenv
SCRATCH_EXAMPLES_DIR=/absolute/path/to/custom/examples
SCRATCH_EXAMPLES_MAX_MB=50
SCRATCH_EXAMPLES_RECURSIVE=false
```

- 不設定 `SCRATCH_EXAMPLES_DIR`：使用專案內 `examples/web`。
- 明確設為空字串：停用範例庫，顯示未設定狀態。
- 指定絕對路徑：改用該伺服器的資料夾；部署到其他機器不會讀取開發者電腦。

路徑不存在、無權限、空資料夾會顯示不同狀態。遞迴子目錄讀取失敗會顯示警告，保留其他可讀範例。壓縮檔預設上限 50 MB，可設定至 500 MB；解壓總量上限 200 MB、project.json 10 MB、10000 項；手動匯入前端上限仍為 50 MB。

## 開發、建置與部署

```sh
# 本機正式模式
npm run build
npm run start
```

準備串接 Node.js 部署平台時：

- **建置指令**：`npm run setup && npm run build`
- **啟動指令**：`npm run start:deploy`（綁定 `0.0.0.0`，支援平台提供的 `PORT`）
- **環境變數**：設定 `SCRATCH_ALLOWED_HOSTS=scratch.example.com`，使用實際網站 hostname；多個以逗號分隔，不含協定、埠或萬用字元。
- **範例設定**：通常不需設定 `SCRATCH_EXAMPLES_DIR`，直接使用隨 Git 發布的 28 個教材。
- **執行環境**：需 Node.js server runtime，不能使用純 static export。

Next 的 output file tracing 已明確包含範例 API 所需的 `examples/web`。`npm run build` 完成後會自動檢查兩個 API 的 tracing 清單是否包含全部教材，並確認 Scratch 靜態產物存在；缺檔會直接使建置失敗。自行打包 Node 伺服器時需保留 `.next`、`public`（包含編譯後的 Scratch）、`examples/web`、package 設定與 runtime dependencies，並從專案根目錄啟動。使用支援 Next.js 的部署平台時，仍需確認它有發布 `public/scratch-editor/` 與 API tracing 列出的範例檔案。

目前沒有綁定任何雲端供應商或自動部署 workflow。部署相機功能必須使用 **HTTPS**；localhost 開發不受此限制。API 預設只接受 localhost、127.0.0.1、[::1]；正式 hostname 必須加入白名單。

`dev`／`build` 只在 Scratch 產物缺失或建置輸入變更時重建。常用維護指令：

```sh
npm run editor:fetch  # 下載並驗證固定來源
npm run editor:build # 重建 Scratch
```

OpenSSL 舊版相容設定只用於 Scratch Webpack 子程序，不套用到 Next runtime。

## 使用方式

- 工具列的「範例」開啟同網站選擇視窗，可搜尋與重新整理。
- 未下載修改時，可選擇下載目前作品後載入、直接載入或取消。
- 替換前必須備份成功；VM 載入失敗會復原，復原失敗會提供備份下載。
- 「下載作品」匯出真正 SB3；「匯入 SB3」與 File 選單走同一套驗證與復原流程。
- Music 可從左下擴充功能選單加入。內建樂器與鼓音效在本機 bundle；需使用者點擊綠旗／積木以啟用音訊。
- 載入 Handpose 範例不會自動要求相機權限；按綠旗、開啟相機或執行視訊積木才啟用。停止與切換作品會清理辨識及相機 tracks。

第 28 課讀取第 **10 號關節（中指根部）**，不是第 1 號手腕。沒有偵測到手時，紅點保留最後位置但隱藏，動作回到「預備」；重新偵測後才更新紅點。方向鍵備援保留。它使用本專案新增的 `handpose2scratch_isHandDetected` 積木，需在支援此積木的編輯器執行。詳見 [手部追蹤說明](docs/hand-tracking-fix.md)。

## 網路與相容性

Next **16.4.0**／React **19.2.4** 與 Scratch GUI **3.6.18**／VM **3.0.0**／React **16.14.0** 分別安裝與建置，透過同源 iframe 隔離，不強制共用 React。Scratch 使用 Webpack **4.47.0**、ml5 **0.12.2**；來源與版本理由見 [SOURCES.md](vendor/scratch-editor/SOURCES.md)。

保留 Handpose 原有 extension ID、opcodes、參數、1–21 landmark 編號、0.75 預設倍率及鏡像座標語意。只支援單手，不宣稱雙手辨識。

ml5 程式碼在本機，但模型與權重仍需從 TensorFlow Hub／Google 儲存服務下載。內建角色／造型／一般音效素材庫也會讀取 Scratch 資源站。這些是下載，不會上傳使用者作品；本專案不宣稱完全離線可用。

## 測試

```sh
npm test
npm run typecheck
# 另開 terminal 啟動 npm run dev 後：
npm run test:browser
```

Browser tests 使用已安裝的 Google Chrome、有視窗模式與 fake media。實體相機及真實手部辨識準確度仍需人工驗收。`tests/fixtures` 是獨立的合成測試資料，不屬於正式教材。

正式模式可執行 `npm run start -- --port 3001`，再使用：

```sh
TEST_BASE_URL=http://127.0.0.1:3001 TEST_BFCACHE=1 npm run test:browser
```

空狀態另啟動 `SCRATCH_EXAMPLES_DIR='' npm run start -- --port 3002`，並設定 `TEST_EMPTY_URL=http://127.0.0.1:3002`。完整 suite 預期目前的 28 個教材，變更課程數量時需同步調整驗收。報告與截圖位於被 Git 忽略的 `output/playwright`。

## 已知限制

- 瀏覽器需支援 WebGL；小視窗保留 1024×640 最小工作區並提供捲動。
- 舊 Scratch 工具鏈有已知 npm audit 警示，未宣稱已通過公網安全審核。
- VM load 無法安全取消；逾時先鎖定以避免競態，作業稍後完成會解除，否則需重新整理。
- 目前只允許 Music 與 Handpose，其他 extension ID 會明確拒絕。
- Scratch 會快取 extension，切換作品後分類可能仍在，但相機與舊結果已清理。

[架構與協定](docs/architecture.md) · [驗收記錄](docs/test-results.md) · [Review 修正](docs/review-remediation.md) · [授權聲明](licenses/README.md)
