import { expect, test } from '@playwright/test'
import { expected, openSample } from './fixtures'

/**
 * ショートカット一覧の唯一の真実源はアプリ内ダイアログ（README には表を置かない）。
 *
 * Reveal は `?`（Shift + /）と `F1` で英語固定の組み込みヘルプを開くため、`useReveal` で
 * `help: false` にして抑止している。この spec はその抑止と一覧の内容を固定する。
 *
 * 注意: Playwright の `press('?')` は実機と違い `shiftKey: false` で keyCode 191 を送るため、
 * Reveal 側では `/`（一時停止）として解釈される。そのため「? で一時停止しないこと」は
 * この環境では検証できない。Reveal 側の条件（keyCode 191 + Shift）は `press('Shift+/')` で再現する。
 */
test.describe('キーボードショートカット', () => {
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

  test('Reveal 組み込みのヘルプは ? でも F1 でも開かない', async ({ page }) => {
    await openSample(page)

    // 実機の ? に相当する Reveal 側の条件（keyCode 191 + Shift）
    await page.keyboard.press('Shift+/')
    await expect(page.locator('.r-overlay-help')).toHaveCount(0)

    await page.keyboard.press('F1')
    await expect(page.locator('.r-overlay-help')).toHaveCount(0)
    await expect(page.locator('.r-overlay')).toHaveCount(0)
  })

  test('Reveal 既定の一時停止（B / スラッシュ）は維持される', async ({ page }) => {
    await openSample(page)

    await page.keyboard.press('b')
    await expect(page.locator('.reveal')).toHaveClass(/paused/)
    await page.keyboard.press('b')
    await expect(page.locator('.reveal')).not.toHaveClass(/paused/)

    // help: false はヘルプだけを止め、キーバインド自体は潰していない
    await page.keyboard.press('/')
    await expect(page.locator('.reveal')).toHaveClass(/paused/)
  })

  // ダイアログの所有者が Root になったため、スライドを開いていなくても同じキーで開ける
  test('ホーム画面でも ? キーで一覧が開く', async ({ page }) => {
    await page.goto('/')
    await expect(page.getByTestId('home-screen')).toBeVisible()

    await page.keyboard.press('?')
    await expect(page.getByTestId('shortcuts-dialog')).toBeVisible()
  })

  // #126: 編集画面の Esc（編集終了）は SlideEditor 自身の window keydown 購読によるため、
  // Root 所有の他ダイアログ（ここではショートカット一覧）が開いている間も同様に止まる必要がある
  test('編集画面で ? キーの一覧を開いた状態の Esc は一覧のみ閉じて編集画面から抜けない', async ({ page }) => {
    await openSample(page)
    await page.getByTestId('edit-open').click()
    await expect(page.getByTestId('slide-editor')).toBeVisible()

    await page.keyboard.press('?')
    await expect(page.getByTestId('shortcuts-dialog')).toBeVisible()

    await page.keyboard.press('Escape')
    await expect(page.getByTestId('shortcuts-dialog')).toHaveCount(0)
    await expect(page.getByTestId('slide-editor')).toBeVisible()
  })
})
