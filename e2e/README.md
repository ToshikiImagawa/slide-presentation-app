# E2E テスト（WebdriverIO + tauri-driver）

パッケージ同梱アドオンの受け入れ基準（AC 4.5）を、実際の Tauri WebView 上で自動検証するための E2E セットアップ手順です。

> ⚠️ E2E は **実機（ディスプレイ）と追加依存**が必要で、CI/headless 環境やこのリポジトリの `npm test`（Vitest/jsdom）では実行できません。ロジックレベルの AC は `src/__tests__/addonLifecycle.integration.test.ts` で自動化済みです。本 E2E は実 WebView 経路（`asset://` スクリプト実行・別ウィンドウ発表者ビュー）を含めた最終確認用です。

## 前提

- [`tauri-driver`](https://tauri.app/develop/tests/webdriver/) をインストール: `cargo install tauri-driver`
- プラットフォームの WebDriver:
  - **Linux**: `WebKitWebDriver`（`webkit2gtk-driver`）
  - **Windows**: `msedgedriver`（WebView2 に対応するバージョン）
  - macOS: WKWebView は WebDriver 非対応のため、E2E は Linux/Windows で実施する（macOS は手動チェックリストで代替）

## 依存の追加

```bash
npm i -D @wdio/cli @wdio/local-runner @wdio/mocha-framework @wdio/spec-reporter webdriverio
```

`package.json` に追加するスクリプト:

```jsonc
{
  "scripts": {
    "pretest:e2e": "npm run tauri:build -- --debug",
    "test:e2e": "wdio run e2e/wdio.conf.ts"
  }
}
```

## 設定・スペック

- `e2e/wdio.conf.ts` … tauri-driver をサービスとして起動し、ビルド済みバイナリを `capabilities` に指定する
- `e2e/specs/addon-lifecycle.e2e.ts.sample` … AC 4.5 を自動化するスペックのテンプレート（`.sample` を外して有効化）

スペックが検証する項目（`manual-verification.md` の自動化版）:

1. 同梱アドオン付き `.tgz` を開き、コンポーネントが解決される（AC-1）
2. A→B→A 切替で残留・混線が起きない（AC-2）
3. 同一パッケージ再オープンで `<script>` が二重注入されない（AC-3）
4. 発表者ビューでも解決される（AC-4）
5. 確認ダイアログで拒否するとアドオン無効・スライドは開ける（AC-5/6）

## 補足

- テスト用 `.tgz` は事前に `npm run export:slides -- --name pkgA --slides slides.json --addons` で生成しておく
- 確認ダイアログ（`plugin-dialog` の `ask`）は E2E ではネイティブダイアログのため、テスト前に `plugin-store` の `addonTrust` を書き込むか、モックビルドフラグで自動許可する経路を用意すると安定する
