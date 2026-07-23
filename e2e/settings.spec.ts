import { expect, test } from '@playwright/test'
import { expected, openSample } from './fixtures'

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
})
