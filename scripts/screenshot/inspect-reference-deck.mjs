#!/usr/bin/env node
/**
 * 基準見本デッキ（resources/reference-deck/ の元になる fixture・#208）全枚数の見た目破綻検査（#209）。
 *
 * はみ出し・セーフエリア侵入・マスター装飾との重なりは DOM 実測でしか判定できない
 * （ピクセル比較は撮影の非決定性の影響を受ける・diff-reference-deck.mjs のコメント参照）。
 * この検査はピクセルを1枚も撮らず `getBoundingClientRect` だけを読むため、その非決定性の影響を受けない。
 *
 * 検出ロジック（src/visualChecks.ts の `getVisualCheckWarnings`）はアプリ本体（App.tsx のトースト表示）
 * と共有する。`vite --mode screenshot` でのみ `window.__VISUAL_CHECK__` として公開されるため、
 * このスクリプトは screenshot モードの vite を起動し、Playwright の page.evaluate 経由でそれを呼ぶだけで、
 * ロジック自体は一切複製しない。
 *
 * capture-reference-deck.mjs と同じ fixture・vite 起動手順を再利用し、スクリーンショットは撮らない
 * （resources/reference-deck/ への画像出力は #200 が担当・触らない）。
 *
 * 実行: node scripts/screenshot/inspect-reference-deck.mjs
 */
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { webkit } from 'playwright'
import { fixtureSlides } from './reference-deck-fixture.mjs'
import { LOCALES, sleep, startScreenshotVite, stopScreenshotVite, waitForServer } from './vite-runtime.mjs'
import { contentViewport } from './viewports.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const URL = 'http://localhost:1420'
const VIEWPORT_KEY = 'reference-deck'

/** ログ表示用のスライド識別ラベル（`locale/00-id`）。formatResult() と診断ログの双方が使う（書き写さない） */
function slideLabel(locale, index, id) {
  return `${locale}/${String(index).padStart(2, '0')}-${id}`
}

/** 1ロケール分、デッキを開いてから hash ナビで全スライドを順に検査する */
async function inspectLocale(browser, locale, vp) {
  const slides = fixtureSlides(locale.lang)
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: locale.code })
  const page = await context.newPage()
  const results = []

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="home-sample"]', { timeout: 15000 })
    await page.click('[data-testid="home-sample"]')
    await page.waitForSelector('.reveal .slides section', { timeout: 15000 })
    await sleep(500)

    for (const [index, slide] of slides.entries()) {
      await page.evaluate((h) => (window.location.hash = h), `#/${index}`)
      await page.evaluate(() => document.fonts.ready)

      const { warnings, imagesTimedOut, layoutTimedOut } = await page.evaluate(async () => {
        const section = document.querySelector('section.present')
        const check = window.__VISUAL_CHECK__
        const waitImages = window.__VISUAL_CHECK_WAIT_IMAGES__
        const waitLayout = window.__VISUAL_CHECK_WAIT_LAYOUT__
        if (!section) return { warnings: ['section.present が見つかりません'], imagesTimedOut: false, layoutTimedOut: false }
        if (!check || !waitImages || !waitLayout) return { warnings: ['window.__VISUAL_CHECK__ が公開されていません（screenshot モードのビルドを確認してください）'], imagesTimedOut: false, layoutTimedOut: false }
        // 画像の読み込み確定前は FallbackImage が <img> を display:none にするため、確定を待ってから実測する。
        // timedOut は画像読み込みが打ち切られたことを示す診断情報（黙って起きない・#297）
        const { timedOut: imagesTimedOut } = await waitImages(section)
        // Reveal.js 自身のレイアウト・スケール再計算が収束する前に測ると .slide-title が数px ずれて
        // セーフエリア侵入と誤検知される（CPU 負荷の高い CI で発生。fadeInUp とは無関係・#297）
        const { timedOut: layoutTimedOut } = await waitLayout(section)
        // fadeInUp 等のentrance animationは待たない。check() が実測直前に最終状態へ強制するため、
        // 実行環境の速さに実測結果が左右されない（#297。待ちロジックは削除済み・アプリ本体の
        // useVisualCheckWarnings と同じ方針を共有する・src/visualChecks.ts）
        return { warnings: check(section), imagesTimedOut, layoutTimedOut }
      })
      if (imagesTimedOut) {
        console.warn(`[inspect] ${slideLabel(locale.dir, index, slide.id)}: 画像の読み込み確定待ちがタイムアウトしました。実測結果が不正確な可能性があります`)
      }
      if (layoutTimedOut) {
        console.warn(`[inspect] ${slideLabel(locale.dir, index, slide.id)}: レイアウトの収束待ちがタイムアウトしました。実測結果が不正確な可能性があります`)
      }
      results.push({ locale: locale.dir, index, id: slide.id, warnings })
    }
  } finally {
    await context.close()
  }
  return results
}

function formatResult(result) {
  const label = slideLabel(result.locale, result.index, result.id)
  if (result.warnings.length === 0) return `  ✅ ${label}`
  return [`  ❌ ${label}`, ...result.warnings.map((w) => `      - ${w}`)].join('\n')
}

async function main() {
  console.log('[inspect] vite (screenshot mode / reference-deck) を起動中...')
  const vite = startScreenshotVite(ROOT, { VITE_SLIDES_PATH: '/reference-deck.json' })

  let browser
  try {
    await waitForServer(URL)
    console.log('[inspect] vite 起動完了。WebKit を起動します。')
    browser = await webkit.launch()

    // capture-reference-deck.mjs と同じ viewport（1280x692。基準見本デッキの撮影条件と揃える）で開く。
    // Reveal.js はデッキの設計解像度（1280x720）とこの viewport の比でスケールするため一致はしないが、
    // getVisualCheckWarnings（src/visualChecks.ts）はそのスケール差を補正して判定するため実害はない
    const vp = contentViewport(VIEWPORT_KEY)
    const allResults = (await Promise.all(LOCALES.map((locale) => inspectLocale(browser, locale, vp)))).flat()

    for (const result of allResults) {
      console.log(formatResult(result))
    }

    const failing = allResults.filter((r) => r.warnings.length > 0)
    console.log(`\n[inspect] まとめ: ${allResults.length}枚検査 / 警告あり ${failing.length}枚`)

    if (failing.length > 0) {
      console.error('[inspect] 見本デッキに見た目の破綻（はみ出し・セーフエリア侵入・装飾との重なり）を検出しました。')
      process.exitCode = 1
    } else {
      console.log('[inspect] 見た目の破綻は検出されませんでした。')
    }
  } finally {
    if (browser) await browser.close()
    stopScreenshotVite(vite)
  }
}

main().catch((err) => {
  console.error('[inspect] 失敗:', err)
  process.exitCode = 1
})
