#!/usr/bin/env node
/* global document */
/**
 * README スクリーンショット自動撮影（Playwright WebKit + Tauri IPC モック）。
 *
 * フロー:
 *   1. `npm run dev -- --mode screenshot` を起動
 *      （Tauri IPC を src/__screenshot__/ のモックへ alias 差し替え、fixture を /slides.json で配信）
 *   2. WebKit を起動し、scenarios.mjs の各シナリオを順に実行
 *      - goto(path) → waitFor → steps（クリック/待機/キー入力）
 *      - コンテンツ撮影 → macOS ウィンドウ枠を合成 → resources/screenshots/ へ保存
 *
 * このスクリプトは e2e スモークを兼ねる: 1 件でも waitFor 等が失敗すると非ゼロ終了する。
 * 日本語フォント・WebKit 描画差のため macOS での実行を前提とする。
 *
 * 実行: node scripts/screenshot/capture-screenshots.mjs [撮影キー...]
 *   引数を渡すとそのキーのみ撮影（例: home presenter-view）。
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
// 既定は本番。検証時は SCREENSHOT_OUT で出力先ベースを差し替え、現行PNGの上書きを避ける。
// 実際の出力はこのベース配下のロケール別サブディレクトリ（en/ ja/）。
const OUT_BASE = process.env.SCREENSHOT_OUT ? resolve(ROOT, process.env.SCREENSHOT_OUT) : resolve(ROOT, 'resources/screenshots')
const URL = 'http://localhost:1420'

// 撮影するロケール。code は Playwright の context locale（UI 言語 = navigator.language、
// fixture 選択 = Accept-Language の双方に効く）。dir は出力サブディレクトリ。
const LOCALES = [
  { code: 'en-US', dir: 'en' },
  { code: 'ja-JP', dir: 'ja' },
]

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

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

async function runStep(page, step) {
  if (step.click) await page.click(step.click, { timeout: 15000 })
  if (step.fill) await page.fill(step.fill, step.text ?? '')
  if (step.press) await page.keyboard.press(step.press)
  if (step.hover) await page.hover(step.hover)
  // Reveal のハッシュナビ（#/2 等）で任意スライドへジャンプする（hash:true 前提）
  if (step.hash) await page.evaluate((h) => (window.location.hash = h), step.hash)
  // 撮影用の一時 CSS を注入する（例: ツールバーの opacity 強制。ページ単位＝シナリオ単位）
  if (step.addStyle) await page.addStyleTag({ content: step.addStyle })
  if (step.scrollIntoView) await page.locator(step.scrollIntoView).scrollIntoViewIfNeeded()
  if (step.waitFor) await page.waitForSelector(step.waitFor, { timeout: 15000 })
  if (step.wait) await sleep(step.wait)
}

async function captureOne(browser, barCache, sc, locale, outDir) {
  const vp = contentViewport(sc.key)
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
    // UI 言語（navigator.language）と fixture 選択（Accept-Language）を同時に切り替える
    locale: locale.code,
  })

  const page = await context.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e)))

  try {
    await page.goto(URL + (sc.path ?? '/'), { waitUntil: 'domcontentloaded' })
    if (sc.waitFor) await page.waitForSelector(sc.waitFor, { timeout: 15000 })
    for (const step of sc.steps ?? []) {
      await runStep(page, step)
    }
    await page.evaluate(() => document.fonts.ready)
    await sleep(300)

    const contentBuf = await page.screenshot({ fullPage: vp.fullPage })

    // macOS ウィンドウ枠合成
    let finalBuf = contentBuf
    if (VIEWPORTS[sc.key].chrome) {
      const barWidthPx = vp.width * DEVICE_SCALE_FACTOR
      if (!barCache.has(barWidthPx)) {
        barCache.set(barWidthPx, await renderTitleBar(browser, barWidthPx, DEVICE_SCALE_FACTOR))
      }
      finalBuf = compositeChrome(contentBuf, barCache.get(barWidthPx))
    }

    writeFileSync(resolve(outDir, `${sc.key}.png`), finalBuf)
    const status = errors.length ? `⚠ pageerror ${errors.length}件` : '✅'
    console.log(`${status}  ${locale.dir}/${sc.key}.png`)
    if (errors.length) errors.slice(0, 5).forEach((e) => console.log(`    - ${e}`))
  } catch (e) {
    console.log(`❌ ${locale.dir}/${sc.key}: ${e.message ?? e}`)
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
  for (const loc of LOCALES) mkdirSync(resolve(OUT_BASE, loc.dir), { recursive: true })

  console.log('[capture] vite (screenshot mode) を起動中...')
  // `npm run dev` は build:addons を実行してから vite を起動する。末尾に付いた
  // `--mode screenshot` は vite に渡り、Tauri IPC モックと fixture 配信が有効になる。
  // detached: true でプロセスグループを分離し、終了時に vite の孫プロセスごと確実に停止する
  // （npm → vite の入れ子のため、npm だけ kill すると vite が孤児化してジョブが終了しない）
  const vite = spawn('npm', ['run', 'dev', '--', '--mode', 'screenshot'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], detached: true })
  vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`))

  let browser
  try {
    await waitForServer(URL)
    console.log('[capture] vite 起動完了。WebKit を起動します。')
    browser = await webkit.launch()
    const barCache = new Map()
    const failed = []
    // ロケール（en / ja）ごとにサブディレクトリへ撮影する
    for (const loc of LOCALES) {
      const outDir = resolve(OUT_BASE, loc.dir)
      for (const sc of targets) {
        if (!(await captureOne(browser, barCache, sc, loc, outDir))) failed.push(`${loc.dir}/${sc.key}`)
      }
    }
    console.log(`\n[capture] 完了。出力先: ${OUT_BASE}/{${LOCALES.map((l) => l.dir).join(',')}}`)
    // 部分的に壊れたスクショ一式が CI で無言コミットされるのを防ぐため、
    // 1 件でも失敗したら非ゼロ終了にする（e2e スモークとしての合否）。
    if (failed.length) {
      console.error(`[capture] 失敗シナリオ: ${failed.join(', ')}`)
      process.exitCode = 1
    }
  } finally {
    if (browser) await browser.close()
    // プロセスグループごと停止（孤児 vite を残さない）。失敗時は単体 kill にフォールバック
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
