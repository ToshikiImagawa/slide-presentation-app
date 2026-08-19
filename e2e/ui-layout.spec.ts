import { expect, test, type Locator, type Page } from '@playwright/test'
import { openSample } from './fixtures'

/**
 * README が自然言語で位置を明記している要素（「右上」「左下」等）を e2e で担保する（#124 Phase 3）。
 * 静的解析では判定できないため、対象要素の bounding box の中心点がビューポートのどの象限
 * （左上/右上/左下/右下）に入るかを実測する。厳密な px 境界ではなく象限判定に留め、
 * レイアウト微調整での過検知を避ける（issue #376 の確定した方針）。
 */
type Quadrant = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

/** scope で探索範囲を絞る。ロゴのように全スライドに同じ testid が付く要素は、呼び出し側が
 * `.reveal .slides section.present` の Locator を渡すことで表示中スライドだけに絞る */
async function quadrantOf(page: Page, scope: Page | Locator, testId: string): Promise<Quadrant> {
  const box = await scope.getByTestId(testId).boundingBox()
  if (!box) throw new Error(`bounding box not found for testid: ${testId}`)
  const viewport = page.viewportSize()
  if (!viewport) throw new Error('viewport size not available')

  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  const vertical = centerY < viewport.height / 2 ? 'top' : 'bottom'
  const horizontal = centerX < viewport.width / 2 ? 'left' : 'right'
  return `${vertical}-${horizontal}` as Quadrant
}

test.describe('自然言語のUI位置記述の担保', () => {
  // README.md:583 "the gear icon (settings button) in the upper left corner"
  // README.ja.md:574 "左上の歯車アイコン（設定ボタン）"
  test('設定ボタンは左上の象限にある', async ({ page }) => {
    await openSample(page)
    expect(await quadrantOf(page, page, 'settings-open')).toBe('top-left')
  })

  // README.md:650 "the "Presenter View" button in the upper right of the presentation screen"
  // README.ja.md:641 "プレゼンテーション画面の右上にある「発表者ビュー」ボタン"
  test('発表者ビューボタンは右上の象限にある', async ({ page }) => {
    await openSample(page)
    expect(await quadrantOf(page, page, 'presenter-view-open')).toBe('top-right')
  })

  // README.md:266 "The logo is shown in the bottom-left corner of every slide."
  // README.ja.md:260 "ロゴは全スライドの左下に表示されます。"
  test('ロゴは左下の象限にある', async ({ page }) => {
    await openSample(page)
    const presentSlide = page.locator('.reveal .slides section.present')
    expect(await quadrantOf(page, presentSlide, 'slide-logo')).toBe('bottom-left')
  })
})
