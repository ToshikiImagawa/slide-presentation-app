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
 * 自己検証も兼ねる（#125）: シナリオの `assert` フィールドで「目的の画面が写っているか」を撮影直前に
 * 検証し、失敗を例外として既存の ❌ 経路に乗せる。加えて撮影完了後、同一ロケール内で PNG の md5 が
 * 重複していないかを確認する（待受は満たしたが違う画面が写った事故 = 写り込み事故の検出）。
 * ロケール間は文言が異なるため意図的に比較しない（同名シナリオが偶然一致しても偽陽性にしない）。
 * 日本語フォント・WebKit 描画差のため macOS での実行を前提とする。
 *
 * 実行: node scripts/screenshot/capture-screenshots.mjs [撮影キー...]
 *   引数を渡すとそのキーのみ撮影（例: home presenter-view）。
 *
 * UI 変更時の検証用に、本番の scenarios.mjs / viewports.mjs を書き換えずに一時シナリオを撮る仕組み
 * （#125 Phase3）: `SCREENSHOT_SCENARIOS=<モジュールパス>` を指定すると、`scenarios` / `viewports` の
 * 両方を export するそのモジュールを本番定義の代わりに読み込む。`SCREENSHOT_OUT`（既存）と併用して
 * 本番 PNG と出力先を分けること。手順は CLAUDE.md 参照。
 */
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { webkit } from 'playwright'
import { compositeChrome, renderTitleBar } from './chrome.mjs'
import { scenarios as builtinScenarios } from './scenarios.mjs'
import { LOCALES, sleep, startScreenshotVite, stopScreenshotVite, waitForServer } from './vite-runtime.mjs'
import { DEVICE_SCALE_FACTOR, VIEWPORTS as builtinViewports, contentViewportOf } from './viewports.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
// 既定は本番。検証時は SCREENSHOT_OUT で出力先ベースを差し替え、現行PNGの上書きを避ける。
// 実際の出力はこのベース配下のロケール別サブディレクトリ（en/ ja/）。
const OUT_BASE = process.env.SCREENSHOT_OUT ? resolve(ROOT, process.env.SCREENSHOT_OUT) : resolve(ROOT, 'resources/screenshots')
const URL = 'http://localhost:1420'

/** 撮影に使う scenarios/viewports を決める。既定は本番定義。
 * `SCREENSHOT_SCENARIOS` が指定されていれば、両方を export する外部モジュールに丸ごと差し替える
 * （本番の scenarios.mjs / viewports.mjs は一切変更しない。#125 Phase3）。
 */
async function loadScenarioSource() {
  const overridePath = process.env.SCREENSHOT_SCENARIOS
  if (!overridePath) return { scenarios: builtinScenarios, viewports: builtinViewports }
  const mod = await import(pathToFileURL(resolve(process.cwd(), overridePath)).href)
  if (!mod.scenarios || !mod.viewports) {
    throw new Error(`SCREENSHOT_SCENARIOS=${overridePath} は scenarios と viewports の両方を export する必要があります`)
  }
  return { scenarios: mod.scenarios, viewports: mod.viewports }
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

/** シナリオの assert（撮影直前に「目的の画面が写っているか」を検証する）を実行する。
 * 待受セレクタは満たしたが目的の画面が写っていない事故（#125 の layout-bleed = home 事故）を検出する。
 */
async function checkAssert(page, sc, locale) {
  if (!sc.assert) return
  const expected = sc.assert(locale.lang)
  const actual = (await page.locator('.reveal .slides section.present').textContent()) ?? ''
  if (!actual.includes(expected)) {
    throw new Error(`assert 失敗: "${expected}" が section.present に見つからない（実際のテキスト先頭200文字: ${actual.slice(0, 200)}）`)
  }
}

/** 1シナリオを撮影する。成功時は `{ ok: true, md5 }`、失敗時は `{ ok: false }` を返す */
async function captureOne(browser, barCache, sc, locale, outDir, viewports) {
  const vp = contentViewportOf(viewports, sc.key)
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
    await checkAssert(page, sc, locale)

    const contentBuf = await page.screenshot({ fullPage: vp.fullPage })

    // macOS ウィンドウ枠合成
    let finalBuf = contentBuf
    if (viewports[sc.key].chrome) {
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
    return { ok: true, md5: createHash('md5').update(finalBuf).digest('hex') }
  } catch (e) {
    console.log(`❌ ${locale.dir}/${sc.key}: ${e.message ?? e}`)
    return { ok: false }
  } finally {
    await context.close()
  }
}

/** 同一ロケール内で md5 が重複した撮影キーの組を返す（写り込み事故の一撃検出。#125）。
 * ロケール間は文言が異なるため意図的に比較しない。
 */
function findDuplicateMd5(hashesByLocale) {
  const duplicates = []
  for (const [dir, hashes] of hashesByLocale) {
    const keysByMd5 = new Map()
    for (const { key, md5 } of hashes) {
      if (!keysByMd5.has(md5)) keysByMd5.set(md5, [])
      keysByMd5.get(md5).push(key)
    }
    for (const keys of keysByMd5.values()) {
      if (keys.length > 1) duplicates.push({ dir, keys })
    }
  }
  return duplicates
}

async function main() {
  const { scenarios, viewports } = await loadScenarioSource()
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
  const vite = startScreenshotVite(ROOT)

  let browser
  try {
    await waitForServer(URL)
    console.log('[capture] vite 起動完了。WebKit を起動します。')
    browser = await webkit.launch()
    const barCache = new Map()
    const failed = []
    const hashesByLocale = new Map(LOCALES.map((l) => [l.dir, []]))
    // ロケール（en / ja）ごとにサブディレクトリへ撮影する
    for (const loc of LOCALES) {
      const outDir = resolve(OUT_BASE, loc.dir)
      const hashSink = hashesByLocale.get(loc.dir)
      for (const sc of targets) {
        const result = await captureOne(browser, barCache, sc, loc, outDir, viewports)
        if (result.ok) hashSink.push({ key: sc.key, md5: result.md5 })
        else failed.push(`${loc.dir}/${sc.key}`)
      }
    }
    console.log(`\n[capture] 完了。出力先: ${OUT_BASE}/{${LOCALES.map((l) => l.dir).join(',')}}`)
    // 部分的に壊れたスクショ一式が CI で無言コミットされるのを防ぐため、
    // 1 件でも失敗したら非ゼロ終了にする（e2e スモークとしての合否）。
    if (failed.length) {
      console.error(`[capture] 失敗シナリオ: ${failed.join(', ')}`)
      process.exitCode = 1
    }
    // 写り込み事故（例外は出ないが目的の画面と違う画面が撮れている）は md5 重複で検出する（#125）
    const duplicates = findDuplicateMd5(hashesByLocale)
    if (duplicates.length) {
      console.error('[capture] 写り込み事故の疑い: 同一ロケール内で md5 が重複しました')
      for (const { dir, keys } of duplicates) {
        console.error(`  - ${dir}/: ${keys.map((k) => `${k}.png`).join(' == ')}`)
      }
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
