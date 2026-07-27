import { expect, test } from '@playwright/test'
import { expected, openSample, slide } from './fixtures'

test.describe('プレゼンテーション', () => {
  test('fixture の全スライドが section として描画される', async ({ page }, testInfo) => {
    const { slides } = expected(testInfo.project.name)
    await openSample(page)
    await expect(page.locator('.reveal .slides > section')).toHaveCount(slides.length)
  })

  test('表紙にタイトルとサブタイトルが表示される', async ({ page }, testInfo) => {
    const cover = slide(testInfo.project.name, 'cover')
    await openSample(page)
    const current = page.locator('.reveal .slides section.present')
    await expect(current).toContainText('Slide Presentation App')
    if (cover.content.subtitle) {
      // subtitle は <br/> を含むため、先頭の一節で照合する
      const firstLine = cover.content.subtitle.split('<br/>')[0]
      await expect(current).toContainText(firstLine)
    }
  })

  test('矢印キーで次のスライドへ進む', async ({ page }, testInfo) => {
    const section = slide(testInfo.project.name, 'section')
    await openSample(page)
    await expect(page.locator('section.present')).toContainText('Slide Presentation App')
    await page.keyboard.press('ArrowRight')
    await expect(page.locator('section.present')).toContainText(section.content.title!)
  })

  test('ロゴが左下に表示される', async ({ page }) => {
    await openSample(page)
    await expect(page.locator('.slide-logo img')).toBeVisible()
  })
})
