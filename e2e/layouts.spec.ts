import { expect, test } from '@playwright/test'
import { expected, gotoSlide, openSample, slide, slideTitle } from './fixtures'

// fixture デッキ上のレイアウト別スライド（cover=0 は表紙のため presentation.spec で検証）
const LAYOUTS = [
  { index: 1, id: 'section' },
  { index: 2, id: 'workflow' },
  { index: 3, id: 'features' },
  { index: 4, id: 'two-column' },
  { index: 5, id: 'bleed' },
  { index: 6, id: 'custom' },
]

test.describe('レイアウト', () => {
  for (const { index, id } of LAYOUTS) {
    test(`${id} レイアウトがタイトルを描画する`, async ({ page }, testInfo) => {
      const target = slide(testInfo.project.name, id)
      await openSample(page)
      await gotoSlide(page, index)
      await expect(page.locator('.reveal .slides section.present')).toContainText(slideTitle(target))
    })
  }

  test('content(steps) が全ステップをタイムライン表示する', async ({ page }, testInfo) => {
    const wf = slide(testInfo.project.name, 'workflow')
    await openSample(page)
    await gotoSlide(page, 2)
    const current = page.locator('.reveal .slides section.present')
    for (const step of wf.content.steps!) {
      await expect(current).toContainText(step.title)
    }
  })

  test('content(tiles) が全タイルを表示する', async ({ page }, testInfo) => {
    const features = slide(testInfo.project.name, 'features')
    await openSample(page)
    await gotoSlide(page, 3)
    const current = page.locator('.reveal .slides section.present')
    for (const tile of features.content.tiles!) {
      await expect(current).toContainText(tile.title)
    }
  })
})
