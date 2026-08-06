#!/usr/bin/env node
/* global document */
/**
 * 基準見本デッキ（#208）の一括撮影（Playwright WebKit + Tauri IPC モック）。
 *
 * scripts/screenshot/fixtures/reference-deck.{ja,en}.json の全スライドを、ロケール（en/ja）
 * ごとに 1 枚ずつ撮影する。README 撮影用の capture-screenshots.mjs（scenarios.mjs に厳選ショットを
 * 手動列挙する設計）とは独立したスクリプトにしている: 基準見本デッキは種別を追加するたびに 1 枚
 * 増えていく前提（Epic #212）で、撮影側の手動編集を不要にするため、fixture のスライド数を動的に
 * 読み取ってループ撮影する。
 *
 * VITE_SLIDES_PATH（src/sampleSlides.ts の loadBundledSampleSlides が読む既存の環境変数）で
 * ホーム画面「サンプルを開く」の取得先を /reference-deck.json に切り替えて起動する。
 * vite.config.ts の screenshotFixturePlugin が Accept-Language でロケール別 fixture を配信する。
 *
 * 実行: node scripts/screenshot/capture-reference-deck.mjs
 */
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { webkit } from 'playwright'
import { compositeChrome, renderTitleBar } from './chrome.mjs'
import { DEVICE_SCALE_FACTOR, contentViewport } from './viewports.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
// 既定はリポジトリにコミットする出力先。検証時は SCREENSHOT_OUT で差し替え、現行PNGの上書きを避ける。
const OUT_BASE = process.env.SCREENSHOT_OUT ? resolve(ROOT, process.env.SCREENSHOT_OUT) : resolve(ROOT, 'resources/reference-deck')
const URL = 'http://localhost:1420'
const VIEWPORT_KEY = 'reference-deck'

// 撮影するロケール。code は Playwright の context locale（UI 言語 = navigator.language、
// fixture 選択 = Accept-Language の双方に効く）。dir は出力サブディレクトリ、lang は fixture ファイル名の言語コード。
const LOCALES = [
  { code: 'en-US', dir: 'en', lang: 'en' },
  { code: 'ja-JP', dir: 'ja', lang: 'ja' },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** ロケール別 fixture からスライド一覧を読む（撮影枚数・出力ファイル名の単一真実源） */
function fixtureSlides(lang) {
  const path = resolve(ROOT, `scripts/screenshot/fixtures/reference-deck.${lang}.json`)
  return JSON.parse(readFileSync(path, 'utf-8')).slides
}

async function waitForServer(url, timeoutMs = 120000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs) {
    try {
      if ((await fetch(url)).ok) return
    } catch {
      /* not up yet */
    }
    await sleep(500)
  }
  throw new Error(`vite サーバが ${timeoutMs}ms 以内に起動しませんでした`)
}

/** 1ロケール分、デッキを開いてから hash ナビで全スライドを順に撮影する（1コンテキストを再利用） */
async function captureLocale(browser, barCache, locale, outDir) {
  const slides = fixtureSlides(locale.lang)
  const vp = contentViewport(VIEWPORT_KEY)
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    locale: locale.code,
  })
  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))

  const failed = []
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="home-sample"]', { timeout: 15000 })
    await page.click('[data-testid="home-sample"]')
    await page.waitForSelector('.reveal .slides section', { timeout: 15000 })
    await sleep(500)

    const barWidthPx = vp.width * DEVICE_SCALE_FACTOR
    if (!barCache.has(barWidthPx)) {
      barCache.set(barWidthPx, await renderTitleBar(browser, barWidthPx, DEVICE_SCALE_FACTOR))
    }
    const bar = barCache.get(barWidthPx)

    for (const [index, slide] of slides.entries()) {
      await page.evaluate((h) => (window.location.hash = h), `#/${index}`)
      await page.evaluate(() => document.fonts.ready)
      await sleep(700)
      const contentBuf = await page.screenshot({ fullPage: vp.fullPage })
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
    failed.push(locale.dir)
  } finally {
    await context.close()
  }
  return failed
}

async function main() {
  for (const loc of LOCALES) mkdirSync(resolve(OUT_BASE, loc.dir), { recursive: true })

  console.log('[capture] vite (screenshot mode / reference-deck) を起動中...')
  // detached: true でプロセスグループを分離し、終了時に vite の孫プロセスごと確実に停止する
  const vite = spawn('npm', ['run', 'dev', '--', '--mode', 'screenshot'], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
    env: { ...process.env, VITE_SLIDES_PATH: '/reference-deck.json' },
  })
  vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`))

  let browser
  try {
    await waitForServer(URL)
    console.log('[capture] vite 起動完了。WebKit を起動します。')
    browser = await webkit.launch()
    const barCache = new Map()
    const failed = []
    for (const loc of LOCALES) {
      const outDir = resolve(OUT_BASE, loc.dir)
      failed.push(...(await captureLocale(browser, barCache, loc, outDir)))
    }
    console.log(`\n[capture] 完了。出力先: ${OUT_BASE}/{${LOCALES.map((l) => l.dir).join(',')}}`)
    if (failed.length) {
      console.error(`[capture] 失敗ロケール: ${failed.join(', ')}`)
      process.exitCode = 1
    }
  } finally {
    if (browser) await browser.close()
    if (vite.pid) {
      try {
        process.kill(-vite.pid, 'SIGTERM')
      } catch {
        vite.kill('SIGTERM')
      }
    }
  }
}

main().catch((err) => {
  console.error('[capture] 失敗:', err)
  process.exitCode = 1
})
