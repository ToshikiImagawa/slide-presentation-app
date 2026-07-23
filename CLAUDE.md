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
npm run generate-icons       # resources/icon.svg から src-tauri/icons/ を再生成（macOS 専用: sips + tauri icon）
npm run generate-screenshots # README 用スクリーンショット撮影（Playwright WebKit・macOS 専用・e2e スモーク兼用）
npm run screenshots:compare  # 実アプリ画像とモック画像の手動比較（pixelmatch）
npm run generate-docs        # README.md / CHANGELOG.md を PDF 化（docs/ に出力・puppeteer）
```

### スナップショット / e2e（スクリーンショット機構）

`npm run generate-screenshots` が唯一のブラウザ自動化で、**e2e スモークを兼ねる**（各シナリオの待受が失敗すると非ゼロ終了）。仕組み:

- `vite --mode screenshot` を起動し、Tauri IPC を `src/__screenshot__/`（`tauri-store` / `tauri-event` / `tauri-webview`）へ **Vite alias で差し替え**て素のブラウザで boot させる（本番ビルドには非混入。`@tauri-apps/api/core` は実物の plugin-fs/dialog が依存するため alias しない）。
- スライド内容はロケール別 fixture `scripts/screenshot/fixtures/slides.{ja,en}.json` を `/slides.json` として配信する（`Accept-Language` で出し分け）。
- Playwright **WebKit** で撮影し、`scripts/screenshot/chrome.mjs` が macOS ウィンドウ枠を合成。**en / ja の 2 ロケール**で撮影し、`resources/screenshots/en/`・`resources/screenshots/ja/` に出力する（Playwright の context `locale` で UI 言語と fixture を切り替え）。
- シナリオは `scripts/screenshot/scenarios.mjs`（`home` / `presentation` / `toolbar` / `settings` / `presenter-view` / `layout-*` / `logo`）。回帰検知は **git 差分ベース**（閾値自動判定はしない）。
- **日本語フォント・WebKit 描画差のため macOS で実行する**（CI は `.github/workflows/screenshots.yml` の macOS ランナー・手動 dispatch）。
- 実機 Tauri WebView 上の受け入れ検証用に WebdriverIO の雛形が `e2e/`（未配線）に別途ある。
- ドキュメントは英日 2 言語: `README.md` / `CHANGELOG.md`（英語）と `README.ja.md` / `CHANGELOG.ja.md`（日本語）。英語版は `en/`、日本語版は `ja/` のスクリーンショットを参照する。`npm run generate-docs` は全 4 ファイルを PDF 化する。

## アーキテクチャ

### データ駆動型スライドシステム

スライドは React コンポーネントではなく **JSON データ**で定義する。`public/slides.json` を配置するとカスタムスライドを表示し、存在しない場合は `src/data/default-slides.json` のテンプレートガイドを表示する。

### 起動フロー

```
main.tsx
├── loadAddons()                    # addons/manifest.json → script 挿入 → ComponentRegistry に登録
├── loadLastSlidePackage()          # 前回ローカルで開いたスライドを復元（plugin-store）
│   └── なければ fetch('/slides.json')  # バンドル済みデフォルトのロード
├── applyTheme() / applyThemeData() # テーマ適用
└── <Root>                          # presentationData / presentationKey を state で保持
    └── <App key={presentationKey} presentationData={data} onOpenSlidePackage={...} />
        ├── registerDefaultComponents()
        ├── loadPresentationData()   # バリデーション + フォールバック
        ├── useReveal()              # Reveal.js 初期化
        └── <SlideRenderer />        # layout に基づきスライド描画
```

「スライドを開く」ボタン（`OpenSlideButton`）でローカルの `slides.json` を選び直すと、`presentationKey` を更新して `App` 全体を再マウントし、新しい内容で Reveal.js を再初期化する（差分更新ではなく丸ごと作り直す設計）。

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
- **ローカルスライド選択**: `src/localSlideLoader.ts` が `@tauri-apps/plugin-dialog` でファイル選択（`slides.json` または `.tgz` パッケージ）、`@tauri-apps/plugin-fs` で読み込み、Rust コマンド `allow_asset_dir`（`src-tauri/src/lib.rs`）で asset プロトコルの読み取りスコープを動的に許可し、`convertFileSrc` で `image/`・`voice/`・`theme/`・`font/` の相対参照をローカル asset URL に書き換える（`scripts/export-slides.mjs` の `extractAssetPaths` と同じ規則）。`.tgz` は Rust コマンド `extract_slide_package`（`flate2`/`tar` クレート）でアプリのキャッシュディレクトリに展開し、`npm pack` の慣習に従って `package/` サブディレクトリを優先的に探す。最後に開いたパスは `@tauri-apps/plugin-store` で永続化し、次回起動時に自動復元する
- ビルド時同梱（`public/slides.json`、`VITE_SLIDE_PACKAGE` 経由の npm パッケージ／`.tgz` 配布）は変更なし。ローカル選択はあくまで起動後の上書きとして追加された機能

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

## AI-SDD Instructions (v4.0.0)

<!-- sdd-workflow version: "4.0.0" -->

このプロジェクトは AI-SDD（AI駆動仕様駆動開発）ワークフローに従います。

### ドキュメント操作

`.sdd/` ディレクトリ配下のファイルを操作する際は、`.sdd/AI-SDD-PRINCIPLES.md` を参照し、AI-SDDワークフローに準拠してください。

**トリガー条件**:

- `.sdd/` 配下のファイルの読み取りまたは変更
- 新しい仕様書、設計書、要求仕様書の作成
- `.sdd/` ドキュメントを参照する機能の実装

詳細なディレクトリ構造・ファイル命名規則・ドキュメントリンク規約は、`.claude/rules/ai-sdd-instructions.md` を参照してください。
