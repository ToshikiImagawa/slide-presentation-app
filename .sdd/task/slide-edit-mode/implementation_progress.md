---
id: impl-slide-edit-mode
title: スライド編集モード（器の作成） 実装ログ
type: implementation-log
status: completed
sdd-phase: implement
created: 2026-07-24
updated: 2026-07-24
completed: "2026-07-24"
depends-on:
  - design-slide-edit-mode
ticket: "#13"
tags:
  - editor
  - authoring
  - tauri
  - slide-package
  - addon
  - capability
category: authoring
---

# スライド編集モード（器の作成） 実装ログ

技術設計書: [slide-edit-mode_design.md](../../specification/slide-edit-mode_design.md)
タスク分解: [tasks.md](./tasks.md)

## 進捗

| タスク | 内容 | ステータス | 備考 |
|:---|:---|:---|:---|
| 1.2 | Rust EditMode + set_edit_mode | ✅ done | ゲート機構の基盤。cargo fmt/test/clippy 通過 |
| 3.1 | Rust save_slides_json（ゲート） | ✅ done | write_slides_json_gated + #[tauri::command] |
| 4.3 | Rust 編集モードゲート単体テスト | ✅ done | 無効時拒否・有効時書込を検証 |
| 3.2 | Rust export_slide_package（.tgz） | ✅ done | base_dir 収集・package/ 規約・extract 往復 |
| 4.4 | Rust export/展開往復単体テスト | ✅ done | slides.json 無損失＋アセット同梱を検証 |
| 2.1 | slidesSerialize（無損失往復） | ✅ done | JSON.parse/stringify(2sp) ベース |
| 4.1 | slidesSerialize 単体テスト | ✅ done | 未知キー/HTML/空白/props/fragment 往復＋冪等 |
| 3.3 | editModeSave.ts + SlideEditor.tsx（束ね） | ✅ done | invoke ラッパ＋dialog、SlideEditor で束ね |
| 1.1 | View に 'edit' 追加・表示分岐・結線 | ✅ done | main.tsx: editSource state・enter/exitEditMode・描画分岐、App に EditButton |
| 2.2 | SlideJsonEditor（JSONエディタ＋検証表示） | ✅ done | MUI TextField multiline。テスト3件 |
| 2.3 | ライブプレビュー（SlidePreview） | ✅ done | SlideRenderer.Slide 再利用・1280x720 scale。編集用に新設（発表者ビュー不変） |
| 2.4 | SlideMetaForm（確定フィールドのフォーム） | ✅ done | meta/theme の部分更新・未知キー保持。テスト2件 |
| 2.5 / 4.2 | 保存前バリデーション＋テスト | ✅ done | parseSlides の errors で保存/書出をゲート。SlideEditor テスト3件 |
| 3.4 / 4.5 | 層C 実行時信頼の個別付け外し | ✅ done | getAddonTrustMap/setAddonTrustDecision＋SettingsWindow UI＋App 結線。テスト isAddonAllowed+4・SettingsWindow+3 |
| 3.5 | 層B export 同梱アドオン個別選択 | ✅ done | Rust filter_addon_manifest＋同梱、export-slides.mjs の name 絞り込み、SlideEditor 選択 UI。テスト Rust+2・export-slides+3 |
| 3.6 | 層A 組み込み entry.ts 増減（dev 限定） | ✅ done | Rust list/add/remove（dev=debug＋編集モードゲート＋name サニタイズ）、editModeSave 結線、SlideEditor dev パネル。テスト Rust+2・editModeSave+1 |
| i18n | edit.* / settings.addonTrust* ロケールキー | ✅ done | ja-JP/en-US/fr-FR の ui.edit（37キー）・ui.settings.addonTrust*（4キー）を追加。JSON 妥当・文字化けなし・loader/i18nProvider テスト green |
| review | 実装レビュー（アドオン付け外し / i18n）＋敵対的検証 | ✅ done | 多エージェントレビュー（16指摘中 14 PLAUSIBLE・2 却下・blocker/CONFIRMED 0）。設計的に意味のある指摘を修正（下記「レビュー結果と修正」） |
| 4.6 / 5.1 / 5.2 | 結合デモ / docs / cleanup | ⚪ pending | 仕上げ |
| 4.7 | リグレッション（typecheck/test） | 🟢 継続確認 | 全249テスト green・Rust 12 テスト・typecheck/clippy/fmt 通過（都度） |

## 実装方針・設計判断（設計書に無い決定）

