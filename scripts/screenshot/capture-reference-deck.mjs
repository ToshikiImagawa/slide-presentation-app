#!/usr/bin/env node
/* global document */
/**
 * 基準見本デッキ（#208）の一括撮影（Playwright WebKit + Tauri IPC モック）。
 *
 * scripts/screenshot/fixtures/reference-deck.{ja,en}.json の全スライドを、ロケール（en/ja）
 * ごとに 1 枚ずつ撮影する。README 撮影用の capture-screenshots.mjs（scenarios.mjs に厳選ショットを
 * 手動列挙する設計）とは独立したスクリプトにしている: 基準見本デッキは種別を追加するたびに 1 枚
 * 増えていく前提（Epic #212）で、撮影側の手動編集を不要にするため、fixture のスライド数を動的に
 * 読み取ってループ撮影する。vite の起動・停止・待受は capture-screenshots.mjs と共有
 * （vite-runtime.mjs）。
 *
 * VITE_SLIDES_PATH（src/sampleSlides.ts の loadBundledSampleSlides が読む既存の環境変数）で
 * ホーム画面「サンプルを開く」の取得先を /reference-deck.json に切り替えて起動する。
 * vite.config.ts の screenshotFixturePlugin が Accept-Language でロケール別 fixture を配信する。
 *
 * 実行: node scripts/screenshot/capture-reference-deck.mjs
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { webkit } from 'playwright'
import { compositeChrome, renderTitleBar } from './chrome.mjs'
import { LOCALES, sleep, startScreenshotVite, stopScreenshotVite, waitForServer } from './vite-runtime.mjs'
import { DEVICE_SCALE_FACTOR, contentViewport } from './viewports.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
// 既定はリポジトリにコミットする出力先。検証時は SCREENSHOT_OUT で差し替え、現行PNGの上書きを避ける。
const OUT_BASE = process.env.SCREENSHOT_OUT ? resolve(ROOT, process.env.SCREENSHOT_OUT) : resolve(ROOT, 'resources/reference-deck')
const URL = 'http://localhost:1420'
const VIEWPORT_KEY = 'reference-deck'

/** ロケール別 fixture からスライド一覧を読む（撮影枚数・出力ファイル名の単一真実源） */
function fixtureSlides(lang) {
  const path = resolve(ROOT, `scripts/screenshot/fixtures/reference-deck.${lang}.json`)
  return JSON.parse(readFileSync(path, 'utf-8')).slides
}

/** タイトルバーの合成用画像をキャッシュから取得する。無ければレンダリングして登録する */
async function getOrRenderBar(browser, barCache, widthPx) {
  if (!barCache.has(widthPx)) {
    barCache.set(widthPx, await renderTitleBar(browser, widthPx, DEVICE_SCALE_FACTOR))
  }
  return barCache.get(widthPx)
}

/** 1ロケール分、デッキを開いてから hash ナビで全スライドを順に撮影する（1コンテキストを再利用） */
async function captureLocale(browser, bar, vp, locale, outDir) {
  const slides = fixtureSlides(locale.lang)
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    locale: locale.code,
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="home-sample"]', { timeout: 15000 })
    await page.click('[data-testid="home-sample"]')
    await page.waitForSelector('.reveal .slides section', { timeout: 15000 })
    await sleep(500)

    for (const [index, slide] of slides.entries()) {
      await page.evaluate((h) => (window.location.hash = h), `#/${index}`)
      await page.evaluate(() => document.fonts.ready)
      await sleep(700)
      // animations: 'disabled' で fadeInUp を最終状態に確定させる。Reveal.js は .present 付与のたびに
      // アニメーションを再生し直すため、sleep だけでは撮影タイミングが揺れて実行ごとに最大 2.4% の
      // ピクセル差が出る（git 差分ベースの回帰検知が機能しなくなる）
      const contentBuf = await page.screenshot({ fullPage: vp.fullPage, animations: 'disabled' })
      const finalBuf = compositeChrome(contentBuf, bar)
      const name = `${String(index).padStart(2, '0')}-${slide.id}.png`
      writeFileSync(resolve(outDir, name), finalBuf)
      console.log(`✅  ${locale.dir}/${name}`)
    }
    if (errors.length) {
      console.log(`⚠ pageerror ${errors.length}件`)
      errors.slice(0, 5).forEach((e) => console.log(`    - ${e}`))
    }
  } catch (e) {
    console.log(`❌ ${locale.dir}: ${e.message ?? e}`)
    return locale.dir
  } finally {
    await context.close()
  }
  return null
}

async function main() {
  for (const loc of LOCALES) mkdirSync(resolve(OUT_BASE, loc.dir), { recursive: true })

  console.log('[capture] vite (screenshot mode / reference-deck) を起動中...')
  const vite = startScreenshotVite(ROOT, { VITE_SLIDES_PATH: '/reference-deck.json' })

  let browser
  try {
    await waitForServer(URL)
    console.log('[capture] vite 起動完了。WebKit を起動します。')
    browser = await webkit.launch()

    const vp = contentViewport(VIEWPORT_KEY)
    // タイトルバーは全ロケールで同一 viewport 幅のため、並列実行前に一度だけレンダリングしておく
    // （並列化した captureLocale 側で二重レンダリングが起きないようにする）
    const barCache = new Map()
    const bar = await getOrRenderBar(browser, barCache, vp.width * DEVICE_SCALE_FACTOR)

    // ロケール（en / ja）は互いに独立した Playwright context を使うため並列に撮影する
    const failed = (await Promise.all(LOCALES.map((loc) => captureLocale(browser, bar, vp, loc, resolve(OUT_BASE, loc.dir))))).filter(Boolean)

    console.log(`\n[capture] 完了。出力先: ${OUT_BASE}/{${LOCALES.map((l) => l.dir).join(',')}}`)
    if (failed.length) {
      console.error(`[capture] 失敗ロケール: ${failed.join(', ')}`)
      process.exitCode = 1
    }
  } finally {
    if (browser) await browser.close()
    stopScreenshotVite(vite)
  }
}

main().catch((err) => {
  console.error('[capture] 失敗:', err)
  process.exitCode = 1
})
