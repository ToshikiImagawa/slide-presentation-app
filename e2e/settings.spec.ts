import { expect, test } from '@playwright/test'
import { expected, lang, localeCode, openSample } from './fixtures'

test.describe('設定ダイアログ', () => {
  test('開閉と各コントロールを検証する', async ({ page }, testInfo) => {
    const { ui } = expected(testInfo.project.name)
    await openSample(page)

    await page.getByTestId('settings-open').click()
    const dialog = page.getByTestId('settings-dialog')
    await expect(dialog).toBeVisible()

    await expect(dialog.getByText(ui.settings.title, { exact: true })).toBeVisible()
    await expect(dialog.getByText(ui.settings.language)).toBeVisible()
    await expect(dialog.locator('#language-select')).toBeVisible()
    await expect(dialog.locator('#scroll-speed-input')).toBeVisible()

    // フッターの閉じるボタン（X ボタンと同名のため last を選ぶ）
    await dialog.getByRole('button', { name: ui.settings.close }).last().click()
    await expect(page.getByTestId('settings-dialog')).toHaveCount(0)
  })

  // 初回起動時（スライド未選択）でも言語を変更できること
  test('ホーム画面から開くとグローバル設定のみ表示される', async ({ page }, testInfo) => {
    const { ui } = expected(testInfo.project.name)
    await page.goto('/')
    await expect(page.getByTestId('home-screen')).toBeVisible()

    await page.getByTestId('settings-open').click()
    const dialog = page.getByTestId('settings-dialog')
    await expect(dialog).toBeVisible()

    // 言語選択とショートカットは開ける
    await expect(dialog.getByText(ui.settings.language)).toBeVisible()
    await expect(dialog.locator('#language-select')).toBeVisible()
    await expect(dialog.getByText(ui.settings.shortcuts)).toBeVisible()

    // スクロール速度はプレゼンテーション専用設定なので出さない
    await expect(dialog.locator('#scroll-speed-input')).toHaveCount(0)
  })

  // #126: 編集画面（SlideEditor）から設定ダイアログを開けること・Esc はダイアログのみ閉じて編集画面から抜けないこと
  test('編集画面から開け、Esc はダイアログのみ閉じて編集画面から抜けない', async ({ page }, testInfo) => {
    const { ui } = expected(testInfo.project.name)
    await openSample(page)

    await page.getByTestId('edit-open').click()
    await expect(page.getByTestId('slide-editor')).toBeVisible()

    await page.getByTestId('settings-open').click()
    const dialog = page.getByTestId('settings-dialog')
    await expect(dialog).toBeVisible()
    await expect(dialog.getByText(ui.settings.language)).toBeVisible()
    // スクロール速度はプレゼンテーション専用設定なので編集画面では出さない（FR-LANG-011）
    await expect(dialog.locator('#scroll-speed-input')).toHaveCount(0)

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('settings-dialog')).toHaveCount(0)
    await expect(page.getByTestId('slide-editor')).toBeVisible()
  })

  test('ホーム画面で言語を切り替えると UI 文言が即座に変わる', async ({ page }, testInfo) => {
    const from = lang(testInfo.project.name)
    // 現在のロケールとは別の言語へ切り替える（en ↔ ja）
    const to = from === 'ja' ? 'en' : 'ja'
    const fromUi = expected(from).ui
    const toUi = expected(to).ui

    await page.goto('/')
    await expect(page.getByText(fromUi.home.sampleButton)).toBeVisible()

    await page.getByTestId('settings-open').click()
    const dialog = page.getByTestId('settings-dialog')
    await dialog.locator('#language-select').selectOption(localeCode(to))

    // ダイアログを閉じずにホーム画面の文言が切り替わる（リロードなし）
    await expect(page.getByText(toUi.home.sampleButton)).toBeVisible()
  })
})