- **ゲートの純粋関数抽出**: `save_slides_json`(#[tauri::command]) は `tauri::State<EditMode>` を受けるためユニットテストが難しい。既存 `extract_tgz` と同様に純粋ロジック `write_slides_json_gated(enabled, path, json)` を切り出し、テストはこれを直接叩く（`cargo test` の既存規約に準拠）。
- **set_edit_mode の戻り値**: 設計書 §6 は `fn set_edit_mode(enabled: bool)` だが、`Mutex::lock` の poison を String 化して返すため `Result<(), String>` に精緻化。JS 側は await して失敗時は握りつぶす（A-005 フォールバック方針）。
- **export_slide_package の API 精緻化（ユーザー確認済み 2026-07-24）**: 設計書 §6 の `export_slide_package(json, out_dir, included_addons)` に `base_dir`・`name`・`version` を追加し `export_slide_package(json, out_dir, base_dir, name, version, included_addons)` とした。
  - **アセット収集元 = base_dir**（読込中パッケージのディレクトリ基準。存在しないアセットは export-slides.mjs と同様スキップ）。
  - **name/version = 編集 UI の入力欄から受領**（生成 package.json は `@slides/{name}`、初期値は meta.title のスラグ / 1.0.0）。
  - アセット抽出は `extract_asset_paths`（Rust）へ `extractAssetPaths` の規則を移植（先頭スラッシュ1個除去・出現順保持・重複排除・値のみ走査）。単一真実源は export-slides.mjs（DC-003）。
- **.tgz 命名**: npm pack 慣習に合わせ `slides-{name}-{version}.tgz`。全ファイルを `package/` 配下に格納し、既存 `extract_slide_package`（`package/` 優先探索）と往復可能。
- **slides.json は無損失格納**: export 時に再正規化せず、editor が持つ文字列（serializeSlides 出力）をそのまま `package/slides.json` に格納（FR-004）。
- **editModeSave の invoke 引数**: JS camelCase（outDir/baseDir/includedAddons）→ Rust snake_case へ Tauri が自動変換（既存 `invoke('extract_slide_package', { tgzPath })` と同規約）。dialog の保存先選択は `chooseSlidesSavePath`（save）/`chooseExportDir`（open directory）として editModeSave に集約。
- **編集対象データ = 元の相対パス JSON（ユーザー確認済み 2026-07-24）**: 読込済みパッケージの `presentationData` は `resolveLocalAssetPaths` で asset:// URL に書換済みのため、これを編集・保存すると可搬性を失う。そこで `LoadedSlidePackage.rawText`（書換前の生 slides.json テキスト）を追加し、編集はこれを土台にする。サンプル/デフォルトは相対パスのままなので `serializeSlides(data)` を rawText とする。プレビュー表示のみ `resolveLocalAssetPaths`（private → **export 化**して再利用＝DC-003 単一真実源）で baseDir 基準に解決。保存・書き出しは相対パスのまま（無損失・可搬）。
- **SlidePreview は編集用に新設（発表者ビューは不変）**: `PresenterViewWindow` の `PreviewSlide` と同等のスケーリング（1280x720・transform scale・previewReveal CSS）を `src/edit/SlidePreview.tsx` として複製。発表者ビューの実機スクショ e2e（macOS 限定）を壊さないため既存へ触れないことを優先。`SlideRenderer.Slide` は再利用（DC-001 準拠）。**両プレビューの共通化は task-cleanup 候補**。
- **編集モード開始/終了の結線**: `App` ツールバーに `EditButton`（`onStartEdit`）を追加。`main.tsx` は現在表示中プレゼンの `editSource`（rawText/baseDir/sourcePath）を保持し、開始で `enterEditMode()`＋`setView('edit')`、終了で `exitEditMode()`＋テーマ復帰＋`setView('presentation')`。
- **保存前バリデーション（FR-005）**: SlideEditor は `parseSlides(text).errors` が空のときのみ保存/書出を許可（ボタン無効化＋メッセージ）。構文エラー編集中は直近の妥当データでプレビューを維持（差分描画・NFR-004）。default へのフォールバックには流さない。
- **既知の残課題**: (1) ~~`edit.*` / `settings.addonTrust*` の i18n キーが未追加~~ → **解消済み**（ja/en/fr に全キー追加・81キー完全一致）。(2) 編集画面内のテーマ適用は同一 document（設計 §9.1）でエディタ chrome にも波及しうる（設計上の許容・要監視）。

## アドオン付け外し（3層）の実装メモ

- **層C（実行時信頼・FR-008）**: `localSlideLoader` に `getAddonTrustMap()`/`setAddonTrustDecision(path, decision)`（read-modify-write で他 path を保持）を追加。`SettingsWindow` にパッケージ単位の許可/拒否 `<select>` を追加（checkbox ではないので既存の無効化トグルテストの前提を壊さない）。`App` が設定ダイアログ表示時に最近パッケージ×信頼マップを突き合わせて一覧化。グローバル無効化が個別判断より優先（`resolveAddonTrust`）。
- **層B（export 同梱選択・FR-009）**: Rust `filter_addon_manifest`（name 絞り込み＋bundle 相対パス抽出）を新設し、`build_slide_package_gated` が `included_addons` に応じて `base_dir/addons/` から選択バンドル＋絞り込み manifest を同梱。CLI `export-slides.mjs` は `--addons a,b` の name 選択に対応（`selectAddons` でコピー側と manifest 側を同一集合で絞る）。編集 UI は `getPackageAddonNames(baseDir)` で候補を提示し、既定は全選択。
- **層A（組み込み増減・FR-010・dev 限定）**: Rust `list/add/remove_builtin_addon`（`cfg!(debug_assertions)` で release では拒否／`list` は空、`add/remove` は編集モードゲート＋`sanitize_addon_name` でパストラバーサル防止）。`add` は `addons/src/{name}/entry.ts` を雛形付きで生成。`builtin_addons_dir()` は `env!("CARGO_MANIFEST_DIR")` の親基準（dev 同一マシン前提）。UI は `import.meta.env.DEV` のときだけ表示し「npm run build:addons で再ビルド必要」を明示（DC-004）。純粋ロジック（`*_at`）を切り出しテスト。

## テスト結果

- **Rust（cargo test）**: 12 passed（extract_tgz×2 + ゲート×2 + extract_asset_paths×1 + export 拒否/往復×2 + filter_addon_manifest 選択/正規化・traversal×2 + sanitize×1 + 層A 往復×1 + export アドオン同梱×1）。`cargo fmt --check` 通過・`cargo clippy -D warnings` 通過。
- **全体リグレッション**: `npm run test` **全 249 passed（28 files）**・`npm run typecheck` 通過・`npm run format:check` 通過（NFR-001 既存挙動不変）。

## レビュー結果と修正（2026-07-24）

アドオン付け外し（3層）と i18n キー整備を対象に、多エージェントによる次元別レビュー（Rust セキュリティ / Rust 正当性 / TS 層C / export CLI 整合 / i18n）を実施し、各指摘を敵対的検証にかけた。**16 指摘中 2 件を反証却下、14 件が残存（すべて PLAUSIBLE。blocker / CONFIRMED は 0）**。標準脅威モデル上の破綻は無く、i18n はキー整合・翻訳品質ともに問題なし。設計的に意味のある指摘を修正した。

**修正した項目**:

- **DC-003 順序パリティ**: `src-tauri/Cargo.toml` の `serde_json` に `preserve_order` を有効化。`extract_asset_paths` のオブジェクト走査順が JS（`Object.values`=挿入順）と一致し、lib.rs のコメント「出現順を保持」が実挙動と整合。
- **`filter_addon_manifest` の bundle 正規化＋層B traversal 防御**: 残す manifest エントリの `bundle` を `addons/<basename>` に正規化して書き戻し、コピー対象と同一集合にした（実行時 404 の芽を除去）。basename 化で base_dir 外へのパストラバーサルを防ぎ、層A の `sanitize_addon_name` と防御を一貫させた。`include_addons` を JS の `copied>0` 相当（実ファイル存在）に合わせ、空の `addons/manifest.json` を同梱しないようにした。Rust テストに正規化・traversal ケースを追加。
- **層C 信頼一覧を trustMap 全キー基点に（FR-008）**: `App.tsx` の一覧生成を「最近開いた8件」依存から `getAddonTrustMap()` の全キー基点（recent は title 補完）に変更。最近リスト上限を超えて追い出された「許可済み」パッケージも一覧に残り個別に取り消せる。`clearAddonTrustDecision`（未設定へ戻す＝キー削除）を追加し、UI の「未設定」を選択可能にした。
- **信頼書き込みの堅牢化**: `localSlideLoader.ts` に書き込み直列化キュー（`queueTrustWrite`）を導入し、`isAddonAllowed` / `setAddonTrustDecision` / `clearAddonTrustDecision` / `resetAddonTrust` の read-modify-write を直列化（fire-and-forget 競合による判断喪失を防止）。`App` 側は永続化を await + catch でロールバックする。
- **グローバル無効化時の UI**: `SettingsWindow` で一律無効化 ON のとき個別 `<select>` を disable し、優先関係を注記（`settings.addonTrustDisabledNote`）で明示。
- **export CLI**: `parseArgs` で空選択（`,` / 空文字 / 空白）を「同梱なし（false）」に統一し stray な空 manifest 生成を防止。`bundleAddons` に未知 name の警告（タイポ検知）を追加。
- **aria-label 語順**: 組み込みアドオン削除ボタンの aria-label を `edit.builtinRemoveAria`（`{name}` 補間）に変更し、en/fr で自然語順（"Remove {name}" / "Supprimer {name}"）にした。3 ロケールへキー追加。

**対象外（要件内・実害なしのため未修正。設計上の明記候補）**:

- `save_slides_json` / `export_slide_package` が任意絶対パスを受理する点（`lib.rs:86` 他）。DC-002 は「Rust 境界＋編集モードゲート」を規定するのみでパス限定は要件外。JS に fs 書込権限を渡さない主要防御は実装済みで、パスは OS ダイアログ経由で確定する。→ DC-002 が経路のみを制御しパス限定は行わない前提であることを `_design.md` に明記するのが望ましい（task-cleanup 候補）。
- `remove_builtin_addon` の `is_dir()` が symlink を追従する点（`lib.rs`）。実測でリンク先は削除されず（消えるのは symlink 自体のみ）、dev 限定＋編集モードゲートで二重保護。実害なし。

## 実機検証（#14）での UI 修正（2026-07-24）

Tauri 実機（macOS）で編集モードを操作しながら、レイアウトの不具合をユーザー確認とともに順次修正した（すべて HMR で即確認・型チェック/全249テスト green を維持）。

- **プレビュー肥大化でフォーム/JSON が潰れる**: `SlidePreview` は `transform: scale()` で縮小表示するが transform はレイアウトボックス（1280px）を変えないため、グリッド `1fr 1fr`（＝`minmax(auto,1fr)`）の `auto` 下限が 1280px に引っ張られ右カラムが肥大化していた。グリッドを `minmax(0, ...)` にして最小幅制約を無効化（`SlideEditor.tsx`）。
- **編集 UI の文字がすべて巨大**: 本番用 MUI テーマ（`theme.ts`）の typography が `var(--theme-font-size-*)`（スライド用の大きなサイズ・読込 `baseFontSize` で拡大）を参照しており、同一 document の編集 chrome に波及していた（設計 §9.1 の既知リスクの具体的経路）。**エディタ chrome 専用の `editorUiTheme`**（固定・コンパクトな sans-serif・13px 基準）を新設し、プレゼンのテーマは**プレビューにだけ** `ThemeProvider` で適用するよう分離（`theme.ts` / `SlideEditor.tsx`）。
- **JSON エディタが狭い/枠が本文とズレてスクロール追従**: multiline テキストエリアが内部スクロールせず本文高さまで自動拡張し、枠（notchedOutline）が固定高さのままズレていた。テキストエリアを `height: 100% !important` + `overflow: auto` でコンテナ高いっぱいに固定し内部スクロール化（`SlideJsonEditor.tsx`）。
- **レイアウト構成の変更（ユーザー選択・2026-07-24）**: プレゼン資料が横長のため、右カラム縦長プレビューにデッドスペースが多かった。**上段=フォーム70% : プレビュー30%（7:3）／下段=slides.json 全幅**に再構成し、上段高さを 42% に固定して余白を圧縮。**JSON/スキーマエラー時はプレビューを非表示にしフォームを全幅**にする（`showPreview = errors.length === 0`）。
- **設計メモ**: これらは設計 §9.1 の「テーマ適用がエディタ chrome に波及しうる」リスクへの実対処。`editorUiTheme` による chrome 分離は task-cleanup で `_design.md` に反映する候補。

### 実機での機能検証ステータス（#14）

- ✅ **UI/レイアウト**: 編集モード遷移・フォーム/JSON/プレビューの表示・テーマ live 反映・エラー時のプレビュー非表示をユーザー確認済み。
- ✅ **機能フロー（実機 OK・2026-07-24）**:
  - **B**（.tgz 書き出し→再読込のアドオン往復・`filter_addon_manifest` 正規化修正）: OK
  - **C1**（層C 信頼プロンプト・FR-008）: OK / **C2**（層B 同梱選択・FR-009）: OK / **C3**（層A dev 組み込み増減）: OK
  - **D1**（個別許可 許可/拒否/未設定・再プロンプト）: OK / **D2**（一律無効化で個別 select disable＋注記・プロンプトなし無効）: OK
- ⚪ **D3（発展・未実施）**: 「8件超で最近リストから追い出された許可済みパッケージも信頼一覧に残る（trustMap 全キー基点・FR-008 修正）」は手数の多い手動テストのため未実施。ロジックは独立レビューエージェントで検証済み（App.tsx の recent∪trustMap 生成）＋`clearAddonTrustDecision`/直列化の単体テストでカバー。
