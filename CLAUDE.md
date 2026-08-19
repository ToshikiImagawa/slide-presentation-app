# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## プロジェクト概要

React + Reveal.js ベースのスライドプレゼンテーション作成ツール。JSON ファイルでスライド内容やテーマを定義し、Tauri（Rust）製のローカルデスクトップアプリとして表示する。

## コマンド

```bash
npm run tauri:dev    # デスクトップアプリ起動（Tauri + アドオンビルド + Vite HMR）
npm run tauri:build  # デスクトップアプリのバンドルをビルド
npm run dev          # フロントエンドのみ開発サーバー起動（アドオンビルド + Vite HMR）
npm run build        # フロントエンドのみプロダクションビルド（アドオンビルド + dist/ に出力）
npm run build:addons # アドオンのみビルド
npm run preview      # ビルド済みファイルのプレビュー
npm run format       # Prettier でコード整形（src/**/*.{ts,tsx,css}）
npm run format:check # Prettier の整形チェック（CI 用・書き換えなし）
npm run typecheck    # TypeScript 型チェック
npm run test         # テスト実行（Vitest 単体テスト）
npm run test:watch   # テスト監視モード
npm run test:e2e     # Playwright E2E（アサーション付き・en/ja 2ロケール・Linux 可）
npm run export:slides   # スライド内容を .spkg として書き出す（--source / --slides / --name / --version / --addons / --strict）
npm run export:samples  # samples/manifest.json の全ロケールを .spkg 化（リリース時に Releases へ添付）
npm run export:theme    # ブランドテーマ単体（ThemeData JSON + アセット）を配布用に書き出す（--source / --theme / --name / --base-url / --strict）
npm run generate-icons       # resources/icon.svg から src-tauri/icons/ を再生成（macOS 専用: sips + tauri icon）
npm run generate-screenshots       # README 用スクリーンショット撮影（Playwright WebKit・macOS 専用・e2e スモーク兼用）
npm run screenshots:compare        # 実アプリ画像とモック画像の手動比較（pixelmatch）
npm run screenshots:diff           # README用スクリーンショットのHEAD版と作業ツリー版の差分率レポート（--base <ref> / --expect <key1,key2>）
npm run reference-deck:screenshots # 基準見本デッキ（全スライド種別を1枚ずつ網羅）の一括撮影（Playwright WebKit・macOS 専用）
npm run reference-deck:diff        # 基準見本デッキの HEAD 版と作業ツリー版を比較（下端マスク付き・バウンディングボックス出力）
npm run reference-deck:inspect     # 基準見本デッキ全枚数の見た目破綻検査（はみ出し・セーフエリア侵入・装飾重なり。DOM実測ベース・Linux 可）
npm run reference-deck:check-files # fixture と resources/reference-deck/ のファイル名照合（孤児・欠落検知。撮影不要・Linux 可）
npm run samples:inspect            # 配布サンプル（samples/manifest.json の全ロケール）の見た目破綻検査（はみ出し・セーフエリア侵入・装飾重なり。DOM実測ベース・Linux 可）
npm run generate-docs              # README.md / CHANGELOG.md を PDF 化（docs/ に出力・puppeteer）
npm run check:docs                 # ドキュメント中のバックティック囲みファイルパス参照の実在確認（quality ジョブに統合）
```

### スナップショット / e2e（スクリーンショット機構）

ブラウザ自動化は同じ基盤（`vite --mode screenshot` + IPC モック + ロケール別 fixture）を 2 用途で使う:

