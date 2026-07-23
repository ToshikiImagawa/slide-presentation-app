#!/usr/bin/env node
/* global document, window */
/**
 * README スクリーンショット自動撮影（Playwright WebKit + IPC モック）。
 *
 * フロー:
 *   1. vite --mode screenshot を起動（IPC を __screenshot__ モックへ alias 差し替え）
 *   2. WebKit を起動し、scenarios.mjs の各シナリオを順に実行
 *      - addInitScript で初期シナリオを注入 → goto（mount 時に正しいデータ取得）
 *      - SideNav 遷移 + steps（クリック/待機/イベント発火）
 *      - コンテンツ撮影 → macOS ウィンドウ枠を合成 → resources/screenshots/ へ保存
 *
 * 実行: node scripts/screenshot/capture-screenshots.mjs [撮影キー...]
 *   引数を渡すとそのキーのみ撮影（例: dashboard ai-chat）。
 */
import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { webkit } from 'playwright'
import { compositeChrome, renderTitleBar } from './chrome.mjs'
import { scenarios } from './scenarios.mjs'
import { DEVICE_SCALE_FACTOR, VIEWPORTS, contentViewport } from './viewports.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
// 既定は本番。検証時は SCREENSHOT_OUT で出力先を差し替え、現行PNGの上書きを避ける。
const OUT_DIR = process.env.SCREENSHOT_OUT
  ? resolve(ROOT, process.env.SCREENSHOT_OUT)
  : resolve(ROOT, 'resources/screenshots')
const URL = 'http://localhost:1420'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitForServer(url, timeoutMs = 60000) {
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

async function runStep(page, step) {
  if (step.click) await page.click(step.click, { timeout: 10000 })
  if (step.fill) await page.fill(step.fill, step.text ?? '')
  if (step.press) await page.keyboard.press(step.press)
  if (step.flushStream) await page.evaluate((k) => window.__SCREENSHOT__.flushStream(k), step.flushStream)
  if (step.scrollIntoView) await page.locator(step.scrollIntoView).scrollIntoViewIfNeeded()
  if (step.waitFor) await page.waitForSelector(step.waitFor, { timeout: 10000 })
  if (step.wait) await sleep(step.wait)
}

async function captureOne(browser, barCache, sc) {
  const vp = contentViewport(sc.key)
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  })
  // 初期シナリオを mount 前に注入（データ取得は mount 時に走るため）
  await context.addInitScript((key) => {
    window.__SCREENSHOT_INITIAL__ = key
  }, sc.scenario)

  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('nav[aria-label="メインナビゲーション"]', { timeout: 15000 })

    if (sc.nav) {
      await page.click(`nav[aria-label="メインナビゲーション"] [aria-label^="${sc.nav}"]`, { timeout: 10000 })
    }
    for (const step of sc.steps ?? []) {
      await runStep(page, step)
    }
    await page.evaluate(() => document.fonts.ready)
    await sleep(300)

    const contentBuf = await page.screenshot({ fullPage: vp.fullPage })

    // ウィンドウ枠合成
    let finalBuf = contentBuf
    if (VIEWPORTS[sc.key].chrome) {
      const barWidthPx = vp.width * DEVICE_SCALE_FACTOR
      if (!barCache.has(barWidthPx)) {
        barCache.set(barWidthPx, await renderTitleBar(browser, barWidthPx, DEVICE_SCALE_FACTOR))
      }
      finalBuf = compositeChrome(contentBuf, barCache.get(barWidthPx))
    }

    writeFileSync(resolve(OUT_DIR, `${sc.key}.png`), finalBuf)
    const status = errors.length ? `⚠ pageerror ${errors.length}件` : '✅'
    console.log(`${status}  ${sc.key}.png`)
    if (errors.length) errors.slice(0, 5).forEach((e) => console.log(`    - ${e}`))
  } catch (e) {
    console.log(`❌ ${sc.key}: ${e.message ?? e}`)
    return false
  } finally {
    await context.close()
  }
  return true
}

async function main() {
  const only = process.argv.slice(2)
  const targets = only.length ? scenarios.filter((s) => only.includes(s.key)) : scenarios
  if (!targets.length) {
    console.error(`該当シナリオなし: ${only.join(', ')}`)
    process.exit(1)
  }
  mkdirSync(OUT_DIR, { recursive: true })

  console.log('[capture] vite (screenshot mode) を起動中...')
  const vite = spawn('pnpm', ['exec', 'vite', '--mode', 'screenshot'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
  vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`))

  let browser
  try {
    await waitForServer(URL)
    console.log('[capture] vite 起動完了。WebKit を起動します。')
    browser = await webkit.launch()
    const barCache = new Map()
    const failed = []
    for (const sc of targets) {
      if (!(await captureOne(browser, barCache, sc))) failed.push(sc.key)
    }
    console.log(`\n[capture] 完了。出力先: ${OUT_DIR}`)
    // 部分的に壊れたスクショ一式が CI で無言コミットされるのを防ぐため、
    // 1 件でも失敗したら非ゼロ終了にする。
    if (failed.length) {
      console.error(`[capture] 失敗シナリオ: ${failed.join(', ')}`)
      process.exitCode = 1
    }
  } finally {
    if (browser) await browser.close()
    vite.kill('SIGTERM')
  }
}

main().catch((err) => {
  console.error('[capture] 失敗:', err)
  process.exitCode = 1
})
