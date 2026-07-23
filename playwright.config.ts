import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright E2E 設定。
 *
 * スクリーンショット撮影と同じ仕組み（`vite --mode screenshot` + Tauri IPC モック +
 * ロケール別 fixture）を再利用し、明示的なアサーション付きの e2e テストを実行する。
 * テキスト内容ベースの検証なのでフォント描画に依存せず、Linux CI でも実行できる。
 *
 * プロジェクト `en` / `ja` の context locale が UI 言語（navigator.language）と
 * fixture 選択（Accept-Language）を同時に切り替える。
 */
export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'en', use: { ...devices['Desktop Safari'], locale: 'en-US' } },
    { name: 'ja', use: { ...devices['Desktop Safari'], locale: 'ja-JP' } },
  ],
  webServer: {
    // `npm run dev` は build:addons を実行してから vite を起動する。末尾の `--mode screenshot`
    // が vite に渡り、Tauri IPC モックと fixture 配信が有効になる。
    command: 'npm run dev -- --mode screenshot',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