- **`npm run test:e2e`** — Playwright **Test** によるアサーション付き E2E（`playwright.config.ts` + `e2e/*.spec.ts`）。`en` / `ja` の 2 プロジェクトで実行し、期待値は `assets/locales/*.json` と fixture から読み込む（ハードコードしない）。テキスト内容ベースなので **Linux CI 可**（`.github/workflows/ci.yml` の `E2E (Playwright)` ジョブ）。
- **`npm run generate-screenshots`** — README 用スクリーンショット撮影。**e2e スモークも兼ねる**（各シナリオの待受が失敗すると非ゼロ終了）。**撮影事故の自己検証も兼ねる**（#125）: ①撮影完了後、同一ロケール内で出力 PNG の md5 が重複していたら（例外は出ないが違う画面が写っていた事故）非ゼロ終了する。ロケール間は文言が異なるため意図的に比較しない。②`scenarios.mjs` の任意フィールド `assert`（`(lang) => 期待テキスト`）で、撮影直前に `.reveal .slides section.present` へ期待テキストが含まれることを検証する（待受セレクタは満たしたが目的の画面が写っていない事故を検出。まず `layout-*` 系に付けている）。期待値は `scripts/screenshot/fixtures/slides.{ja,en}.json` から導出し、ハードコードしない。
- **`npm run reference-deck:screenshots`** — 全スライド種別を1枚ずつ並べた基準見本デッキ（`scripts/screenshot/fixtures/reference-deck.{ja,en}.json`。Epic #212 で種別を追加するたびに1枚増える）の一括撮影。`capture-screenshots.mjs`（README 用の厳選ショットを `scenarios.mjs` に手動列挙する設計）とは別スクリプト `capture-reference-deck.mjs` にしている。fixture のスライド数を動的に読み取ってループ撮影するため、種別追加時にこのスクリプト側の変更は不要（fixture に1枚追加するだけで済む）。出力は `resources/reference-deck/{en,ja}/` にコミットする。**撮影後に期待ファイル名（fixture 由来）に無い PNG を削除する**（#293）。#196 / PR #289 でデッキ中央にスライドを挿入した際、以降を+1番リネームしたのに旧番号のファイルを消さず、孤児が19件×2ロケール溜まった（掃除はコミット `6dfa302`）再発防止。
- **`npm run reference-deck:diff`**（`scripts/screenshot/diff-reference-deck.mjs`）— 基準見本デッキの回帰検知の比較本体（#246）。git の `HEAD` 版と作業ツリー版を pixelmatch + pngjs で比較し、差分が出た画素のバウンディングボックスを出力する。単純な git 差分（画像が1bitでも変わればコミット差分に出る）だけでは、**種別を1枚追加すると既存の全枚に差分が出る**問題があるため、比較前に下端 `--mask-bottom`（既定 120px）を全幅マスクする。ページ番号（`slideNumber: 'c/t'`）・進捗バー・前後移動の矢印はいずれも総枚数に依存する Reveal.js 標準機能（`controls`/`slideNumber`/`progress`。`src/hooks/useReveal.ts`）で、矢印は既定値で下端から論理px 58px（= 実測 2倍解像度で 116px）の高さがあり、デッキ先頭・末尾のスライドは総枚数が変わると矢印の表示/非表示が切り替わって差分がその高さまで及ぶ。既定 120px はこの実測値に余白を加えた値。`06-layout-bleed` / `07-layout-custom`（`TerminalAnimation`。JS 駆動アニメーションのため `animations: 'disabled'` でも止まらない残差が本文中央に出る。PR #242 実測）は既知の残差として一覧に必ず明示し、差分があっても失敗にしない（黙って除外はしない）。これら以外の画素差分は実装の変化として扱う。**比較対象はディレクトリの実ファイル列挙ではなく fixture から導出した期待ファイル名**（#293。孤児がある状態でも比較件数は fixture のスライド数と一致し、孤児を黙って比較に含めない）。
- **孤児・欠落検知は撮影・比較と別の関心事**（#293）。`capture-reference-deck.mjs` の削除・`diff-reference-deck.mjs` の比較対象・`npm run reference-deck:check-files`（`scripts/screenshot/check-reference-deck-files.mjs`。CI 検知）の3者は、期待ファイル名の導出（`${index}-${slide.id}.png`）を共有モジュール `scripts/screenshot/reference-deck-fixture.mjs` の `expectedFileName` / `expectedFileNames` から取得する（3箇所に書き写さない）。`check-reference-deck-files.mjs` はファイル名の集合演算のみで撮影・ブラウザ起動を要さないため、`reference-deck:inspect` と同じ Linux CI ジョブ（`ci.yml` の `visual-check`）に載せている。

スクリーンショット撮影の仕組み:

