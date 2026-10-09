# Licenses and attribution

本專案整合並修改 AGPL-3.0 的 Handpose2Scratch，因此整合原始碼以根目錄 LICENSE（GNU AGPL v3）提供；各原始第三方檔案仍保留自己的授權與著作權。

- Handpose2Scratch — champierre，AGPL-3.0。原始授權與原始碼保存在 vendor/scratch-editor/upstream。所有修改記錄於 vendor/scratch-editor/SOURCES.md 與 prepare.cjs。
- Scratch GUI 3.6.18／VM 3.0.0 — Massachusetts Institute of Technology，BSD-3-Clause；聲明保留在此目錄與下載後的上游 source archive。Scratch 名稱、logo 與商標政策見 SCRATCH-TRADEMARK.txt，本專案非 Scratch 官方網站。
- ml5 0.12.2 — MIT，原始授權見 ml5.md。其 bundled TensorFlow 元件包含 Apache-2.0 notices，未壓縮／未移除上游 bundle license comments。
- Next.js、React 與其他 npm dependencies 的 package license / notices 留在原始套件內，版本和 integrity 可由兩份 package-lock.json 重現。Webpack 不啟用 minification，避免移除原始 notices。
- `examples/web` 包含隨 repo 發布的 28 個 SB3 教材。請保留作品與素材內既有的作者／授權標示；本專案不另外主張這些教材素材的著作權或變更其原有授權。

如果日後透過網路向其他使用者提供修改後的 AGPL 程式，需遵循 AGPL 對應原始碼提供條款。交付／分享時包含本專案 source、patch scripts、lockfiles、上游版本／校驗 manifest 和授權；完整離線來源交付另附 `npm run editor:fetch` 取得的 upstream archive，不要只提供 public/scratch-editor 編譯產物。
