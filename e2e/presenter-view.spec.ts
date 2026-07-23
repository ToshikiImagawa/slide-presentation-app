import { expect, test } from '@playwright/test'
import { expected, slide } from './fixtures'

test.describe('発表者ビュー', () => {
  test('スピーカーノート・要点サマリー・前スライド境界を表示する', async ({ page }, testInfo) => {
    const { ui } = expected(testInfo.project.name)
    const cover = slide(testInfo.project.name, 'cover')
    const notes = cover.meta!.notes!

    // 別エントリを直接開く。screenshot モードの event モックが presenterViewReady に
    // 応答して /slides.json（fixture）を注入するため、単独でも実データが描画される。
    await page.goto('/presenter-view.html')
    await expect(page.getByTestId('presenter-view')).toBeVisible({ timeout: 15_000 })

    // スピーカーノート（見出しは本文にも同語が含まれるため heading ロールで特定する）
    await expect(page.getByRole('heading', { name: ui.presenterView.notesTitle })).toBeVisible()
    await expect(page.getByText(notes.speakerNotes!)).toBeVisible()

    // 要点サマリー（全項目）
    await expect(page.getByRole('heading', { name: ui.presenterView.summaryTitle })).toBeVisible()
    for (const item of notes.summary!) {
      await expect(page.getByText(item)).toBeVisible()
    }

    // 次のスライドプレビュー（section スライドのタイトル）
    await expect(page.getByText(slide(testInfo.project.name, 'section').content.title!)).toBeVisible()

    // 前のスライドは境界メッセージ（最初のスライド）
    await expect(page.getByText(ui.presenterView.firstSlide)).toBeVisible()
  })
})