- `vite --mode screenshot` を起動し、Tauri IPC を `src/__screenshot__/`（`tauri-store` / `tauri-event` / `tauri-webview`）へ **Vite alias で差し替え**て素のブラウザで boot させる（本番ビルドには非混入。`@tauri-apps/api/core` は実物の plugin-fs/dialog が依存するため alias しない）。
- スライド内容はロケール別 fixture `scripts/screenshot/fixtures/slides.{ja,en}.json` を `/slides.json` として配信する（**アプリが付ける `?locale=…` を優先し、無い場合だけ `Accept-Language`** で出し分け。`requestedLocale`）。基準見本デッキ用の `reference-deck.{ja,en}.json` は同じ仕組みで `/reference-deck.json` として配信され、`VITE_SLIDES_PATH`（`src/sampleSlides.ts` の `loadBundledSampleSlides` が読む既存の env var）でホーム画面「サンプルを開く」の取得先をそちらに切り替える。
- Playwright **WebKit** で撮影し、`scripts/screenshot/chrome.mjs` が macOS ウィンドウ枠を合成。**en / ja の 2 ロケール**で撮影し、`resources/screenshots/en/`・`resources/screenshots/ja/` に出力する（Playwright の context `locale` で UI 言語と fixture を切り替え）。
- シナリオは `scripts/screenshot/scenarios.mjs`（`home` / `presentation` / `toolbar` / `settings` / `shortcuts` / `edit` / `presenter-view` / `layout-*` / `logo`）。撮影キーは `VIEWPORTS`（`viewports.mjs`）にも同名で登録が必要。待受は `data-testid` で行うため、新シナリオが UI に到達できないときはコンポーネント側に testid を足す。基準見本デッキ（`reference-deck:screenshots`）は上記の `reference-deck:diff` を使う。**撮影事故そのものの検知**（md5 重複・`assert`）は上記の自己検証を参照（#125）。
- **`npm run screenshots:diff`**（`scripts/screenshot/diff-screenshots.mjs`。#125 Phase2）— README 用スクリーンショットの回帰検知を「git 差分ベース＋目視」から「pixelmatch による差分率レポート」に拡張する。`scenarios.mjs` から導出したキー×ロケール全件について `HEAD`（`--base` で変更可）と作業ツリーを比較し、レンダリングノイズ（実測 0.02% 前後）を超える差分（既定 `NOISE_THRESHOLD_PERCENT=0.05%`）だけを「意味のある変更」として分離する。`--expect key1,key2` で更新を意図したシナリオキーを渡すと、実際に意味のある変更が出たキーの集合と比較し、**意図していないのに変わった／意図したのに検出されない**の食い違いを検出して非ゼロ終了する（写り込み事故を merge 前に検知する用途。`--expect` 省略時は純粋なレポートで、解像度不一致・想定外の削除以外は exit 0）。基準見本デッキの `reference-deck:diff`（0差分でない限り常に失敗・既知残差は個別ハードコード）とは判定方式が異なる: README スクリーンショットは静止スライド以外の画面（ツールバー・編集画面等）も含み種類が多様なため、閾値による分離を採用している。`git show <ref>:<path>` の取得部分（`tryGit`/`readRefBuffer`）は `reference-deck:diff` と共有モジュール `scripts/screenshot/git-ref-buffer.mjs` に切り出している（トリビアルな git show ラッパーのコピペを避けるため）。
- **UI 変更時の検証用の一時シナリオ**（#125 Phase3）— `scenarios.mjs` / `viewports.mjs` を手で書き換えて検証後に `git checkout` で戻す使い捨て手順は不要。`SCREENSHOT_SCENARIOS=<scenarios/viewportsをexportするモジュールへのパス>` を指定すると `capture-screenshots.mjs` が本番の定義の代わりにそのモジュールを読み込む。本番 PNG を上書きしないよう `SCREENSHOT_OUT`（既存。出力先ベースの差し替え）と併用する: `SCREENSHOT_OUT=/tmp/verify SCREENSHOT_SCENARIOS=./scratch/verify-scenarios.mjs npm run generate-screenshots`。外部モジュールは本番の `VIEWPORTS` との同名キー制約を受けない（`scenarios` と `viewports` を丸ごと差し替えるため）。
- **日本語フォント・WebKit 描画差のため macOS で実行する**（CI は `.github/workflows/screenshots.yml` の macOS ランナー・手動 dispatch）。
- E2E は `e2e/` にある: Playwright（`*.spec.ts`・配線済み・上記）と、実機 Tauri WebView 用の WebdriverIO 雛形（`*.e2e.ts.sample`・未配線）。詳細は `e2e/README.md`。
- ドキュメントは英日 2 言語: `README.md` / `CHANGELOG.md` / `CONTRIBUTING.md`（英語）と `README.ja.md` / `CHANGELOG.ja.md` / `CONTRIBUTING.ja.md`（日本語）。英語版は `en/`、日本語版は `ja/` のスクリーンショットを参照する。`npm run generate-docs` が PDF 化するのは README / CHANGELOG の 4 ファイルのみ（CONTRIBUTING は対象外）。
- **README は利用者向け・CONTRIBUTING は開発者向け**に分ける。セットアップ・npm コマンド・アドオンの実装方法・`public/` の扱い・CLI でのパッケージ書き出し（`export:slides`）と `VITE_SLIDE_PACKAGE` は CONTRIBUTING に置く。テスト・E2E・CI / リリースの手順はどちらにも書かない（`CLAUDE.md` と各ワークフローが真実源）。
- README のスクリーンショットは **冒頭のヒーロー 1 枚（`presentation.png`）＋各機能節にインライン 1 枚**で、同じ画像を 2 度使わない。`resources/screenshots/{en,ja}/` の 14 枚すべてがちょうど 1 回参照される状態を保つ。
- **キーボードショートカットの一覧は `ShortcutsDialog`（アプリ内）が唯一の真実源**。README には表を置かず、`?` で開ける旨と `shortcuts.png` のみを載せる（実装との乖離を防ぐため）。キーを追加・変更したら `ShortcutsDialog.tsx` の定数と `assets/locales/*.json` を更新する。

