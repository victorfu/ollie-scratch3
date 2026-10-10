# Reproducible upstream sources and changes

- Scratch GUI npm 3.6.18, gitHead `13aa69ebe6c5e3e960f985bb5abcb65c1610bcc4` from https://github.com/scratchfoundation/scratch-gui . The npm distribution omits src. `upstream/scratch-gui-source.json` pins the official codeload URL, commit, archive root and SHA-256 (`163bc733f528f66656b898ca95052e00588ceadbb62b8282753525591295c24f`). `source.cjs` downloads the archive to ignored `.cache/`, verifies it before publishing the cache entry, and reuses a matching cached copy without network access. `prepare.cjs` extracts only src, static, LICENSE and TRADEMARK. The 2,065 selected source files were compared with the previously vendored archive and are byte-identical. Upstream bitmap/vector assets are preserved; this project does not generate SVG images.
- Scratch VM npm 3.0.0, repository.sha `bc6f4199020cb38021fe649065a6b807fcd3c23f`. Its published src is copied to `.generated/vm` by prepare.cjs. npm lockfile provides integrity.
- Handpose source: https://github.com/champierre/handpose2scratch/blob/8d70fa3ead209b47b6c778629594a78f04fd73b7/scratch-vm/src/extensions/scratch3_handpose2scratch/index.js . Original `upstream/handpose2scratch.js` SHA-256 `386691f7ae75ee33121529556cf56575b3e131d3c41ad84155e1c2fa8effe3d5`; original AGPL-3.0 license is retained alongside it.
- ml5 npm 0.12.2 (the version the official install.sh installs), bundled through the extension's own `require('ml5')`. Model weights are **remote** (TF Hub), as in the official editor.

`prepare.cjs` is the complete, reviewed patch description. It reconstructs `.generated/` from checksum-verified sources on every build; it never modifies node_modules. Changes:

1. Install the official Handpose2Scratch extension as its install.sh does: `upstream/handpose2scratch.js` copied **unmodified** (SHA-256 above) and registered as a built-in VM extension. The competition only allows this official module, so its behaviour is kept as is: English block labels, camera opened when the extension loads (with its "Setup takes a while" alert), ml5's own prediction loop, and the last landmarks kept when no hand is found.
2. Library card named like the official one (Handpose2Scratch, collaborator champierre, "HandPose2Scratch Blocks."); the official card images are not vendored, so it reuses Scratch's video-sensing icons.
3. Add one Examples toolbar button plus export/import. Route File import/export through the bridge and close the File menu; remove New because it bypasses safe replacement. Offer what the competition allows in the extension library: Music, Pen and Handpose2Scratch.
4. Like the official editor, stopping or replacing a project never turns the camera off; it is released only when the editor page unloads.
5. Stub unused Microbit firmware URL (Microbit is not offered). Build the extension worker locally.
8. Use our editor entry with the official GUI reducers/HOCs, actual VM, renderer, paint editor and Blockly. No HashParser, telemetry, cloud save, accounts or project-host fetches.
9. `webpack.config.cjs` excludes `scratch-render-fonts` from the url-loader asset rule. That package inlines its costume fonts with `base64-loader!`; without the exclusion url-loader also ran and the fonts became base64 of a JS module string, so SVG costume text fell back to the browser's default serif font.

Scratch subpackages are pinned to the GUI source commit's package-lock versions: render 1.0.35, paint 2.2.2, blocks 1.1.6, audio 1.0.28, storage 2.3.28, l10n 3.18.3, svg-renderer 2.0.13. This avoids newer packages with Webpack-5-only exports. React 16.14.0 is confined to this package tree. Root Next.js uses React 19.2.4. No cross-tree React overrides.

To download/verify the pinned archive independently of a build:

```sh
npm run editor:fetch
```

`npm run setup`, `npm run editor:build`, and a missing/stale editor build from `dev`/`build` run this preparation automatically. The first source download requires network access; a valid cached archive works offline. Never add `.cache/` to Git. If the checksum fails, no unverified download replaces the cache and the build stops. Updating the source requires deliberately changing the committed manifest and checking patches/browser acceptance again.
