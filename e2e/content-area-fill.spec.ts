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
 * fill 変種を使うスライド（画像・チャート・表・図解・横フロー）は README 撮影用 fixture（slides.*.json）には
 * 無く基準見本デッキ（reference-deck.*.json）にあるため、`/slides.json` の取得を `/reference-deck.json` へ
 * 差し替えて開く。
 */

/** 実測の許容誤差（px）。サブピクセルの丸めを吸収する。src/visualChecks.ts の BOUNDS_TOLERANCE_PX と同じ思想 */
const TOLERANCE_PX = 1

/** fill 変種を使う基準見本デッキのスライド（SlideRenderer の CONTENT_BRANCHES で fill: true の分岐に対応する）。
 * 表・チャート・図解は #256 で私的な flex:1 から fill 変種へ移行したため、画像と同じ実測で担保する */
const FILL_SLIDES = [
  { id: 'layout-content-images', hasImages: true },
  { id: 'layout-content-chart-bar', hasImages: false },
  { id: 'layout-content-table', hasImages: false },
  { id: 'layout-content-diagram', hasImages: false },
  { id: 'layout-content-flow', hasImages: false },
]

/** 基準見本デッキ fixture 内での対象スライドの位置（枚数が増えても id で解決するので追随不要） */
function fillSlideIndex(projectName: string, slideId: string): number {
  const path = resolve(process.cwd(), `scripts/screenshot/fixtures/reference-deck.${lang(projectName)}.json`)
  const slides = (JSON.parse(readFileSync(path, 'utf-8')) as { slides: Array<{ id: string }> }).slides
  const index = slides.findIndex((s) => s.id === slideId)
  if (index < 0) throw new Error(`reference-deck fixture に ${slideId} がありません`)
  return index
}

/**
 * サンプルの取得先を基準見本デッキへ差し替える。
 *
 * アプリは取得先に `?locale=…` を付ける（`src/sampleSlides.ts` の `withLocaleQuery`）ため、
 * パターンは**クエリを含む URL に一致する `*` 付き**にしなければならない（付け忘れると差し替えが
 * 効かず、対象スライドが存在しないデッキが開いて hash ナビが timeout する）。
 * ロケール別 fixture の選択もそのクエリで決まるので、差し替え先の URL へ引き継ぐ。
 */
async function useReferenceDeck(page: Page, baseURL: string): Promise<void> {
  await page.route('**/slides.json*', async (route) => {
    const target = new URL('/reference-deck.json', baseURL)
    target.search = new URL(route.request().url()).search
    const response = await route.fetch({ url: target.toString() })
    await route.fulfill({ response })
  })
}

type FillMetrics = {
  areaHeight: number
  areaBottom: number
  itemHeight: number
  itemBottom: number
  imageBottoms: number[]
  warnings: string[]
}