### 見た目の自動検証（#209）

見た目の破綻検出は「静的な JSON 検証」と「DOM 実測」の 2 系統に分かれ、いずれも**検証エラーではなく警告**として扱う（既存の警告方針: 描画は継続する。`getThemeWarnings`・`getMasterWarnings` と同じ思想）。

- **コントラスト検証**（`getThemeWarnings`。`src/applyTheme.ts`）— WCAG AA（4.5:1・`WCAG_AA_THRESHOLD`）を、`theme.colors` 直書き・`theme.tokens`（masterKey スコープの CSS 変数上書き・#190）・`theme.masters[].background`（`fill`/`gradient` の全面塗り）の3経路すべてに適用する。算出は `getContrastRatio`（1つの算出元。ブランド取り込み時の収束処理 `brand/compile.ts` の `convergeContrast` と共有）。**文字色・背景色の両方が同一スコープで明示されている組だけ検証する**（片方がグローバル CSS の既定値に委ねられている場合、その既定値を TS 側に複製すると二重管理になるため対象外にする）。**`theme.masters[].background` の `grid`/`image`/`plain` は対象外**（`grid`/`plain` は下地色が不定、`image` は画像のためピクセル明暗解析が必要になり `getContrastRatio` の単色比較の枠を超える・#303）。`image` 型背景上のテキスト可読性は、画像自体にスクリム（半透明の暗幕）を焼き込む等、画像の作り手側で担保する運用とする。
- **はみ出し・セーフエリア侵入・マスター装飾との重なり・高さ 0 の「埋める要素」**（`getVisualCheckWarnings`。`src/visualChecks.ts`）— JSON だけでは判定できないため、実際にレンダリングされた `<section class="slide-container">` を `getBoundingClientRect` で実測する。①スライド領域（`section` 自体の矩形）を超える要素＝はみ出し、②`.master-body` の padding（セーフエリア。#188）に侵入する要素＝セーフエリア侵入、③`.master-layer-back`/`.master-layer-front` の装飾要素と矩形が重なる要素＝装飾との重なり、④幅は持つのに高さが 0 の `.content-area-fill-item`、の4種を返す。④だけは幾何の破綻ではなく **`.content-area` の fill 変種の契約（`src/styles/global.css`）が成立しているかの検査**（fill ホストの外に置かれた要素は静かに高さ 0 になり、①〜③では検出できない・#259）。実測は1要素につき1回だけ行い、4種の判定がその結果を共有する。
  - **ライブアプリ**: `useVisualCheckWarnings`（`src/hooks/useVisualCheckWarnings.ts`）が現在表示中のスライド（`section.present`）をスライド切り替えの都度実測し、警告があれば `App.tsx` がトースト表示する（`visualCheck.warning`。編集中の見た目の破綻もその場で気づける）。
  - **CI**: `npm run reference-deck:inspect`（`scripts/screenshot/inspect-reference-deck.mjs`）が基準見本デッキ（`resources/reference-deck/` の元になる fixture・#208）全枚数を検査し、警告が1件でもあれば非ゼロ終了する。ロジックはライブアプリと共有し複製しない: `src/visualChecks.ts` は `vite --mode screenshot` の時だけ `window.__VISUAL_CHECK__` として検出関数を公開し（`src/__screenshot__/` の Tauri IPC モックと同じ「screenshot モード限定で window に生やす」規約）、CI スクリプトは Playwright の `page.evaluate` 経由でそれを呼ぶだけ。**ピクセル比較（`reference-deck:diff`）と違い、撮影の非決定性・フォント描画差の影響を受けないため Linux CI（`ci.yml` の `Visual Check` ジョブ）で実行できる**（macOS 専用の `screenshots.yml` とは独立）。
  - **配布サンプル**: `npm run samples:inspect`（`scripts/screenshot/inspect-samples.mjs`。#113）が同じ `window.__VISUAL_CHECK__` を使い `samples/manifest.json` の全ロケール（ja/en/fr）を検査する。基準見本デッキと違い screenshot モードの vite は配布サンプルを配信しないため、`page.route('**/slides.json*', ...)` で取得先を `samples/template-guide/slides.<locale>.json` の内容へ直接差し替える（パターンの末尾 `*` は `?locale=…` 付き URL に一致させるために必須）。差し替え（route）が発火した回数を数え、ゼロ件なら検査自体の失敗として非ゼロ終了する（差し替え漏れでビルド同梱の内容を検査してしまう偽陽性を構造的に防ぐ）。同じ `Visual Check` ジョブに載せている。

