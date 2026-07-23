import { expect, test } from '@playwright/test'
import { expected } from './fixtures'

test.describe('ホーム画面', () => {
  test('タイトル・アクション・空の最近一覧を表示する', async ({ page }, testInfo) => {
    const { ui } = expected(testInfo.project.name)
    await page.goto('/')

    await expect(page.getByTestId('home-screen')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Slide Presentation App' })).toBeVisible()
    await expect(page.getByTestId('home-browse')).toContainText(ui.home.browseButton)
    await expect(page.getByTestId('home-sample')).toContainText(ui.home.sampleButton)
    await expect(page.getByText(ui.home.recentTitle)).toBeVisible()
    await expect(page.getByText(ui.home.recentEmpty)).toBeVisible()
  })

  test('サンプルを開くとホームが閉じデッキが描画される', async ({ page }) => {
    await page.goto('/')
    await page.getByTestId('home-sample').click()

    await expect(page.locator('.reveal .slides section').first()).toBeVisible()
    await expect(page.getByTestId('home-screen')).toHaveCount(0)
  })
})
