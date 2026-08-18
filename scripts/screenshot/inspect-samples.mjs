#!/usr/bin/env node
/**
 * 配布サンプル（samples/template-guide/slides.{ja,en,fr}.json）全枚数の見た目破綻検査（#113）。
 *
 * 判定ロジックは inspect-reference-deck.mjs と同一の window.__VISUAL_CHECK__（src/visualChecks.ts の
 * getVisualCheckWarnings）をそのまま呼ぶ。自前の幾何判定は書かない（#209 で共有ロジック化済み）。
 *
 * 基準見本デッキと違い配布サンプルは screenshot モードの vite が配信しない
 * （isScreenshot 時に積むのは fixture 専用の screenshotFixturePlugin のみ・devSampleSlidesPlugin は
 * dev サーバー限定）。そのため page.route で `/slides.json` への取得を samples/ の内容に直接差し替える。
 *
 * ロケール一覧は samples/manifest.json（配布サンプルの単一真実源）から導出するため、
 * ロケール追加時にこのスクリプトの変更は不要。Playwright の context locale（navigator.language /
 * Accept-Language）は assets/locales/ のファイル名（<lang>-<COUNTRY>.json）から補う。
 *
 * 実行: node scripts/screenshot/inspect-samples.mjs
 */
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { webkit } from 'playwright'
import { validateManifest } from '../export-samples.mjs'
import { startScreenshotVite, stopScreenshotVite, waitForServer } from './vite-runtime.mjs'
import { contentViewport } from './viewports.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const URL = 'http://localhost:1420'
const VIEWPORT_KEY = 'samples'

/** samples/manifest.json を読む。妥当性は export-samples.mjs の validateManifest と共有する */
function loadManifest() {
  const manifestPath = resolve(ROOT, 'samples/manifest.json')
  return JSON.parse(readFileSync(manifestPath, 'utf-8'))
}

/** assets/locales/<lang>-<COUNTRY>.json のファイル名一覧から Playwright context locale を導出する（1回だけ読む） */
function loadLocaleCodes() {
  const localesDir = resolve(ROOT, 'assets/locales')
  const codes = new Map()
  for (const file of readdirSync(localesDir)) {
    const match = /^([a-z]+)-[A-Z]+\.json$/.exec(file)
    if (match) codes.set(match[1], file.replace(/\.json$/, ''))
  }
  return codes
}

/** manifest の packages から検査対象ロケール一覧を組み立てる（fr を含む・#113） */
function buildLocales(manifest) {
  const sourceDir = resolve(ROOT, manifest.source)
  const localeCodes = loadLocaleCodes()
  return manifest.packages.map((pkg) => {
    const code = localeCodes.get(pkg.locale)
    if (!code) throw new Error(`assets/locales に ${pkg.locale} のロケールファイルが見つかりません`)
    return { lang: pkg.locale, code, sourcePath: resolve(sourceDir, pkg.slides) }
  })
}

/** ログ表示用のスライド識別ラベル（`locale/00-id`） */
function slideLabel(lang, index, id) {
  return `${lang}/${String(index).padStart(2, '0')}-${id}`
}

/**
 * 1ロケール分、配布サンプルの内容で `/slides.json` を差し替えてから開き、hash ナビで全スライドを検査する。
 *
 * パターンは末尾 `*` が必須: アプリは取得先に `?locale=…` を明示的に付ける
 * （src/sampleSlides.ts の withLocaleQuery）ため、`**\/slides.json` だけではクエリ付き URL に一致せず
 * 差し替えが発火しない。発火回数（routeHits）を数え、呼び出し元がゼロ件を検出できるようにする。
 * さらに、route が発火してもアプリ側のバリデーションで弾かれフォールバック表示になる可能性があるため、
 * 描画されたスライド数（renderedCount）を実測し、注入した枚数（expectedCount）と比較する
 * （e2e/presentation.spec.ts と同じ手法。route 発火だけを見る検証より一段深い偽陽性防止・#113）。
 */