## アーキテクチャ

### データ駆動型スライドシステム

スライドは React コンポーネントではなく **JSON データ**で定義する。`public/slides.json` を配置するとカスタムスライドを表示する。

### 起動フロー

```
main.tsx
├── loadBuiltinAddons()             # addons/manifest.json → script 挿入 → ComponentRegistry に登録（層A・dev 限定）
├── loadLocales()                   # assets/locales/ の言語リソース
├── getRecentSlidePackages()        # 最近開いたパッケージ一覧（plugin-store）
├── applyTheme()                    # テーマ適用
└── <Root> → <RootContent>          # 起動時は常にホーム画面（HomeScreen）
    ├── ファイルを開く / URL から開く / サンプルを開く / 最近開いた / AIで新規作成
    └── <App key={presentationKey} presentationData={data} ... />
        ├── registerDefaultComponents()
        ├── loadPresentationData()   # バリデーション + 最小フォールバック
        ├── useReveal()              # Reveal.js 初期化
        └── <SlideRenderer />        # layout に基づきスライド描画
```

スライドを開き直すと `presentationKey` を更新して `App` 全体を再マウントし、新しい内容で Reveal.js を再初期化する（差分更新ではなく丸ごと作り直す設計）。

### 配布サンプル

ホーム画面の「サンプルを開く」で表示するテンプレートガイドは**アプリに同梱しない**。`samples/template-guide/slides.{ja,en,fr}.json` と参照アセットを `.spkg` として GitHub Releases のアセットで配布し、実行時に取得する。

