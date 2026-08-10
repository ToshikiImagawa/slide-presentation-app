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
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { webkit } from 'playwright'
import { LOCALES, sleep, startScreenshotVite, stopScreenshotVite, waitForServer } from './vite-runtime.mjs'
import { contentViewport } from './viewports.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const URL = 'http://localhost:1420'
const VIEWPORT_KEY = 'reference-deck'
// useVisualCheckWarnings.ts と同じ値（#209）。global.css の .content-area の fadeInUp は
// animation-delay 0.15s + duration 0.6s = 完了まで計750ms かかるため、700ms 待ちだと CI 実測で
// アニメーション途中の位置を拾って誤検知した（実測: PR #252 の CI で約28.8px の誤検知）
const MEASURE_DELAY_MS = 1000

/** ロケール別 fixture からスライド一覧を読む（capture-reference-deck.mjs と同じ単一真実源） */
function fixtureSlides(lang) {
  const path = resolve(ROOT, `scripts/screenshot/fixtures/reference-deck.${lang}.json`)
  return JSON.parse(readFileSync(path, 'utf-8')).slides
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
      // useVisualCheckWarnings（アプリ本体）と同じ遅延（fadeInUp 等の遷移アニメーション完了を待つ）
      await sleep(MEASURE_DELAY_MS)

      const warnings = await page.evaluate(async () => {
        const section = document.querySelector('section.present')
        const check = window.__VISUAL_CHECK__
        const waitImages = window.__VISUAL_CHECK_WAIT_IMAGES__
        if (!section) return ['section.present が見つかりません']
        if (!check) return ['window.__VISUAL_CHECK__ が公開されていません（screenshot モードのビルドを確認してください）']
        // 画像の読み込み確定前は FallbackImage が <img> を display:none にするため、確定を待ってから実測する
        if (waitImages) await waitImages(section)
        return check(section)
      })
      results.push({ locale: locale.dir, index, id: slide.id, warnings })
    }
  } finally {
    await context.close()
  }
  return results
}

function formatResult(result) {
  const label = `${result.locale}/${String(result.index).padStart(2, '0')}-${result.id}`
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
