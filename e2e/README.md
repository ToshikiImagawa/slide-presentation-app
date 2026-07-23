# E2E テスト

このディレクトリには 2 種類の E2E があります。

1. **Playwright（`*.spec.ts`）— 既定・配線済み**。アサーション付きのヘッドレス E2E。スクリーンショット撮影と同じ仕組み（`vite --mode screenshot` + Tauri IPC モック + ロケール別 fixture）を再利用するため、実機 Tauri は不要で **Linux CI でも実行できる**。
2. **WebdriverIO + tauri-driver（`*.e2e.ts.sample`）— 任意・未配線**。実 Tauri WebView 上で `asset://` スクリプト実行や別ウィンドウ発表者ビューを含めた最終確認を行うためのテンプレート。

---

## 1. Playwright E2E（既定）

```bash
npm run test:e2e            # en / ja 両ロケールで全 spec を実行
npm run test:e2e:report     # 直近の HTML レポートを開く
npx playwright test e2e/home.spec.ts   # 単一 spec
```

- 設定は `playwright.config.ts`。`webServer` が `npm run dev -- --mode screenshot` を起動し、`en`（`locale: en-US`）と `ja`（`locale: ja-JP`）の 2 プロジェクトで実行する。context の `locale` が UI 言語（`navigator.language`）と fixture 選択（`Accept-Language`）を同時に切り替える。
- 期待値は**ソースの真実から読み込む**（`assets/locales/*.json` の UI 文言、`scripts/screenshot/fixtures/slides.{en,ja}.json` のスライド内容）。文言をハードコードしないため内容変更に自動追従する（`e2e/fixtures.ts`）。
- 初回は WebKit を導入: `npx playwright install webkit`（CI は `--with-deps`）。

### spec 一覧

| ファイル | 検証内容 |
|---|---|
| `home.spec.ts` | ホーム画面のタイトル・「ファイルを開く」「サンプルを開く」・空の最近一覧、サンプル起動でデッキ描画 |
| `presentation.spec.ts` | 全 fixture スライドが section 描画される / 表紙のタイトル・サブタイトル / 矢印キーでの遷移 / ロゴ表示 |
| `settings.spec.ts` | 設定ダイアログの開閉、言語セレクト・スクロール速度入力の存在 |
| `presenter-view.spec.ts` | スピーカーノート本文・要点サマリー全項目・次スライドプレビュー・前スライド境界メッセージ |
| `layouts.spec.ts` | section / content(steps) / content(tiles) / two-column / bleed / custom の各レイアウトが期待内容を描画 |

CI では `.github/workflows/ci.yml` の `E2E (Playwright)` ジョブ（ubuntu）で実行する。

---

## 2. WebdriverIO + tauri-driver（任意・未配線）

パッケージ同梱アドオンの受け入れ基準（AC 4.5）を、実際の Tauri WebView 上で自動検証するためのセットアップ手順です。

> ⚠️ 実機（ディスプレイ）と追加依存が必要で、`npm test`（Vitest/jsdom）や上記 Playwright（ヘッドレス）では代替できない実 WebView 経路（`asset://` スクリプト実行・別ウィンドウ発表者ビュー）の最終確認用です。ロジックレベルの AC は `src/__tests__/addonLifecycle.integration.test.ts` で自動化済み。

### 前提

- [`tauri-driver`](https://tauri.app/develop/tests/webdriver/) をインストール: `cargo install tauri-driver`
- プラットフォームの WebDriver:
  - **Linux**: `WebKitWebDriver`（`webkit2gtk-driver`）
  - **Windows**: `msedgedriver`（WebView2 に対応するバージョン）
  - macOS: WKWebView は WebDriver 非対応のため、Linux/Windows で実施する（macOS は手動チェックリストで代替）

### 依存の追加

```bash
npm i -D @wdio/cli @wdio/local-runner @wdio/mocha-framework @wdio/spec-reporter webdriverio
```

`package.json` に追加するスクリプト（Playwright の `test:e2e` と名前が衝突するため別名にする）:

```jsonc
{
  "scripts": {
    "pretest:e2e:wdio": "npm run tauri:build -- --debug",
    "test:e2e:wdio": "wdio run e2e/wdio.conf.ts"
  }
}
```

### 設定・スペック

- `e2e/wdio.conf.ts` … tauri-driver をサービスとして起動し、ビルド済みバイナリを `capabilities` に指定する
- `e2e/specs/addon-lifecycle.e2e.ts.sample` … AC 4.5 を自動化するスペックのテンプレート（`.sample` を外して有効化）

スペックが検証する項目:

1. 同梱アドオン付き `.tgz` を開き、コンポーネントが解決される（AC-1）
2. A→B→A 切替で残留・混線が起きない（AC-2）
3. 同一パッケージ再オープンで `<script>` が二重注入されない（AC-3）
4. 発表者ビューでも解決される（AC-4）
5. 確認ダイアログで拒否するとアドオン無効・スライドは開ける（AC-5/6）

### 補足

- テスト用 `.tgz` は事前に `npm run export:slides -- --name pkgA --slides slides.json --addons` で生成しておく
- 確認ダイアログ（`plugin-dialog` の `ask`）は E2E ではネイティブダイアログのため、テスト前に `plugin-store` の `addonTrust` を書き込むか、モックビルドフラグで自動許可する経路を用意すると安定する