- `src/sampleSlides.ts` — 取得元の決定を集約（`main.tsx` はトップレベルで `createRoot` するためテストから import できない）。3 段で解決する: ①ビルド時同梱の `slides.json` → ②`releases/download/v{version}/<name>.spkg`（内容不変なのでキャッシュ再利用・オフライン可） → ③`releases/latest/download/<name>.spkg`
- ①の判定は `res.ok` では足りない。Vite dev サーバーは存在しないパスにも SPA フォールバックで 200 + HTML を返すため、content-type とスキーマの両方を検証する
- `samples/manifest.json` がロケール → パッケージ名の**単一真実源**。アプリ（`src/sampleSlides.ts`）とビルド（`scripts/export-samples.mjs`）の双方が読む。アセット名にバージョンを含めない（`latest/download/` では URL を確定できないため）
- アプリに残るのは最小フォールバック 2 つ（`src/data/loader.ts`）。用途を分けている: `getFallbackPresentationData`（データ不正時）と `getSampleUnavailablePresentationData`（取得失敗時）
- `vite.config.ts` の `devSampleSlidesPlugin` が dev サーバー限定（`apply: 'serve'`）で `samples/` を `/slides.json`・`/voice/*` として配信する（本番出力には混入しない）
- **ロケールはアプリが URL に明示する（`?locale=…`。`src/sampleSlides.ts` の `withLocaleQuery`）**。`Accept-Language` は OS/ブラウザの言語であり、アプリ内の言語設定（設定ダイアログ・localStorage）とは一致しないため、それだけを見ると「フランス語設定なのに日本語サンプルが出る」ことになる。ロケール別に出し分ける2つの配信元（`devSampleSlidesPlugin` / `screenshotFixturePlugin`）は共通の `requestedLocale` でクエリを優先し、無い場合だけ `Accept-Language` にフォールバックする。リモート取得（`getSampleSources`）も同じアプリ内 locale を使う

### コンポーネントシステム

`ComponentRegistry` がすべてのコンポーネントを一元管理する。3つのレイヤーがある。

1. **デフォルトコンポーネント** — `registerDefaults.tsx` で登録（`TerminalAnimation`, MUI アイコン等）
2. **アドオンコンポーネント** — `window.__ADDON_REGISTER__()` 経由で登録
3. **フォールバック** — 未登録コンポーネント参照時に表示

スライド JSON から `{ "component": { "name": "Foo", "props": {} } }` で参照する。

### アドオンシステム

`addons/src/{アドオン名}/entry.ts` を自動検出し、IIFE 形式でバンドルする。`addon-bridge.ts` が `window.React` 等をグローバル公開し、アドオンから利用可能にする。ビルド時に `addons/dist/manifest.json` を自動生成。

### レイアウト

`SlideRenderer` が `layout` フィールドに基づいて描画関数を切り替える。構造ベースの5種類:

| layout | ラッパー | 用途 |
|---|---|---|
| `center` | TitleLayout / SectionLayout | タイトル・まとめ。`variant: "section"` で SectionLayout を選択 |
| `content` | ContentLayout | 子要素で描画を判別: `steps` → Timeline, `tiles` → FeatureTileGrid, `component` → カスタム |
| `two-column` | ContentLayout + TwoColumnGrid | 左右2カラム。`left`/`right` で各カラムの内容を定義 |
| `bleed` | BleedLayout | 2カラム全幅（端まで広がるレイアウト） |
| `custom` | なし | `component` で指定したコンポーネントを直接描画 |

### デスクトップアプリ (Tauri)

`src-tauri/` に Tauri 2 + Rust のネイティブシェルがある。フロントエンドは通常の Vite アプリのままで、`tauri.conf.json` の `devUrl`/`frontendDist` を通じて Tauri の WebView にホストされる。

