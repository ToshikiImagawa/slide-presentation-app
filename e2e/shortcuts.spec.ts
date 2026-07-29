import { expect, test } from '@playwright/test'
import { expected, openSample } from './fixtures'

test.describe('キーボードショートカット', () => {
  // キーマップの一覧はこのダイアログだけが持つ（README には表を置かない）ため、全セクションが揃うことを検証する
  test('? キーで一覧が開き、ビューア・編集モード・発表者ビューの全セクションを表示する', async ({ page }, testInfo) => {
    const { ui } = expected(testInfo.project.name)
    await openSample(page)

    await page.keyboard.press('?')
    const dialog = page.getByTestId('shortcuts-dialog')
    await expect(dialog).toBeVisible()

    await expect(dialog.getByText(ui.shortcuts.viewerSection)).toBeVisible()
    await expect(dialog.getByText(ui.shortcuts.editSection)).toBeVisible()
    await expect(dialog.getByText(ui.shortcuts.presenterSection)).toBeVisible()
  })

  // Reveal は keyCode 191（/）を一時停止に割り当てており、? は Shift + / のため
  // useReveal でバインドを外さないと一覧を開くたびにスライドがブラックアウトする
  test('? キーで一覧を開いてもスライドは一時停止しない', async ({ page }) => {
    await openSample(page)

    await page.keyboard.press('?')
    await expect(page.getByTestId('shortcuts-dialog')).toBeVisible()

    await expect(page.locator('.reveal')).not.toHaveClass(/paused/)
  })

  test('B キーによる一時停止は従来どおり動作する', async ({ page }) => {
    await openSample(page)

    await page.keyboard.press('b')
    await expect(page.locator('.reveal')).toHaveClass(/paused/)

    await page.keyboard.press('b')
    await expect(page.locator('.reveal')).not.toHaveClass(/paused/)
  })

  // ダイアログの所有者が Root になったため、スライドを開いていなくても同じキーで開ける
  test('ホーム画面でも ? キーで一覧が開く', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('home-screen')).toBeVisible()

    await page.keyboard.press('?')
    await expect(page.getByTestId('shortcuts-dialog')).toBeVisible()
  })
})