/** 表示中スライドの本文領域と「埋める要素」を実測し、共有の見た目検査（window.__VISUAL_CHECK__）も併せて取る */
async function measureFill(page: Page): Promise<FillMetrics> {
  return page.evaluate(async () => {
    // web フォント読み込み前に測ると、フォールバックフォントの字形でわずかに大きく計測されセーフエリア侵入の
    // 誤検知になる（inspect-reference-deck.mjs も同じ理由で待っている）
    await document.fonts.ready
    const section = document.querySelector<HTMLElement>('section.present')
    if (!section) throw new Error('section.present が見つかりません')
    const area = section.querySelector<HTMLElement>('.content-area-fill')
    const item = section.querySelector<HTMLElement>('.content-area-fill-item')
    if (!area || !item) throw new Error('.content-area-fill / .content-area-fill-item が見つかりません')

    // screenshot モード限定で生える共有の見た目検査（src/visualChecks.ts）。参照の仕方は同ファイルの公開口と揃える
    const bridge = window as unknown as {
      __VISUAL_CHECK__?: (section: HTMLElement) => string[]
      __VISUAL_CHECK_WAIT_IMAGES__?: (section: HTMLElement) => Promise<{ timedOut: boolean }>
      __VISUAL_CHECK_WAIT_LAYOUT__?: (section: HTMLElement) => Promise<{ timedOut: boolean }>
      __VISUAL_CHECK_SETTLE_CLASS__?: string
    }
    // 画像の読み込み確定を待ってから実測する（固定の待ち時間だと環境の速さに依存する）
    if (bridge.__VISUAL_CHECK_WAIT_IMAGES__) await bridge.__VISUAL_CHECK_WAIT_IMAGES__(section)
    // Reveal.js 自身のレイアウト・スケール再計算が収束する前に測ると数px ずれる（アニメーションとは無関係。
    // CPU 負荷の高い並列実行で発生しうる・#297）
    if (bridge.__VISUAL_CHECK_WAIT_LAYOUT__) await bridge.__VISUAL_CHECK_WAIT_LAYOUT__(section)

    // fadeInUp 等の entrance animation は待たず、visualChecks.ts と同じ共有クラスで最終状態へ強制してから
    // getBoundingClientRect を読む（待つ実装は実行環境の速さに依存して誤検知するため・#297）。
    // 読み取り中に例外が起きても解除されるよう try/finally で括る（bridge.__VISUAL_CHECK__ は
    // 内部で同じクラスを自前に付与・解除するため、ここでは外している）
    const settleClass = bridge.__VISUAL_CHECK_SETTLE_CLASS__
    let areaRect: DOMRect
    let itemRect: DOMRect
    let imageBottoms: number[]
    if (settleClass) section.classList.add(settleClass)
    try {
      areaRect = area.getBoundingClientRect()
      itemRect = item.getBoundingClientRect()
      imageBottoms = Array.from(section.querySelectorAll('img')).map((img) => img.getBoundingClientRect().bottom)
    } finally {
      if (settleClass) section.classList.remove(settleClass)
    }
    const warnings = bridge.__VISUAL_CHECK__?.(section) ?? []

    return {
      areaHeight: areaRect.height,
      areaBottom: areaRect.bottom,
      itemHeight: itemRect.height,
      itemBottom: itemRect.bottom,
      imageBottoms,
      warnings,
    }
  })
}

/** 埋める要素の高さが本文領域と一致し、要素・画像が本文領域の外へ出ていないこと */
function expectFilled(metrics: FillMetrics, hasImages: boolean): void {
  expect(metrics.areaHeight).toBeGreaterThan(0)
  expect(Math.abs(metrics.itemHeight - metrics.areaHeight)).toBeLessThanOrEqual(TOLERANCE_PX)
  expect(metrics.itemBottom).toBeLessThanOrEqual(metrics.areaBottom + TOLERANCE_PX)
  // 画像スライドは max-height:100% の解決先が auto 高さになる破綻を拾うため、画像自体の下端も見る
  expect(metrics.imageBottoms.length > 0).toBe(hasImages)
  for (const bottom of metrics.imageBottoms) {
    expect(bottom).toBeLessThanOrEqual(metrics.areaBottom + TOLERANCE_PX)
  }
  expect(metrics.warnings).toEqual([])
}

test.describe('本文領域の fill 変種（.content-area-fill）', () => {
  for (const { id, hasImages } of FILL_SLIDES) {
    test(`${id}: 埋める要素が本文領域の残り高さいっぱいに広がる`, async ({ page, baseURL }, testInfo) => {
      await useReferenceDeck(page, baseURL!)
      await openSample(page)
      await gotoSlide(page, fillSlideIndex(testInfo.project.name, id))

      expectFilled(await measureFill(page), hasImages)
    })

    test(`${id}: ContentLayout の内側にラッパーが1枚増えても高さ解決が壊れない`, async ({ page, baseURL }, testInfo) => {
      await useReferenceDeck(page, baseURL!)
      await openSample(page)
      await gotoSlide(page, fillSlideIndex(testInfo.project.name, id))
      // 実測前にレイアウトを最終形にする（アニメーション完了待ちは measureFill 側と同じ共有ロジック）
      await measureFill(page)

      // #189（背景意匠）・#191（章）が本文領域の内側にラッパーを挟む状況を DOM 操作で再現する
      await page.evaluate(() => {
        const area = document.querySelector<HTMLElement>('section.present .content-area-fill')
        if (!area) throw new Error('.content-area-fill が見つかりません')
        const wrapper = document.createElement('div')
        while (area.firstChild) wrapper.appendChild(area.firstChild)
        area.appendChild(wrapper)
      })

      expectFilled(await measureFill(page), hasImages)
    })
  }
})