- **発表者ビュー（別ウィンドウ）**: `usePresenterView`（`src/hooks/usePresenterView.ts`）が `@tauri-apps/api/webviewWindow` の `WebviewWindow` でネイティブウィンドウを生成し、`@tauri-apps/api/event` の `emit`/`listen`（イベント名 `presenter-view`）でメインウィンドウと相互通信する。メッセージ型 `PresenterViewMessage`（`src/data/types.ts`）はブラウザ版当時の設計を維持
- **ローカルスライド選択**: `src/localSlideLoader.ts` が `@tauri-apps/plugin-dialog` でファイル選択（`slides.json` または `.spkg` パッケージ。旧 `.tgz` も後方互換で開ける）、`@tauri-apps/plugin-fs` で読み込み、Rust コマンド `allow_asset_dir`（`src-tauri/src/lib.rs`）で asset プロトコルの読み取りスコープを動的に許可し、`convertFileSrc` で `image/`・`voice/`・`theme/`・`font/` の相対参照をローカル asset URL に書き換える（`scripts/export-slides.mjs` の `extractAssetPaths` と同じ規則）。`.spkg`/`.tgz` は Rust コマンド `extract_slide_package`（`flate2`/`tar` クレート。バイト列は同一の tar+gzip 形式で拡張子に依存しない）でアプリのキャッシュディレクトリに展開し、`npm pack` の慣習に従って `package/` サブディレクトリを優先的に探す。最後に開いたパスは `@tauri-apps/plugin-store` で永続化し、次回起動時に自動復元する
- ビルド時同梱（`public/slides.json`、`VITE_SLIDE_PACKAGE` 経由の npm パッケージ／`.spkg` 配布）は変更なし。ローカル選択はあくまで起動後の上書きとして追加された機能。CLI 書き出し（`scripts/export-slides.mjs`）は `npm pack` 出力を `.spkg` へリネームするため、書き出し直後のパッケージをローカル tarball として `npm install` する運用は非対応（詳細は CONTRIBUTING.md の Slide Packages 節）
- **自動アップデート**（#121）: 起動時に 1 回だけ更新を確認する。`releases/latest/download/latest.json` の静的 URL は GitHub 仕様で prerelease を除外するため使わず、`src-tauri/src/update_check.rs` が GitHub API（`GET /repos/{owner}/{repo}/releases/latest` → `assets[]` から `latest.json` の `id` を探索 → `/repos/{owner}/{repo}/releases/assets/{id}`）でアセット URL を実行時に解決し、`UpdaterExt::updater_builder(app).endpoints(...)` で updater に渡してから `check()` する。**`tauri.conf.json` の `plugins.updater.endpoints` は JSON にコメントを書けないため、プラグイン初期化時の静的スキーマ要件を満たすだけの値で、実行時は必ず `update_check.rs` が解決した URL で上書きされる（真実源はここ）**。フロントは `src/update.ts`（`check_for_update` / `install_update` を invoke する薄い層）、`useUpdateCheck`（`src/hooks/useUpdateCheck.ts`。起動時チェック・ダイアログ開閉・インストール実行の状態を持つ）、`UpdateDialog`（`src/components/UpdateDialog.tsx`。画面遷移で閉じる＝発表・編集中に割り込まない）のみ。オフライン・GitHub API のレート制限・`latest.json` 未添付はすべて Err にし、フロント側は無言で諦める（利用を妨げない）。`@tauri-apps/plugin-updater` の JS API は動的 endpoints に対応できないため導入していない（Rust 側の独自コマンドのみを使う）

### テーマシステム

2つの方法でカスタマイズ可能:
- `slides.json` の `theme` フィールド（色・フォント・カスタム CSS）
- `public/theme-colors.json`（色のみ）

いずれも `applyTheme.ts` が CSS 変数（`--theme-primary`, `--theme-background` 等）を `document.documentElement.style` に設定する。全色に `-rgb` 変数もあり `rgba()` で使用可能。

### スタイリング規約

- **CSS 変数**（`src/styles/global.css`）: テーマカラー・フォント定義
- **グローバル CSS**: レイアウトシステム、アニメーション（`fadeInUp`）、Reveal.js オーバーライド
- **CSS Modules**: 複雑なコンポーネント固有スタイル（`Timeline.module.css` 等）
- **MUI `sx` prop**: インラインの微調整

### コード規約

- **Prettier**: セミコロンなし、シングルクォート、末尾カンマ、印刷幅 240
- **TypeScript**: strict モード、未使用変数・パラメータをエラーとして検出

## AI-SDD Instructions (v4.1.0)

<!-- sdd-workflow version: "4.1.0" -->

このプロジェクトは AI-SDD（AI駆動仕様駆動開発）ワークフローに従います。

### ドキュメント操作

`.sdd/` ディレクトリ配下のファイルを操作する際は、`.sdd/AI-SDD-PRINCIPLES.md` を参照し、AI-SDDワークフローに準拠してください。

**トリガー条件**:

- `.sdd/` 配下のファイルの読み取りまたは変更
- 新しい仕様書、設計書、要求仕様書の作成
- `.sdd/` ドキュメントを参照する機能の実装

詳細なディレクトリ構造・ファイル命名規則・ドキュメントリンク規約は、`.claude/rules/ai-sdd-instructions.md` を参照してください。
