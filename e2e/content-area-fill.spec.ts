import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { gotoSlide, lang, openSample } from './fixtures'

/**
 * 本文領域を埋めるスライド種別のための `.content-area` fill 変種（#225）の高さ解決を実測で検証する。
 *
 * インラインスタイル・クラス名の検査（SlideRenderer.test.tsx）では「実際に残り高さいっぱいに広がったか」を
 * 判定できない。特に ContentLayout の内側にラッパー div が 1 枚増えると max-height:100% の解決先が
 * auto 高さの要素になり、画像が自然サイズで描画されて overflow: hidden に静かに切られる（#189 / #191 で
 * 起こりうる）。この spec はレイアウト後の getBoundingClientRect を読むため、その破綻を検出できる。
 *
 * fill 変種を使うスライド（画像スライド）は README 撮影用 fixture（slides.*.json）には無く基準見本デッキ
 * （reference-deck.*.json）にあるため、`/slides.json` の取得を `/reference-deck.json` へ差し替えて開く。
 */

/** 実測の許容誤差（px）。サブピクセルの丸めを吸収する。src/visualChecks.ts の BOUNDS_TOLERANCE_PX と同じ思想 */
const TOLERANCE_PX = 1

/** fadeInUp（animation-delay 0.15s + duration 0.6s）の完了を待つ。inspect-reference-deck.mjs と同じ 1000ms */
const MEASURE_DELAY_MS = 1000

const FILL_SLIDE_ID = 'layout-content-images'

/** 基準見本デッキ fixture 内での対象スライドの位置（枚数が増えても id で解決するので追随不要） */
function fillSlideIndex(projectName: string): number {
  const path = resolve(process.cwd(), `scripts/screenshot/fixtures/reference-deck.${lang(projectName)}.json`)
  const slides = (JSON.parse(readFileSync(path, 'utf-8')) as { slides: Array<{ id: string }> }).slides
  const index = slides.findIndex((s) => s.id === FILL_SLIDE_ID)
  if (index < 0) throw new Error(`reference-deck fixture に ${FILL_SLIDE_ID} がありません`)
  return index
}

/** サンプルの取得先を基準見本デッキへ差し替える（Accept-Language はそのまま転送されるのでロケール別 fixture が選ばれる） */
async function useReferenceDeck(page: Page, baseURL: string): Promise<void> {
  await page.route('**/slides.json', async (route) => {
    const response = await route.fetch({ url: new URL('/reference-deck.json', baseURL).toString() })
    await route.fulfill({ response })
  })
}

type FillMetrics = {
  areaHeight: number
  areaBottom: number
  itemHeight: number
  imageBottoms: number[]
  warnings: string[]
}

/** 表示中スライドの本文領域と「埋める要素」を実測し、共有の見た目検査（window.__VISUAL_CHECK__）も併せて取る */
async function measureFill(page: Page): Promise<FillMetrics> {
  return page.evaluate(async () => {
    const section = document.querySelector<HTMLElement>('section.present')
    if (!section) throw new Error('section.present が見つかりません')
    const area = section.querySelector<HTMLElement>('.content-area-fill')
    const item = section.querySelector<HTMLElement>('.content-area-fill-item')
    if (!area || !item) throw new Error('.content-area-fill / .content-area-fill-item が見つかりません')

    // screenshot モード限定で生える共有の見た目検査（src/visualChecks.ts）。参照の仕方は同ファイルの公開口と揃える
    const bridge = window as unknown as {
      __VISUAL_CHECK__?: (section: HTMLElement) => string[]
      __VISUAL_CHECK_WAIT_IMAGES__?: (section: HTMLElement) => Promise<void>
    }
    if (bridge.__VISUAL_CHECK_WAIT_IMAGES__) await bridge.__VISUAL_CHECK_WAIT_IMAGES__(section)

    const areaRect = area.getBoundingClientRect()
    return {
      areaHeight: areaRect.height,
      areaBottom: areaRect.bottom,
      itemHeight: item.getBoundingClientRect().height,
      imageBottoms: Array.from(section.querySelectorAll('img')).map((img) => img.getBoundingClientRect().bottom),
      warnings: bridge.__VISUAL_CHECK__?.(section) ?? [],
    }
  })
}

/** 埋める要素の高さが本文領域と一致し、画像が本文領域の外へ出ていないこと */
function expectFilled(metrics: FillMetrics): void {
  expect(metrics.areaHeight).toBeGreaterThan(0)
  expect(Math.abs(metrics.itemHeight - metrics.areaHeight)).toBeLessThanOrEqual(TOLERANCE_PX)
  expect(metrics.imageBottoms.length).toBeGreaterThan(0)
  for (const bottom of metrics.imageBottoms) {
    expect(bottom).toBeLessThanOrEqual(metrics.areaBottom + TOLERANCE_PX)
  }
  expect(metrics.warnings).toEqual([])
}

test.describe('本文領域の fill 変種（.content-area-fill）', () => {
  test('埋める要素が本文領域の残り高さいっぱいに広がる', async ({ page, baseURL }, testInfo) => {
    await useReferenceDeck(page, baseURL!)
    await openSample(page)
    await gotoSlide(page, fillSlideIndex(testInfo.project.name))
    await page.waitForTimeout(MEASURE_DELAY_MS)

    expectFilled(await measureFill(page))
  })

  test('ContentLayout の内側にラッパーが1枚増えても高さ解決が壊れない', async ({ page, baseURL }, testInfo) => {
    await useReferenceDeck(page, baseURL!)
    await openSample(page)
    await gotoSlide(page, fillSlideIndex(testInfo.project.name))
    await page.waitForTimeout(MEASURE_DELAY_MS)

    // #189（背景意匠）・#191（章）が本文領域の内側にラッパーを挟む状況を DOM 操作で再現する
    await page.evaluate(() => {
      const area = document.querySelector<HTMLElement>('section.present .content-area-fill')
      if (!area) throw new Error('.content-area-fill が見つかりません')
      const wrapper = document.createElement('div')
      while (area.firstChild) wrapper.appendChild(area.firstChild)
      area.appendChild(wrapper)
    })

    expectFilled(await measureFill(page))
  })
})