async function inspectLocale(browser, locale, vp) {
  const raw = readFileSync(locale.sourcePath, 'utf-8')
  const slides = JSON.parse(raw).slides
  const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, locale: locale.code })
  const page = await context.newPage()
  const results = []
  let routeHits = 0

  await page.route('**/slides.json*', async (route) => {
    routeHits++
    await route.fulfill({ status: 200, contentType: 'application/json', body: raw })
  })

  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="home-sample"]', { timeout: 15000 })
    await page.click('[data-testid="home-sample"]')
    // section の存在だけでなく `.reveal.ready` を待つ。useReveal の初期化エフェクトが history.replaceState で
    // hash を消すため、これより先に hash ナビすると移動が失われる（e2e/fixtures.ts の openSample と同じ理由）
    await page.waitForSelector('.reveal.ready .slides section.present', { timeout: 15000 })

    const renderedCount = await page.evaluate(() => document.querySelectorAll('.reveal .slides > section').length)

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
        // 画像の読み込み確定前は FallbackImage が <img> を display:none にするため、確定を待ってから実測する
        const { timedOut: imagesTimedOut } = await waitImages(section)
        // Reveal.js 自身のレイアウト・スケール再計算が収束する前に測るとセーフエリア侵入と誤検知される（#297）
        const { timedOut: layoutTimedOut } = await waitLayout(section)
        return { warnings: check(section), imagesTimedOut, layoutTimedOut }
      })
      if (imagesTimedOut) {
        console.warn(`[inspect] ${slideLabel(locale.lang, index, slide.id)}: 画像の読み込み確定待ちがタイムアウトしました。実測結果が不正確な可能性があります`)
      }
      if (layoutTimedOut) {
        console.warn(`[inspect] ${slideLabel(locale.lang, index, slide.id)}: レイアウトの収束待ちがタイムアウトしました。実測結果が不正確な可能性があります`)
      }
      results.push({ lang: locale.lang, index, id: slide.id, warnings })
    }

    return { lang: locale.lang, results, routeHits, renderedCount, expectedCount: slides.length }
  } finally {
    await context.close()
  }
}

function formatResult(result) {
  const label = slideLabel(result.lang, result.index, result.id)
  if (result.warnings.length === 0) return `  ✅ ${label}`
  return [`  ❌ ${label}`, ...result.warnings.map((w) => `      - ${w}`)].join('\n')
}

async function main() {
  console.log('[inspect] vite (screenshot mode) を起動中...')
  const vite = startScreenshotVite(ROOT)

  let browser
  try {
    await waitForServer(URL)
    console.log('[inspect] vite 起動完了。WebKit を起動します。')
    browser = await webkit.launch()

    const manifest = loadManifest()
    validateManifest(manifest)
    const locales = buildLocales(manifest)
    const vp = contentViewport(VIEWPORT_KEY)
    const perLocale = await Promise.all(locales.map((locale) => inspectLocale(browser, locale, vp)))
    const allResults = perLocale.flatMap((r) => r.results)

    for (const result of allResults) {
      console.log(formatResult(result))
    }

    const routeFailures = perLocale.filter((r) => r.routeHits === 0)
    for (const r of routeFailures) {
      console.error(`[inspect] ${r.lang}: /slides.json への差し替え（page.route）が発火しませんでした。ビルド同梱の内容を検査してしまい、あふれを見逃す危険があります。`)
    }

    const countMismatches = perLocale.filter((r) => r.renderedCount !== r.expectedCount)
    for (const r of countMismatches) {
      console.error(`[inspect] ${r.lang}: 描画されたスライド数（${r.renderedCount}）が配布サンプルの枚数（${r.expectedCount}）と一致しません。差し替えた内容がアプリ側で弾かれ、フォールバック表示を検査した可能性があります。`)
    }

    const failing = allResults.filter((r) => r.warnings.length > 0)
    console.log(`\n[inspect] まとめ: ${allResults.length}枚検査 / 警告あり ${failing.length}枚`)

    if (failing.length > 0 || routeFailures.length > 0 || countMismatches.length > 0) {
      console.error('[inspect] 配布サンプルに見た目の破綻、または検査自体の失敗を検出しました。')
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
