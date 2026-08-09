#!/usr/bin/env node
/**
 * 基準見本デッキ（resources/reference-deck/）の HEAD 版と作業ツリー版を比較する回帰検知ツール（#246）。
 *
 * 背景:
 * - ページ番号（Reveal.js の slideNumber: 'c/t'）・進捗バー（progress）・前後移動の矢印（controls）は
 *   いずれも Reveal.js 標準機能で、総枚数（{total}）に応じて表示内容や表示/非表示が変わる
 *   （src/hooks/useReveal.ts。位置・サイズは reveal.js の既定値のまま、src/styles/global.css は配色のみ上書き）。
 *   そのためスライド種別を1枚追加するだけで既存の全基準画像の下端に差分が出る（実測: PR #245）。
 *   矢印（.navigate-left/.navigate-right）は reveal.js の既定値で下端から高さ 58px（論理px）の位置にあり、
 *   デッキの先頭・末尾スライドは総枚数が変わると矢印の表示/非表示が切り替わるため、その1枚だけ
 *   下端 58px 論理px（= 116px @ deviceScaleFactor2の実測画像）まで差分が及ぶ（実測: 15-layout-content-chart-kpi
 *   が旧デッキの最終スライドだったケースで y=1325 まで到達）。本文領域そのものは無変化なので、
 *   比較前に下端 maskBottom px を全幅マスクしてから比較する（既定 120px = 58px論理px×2 に
 *   アンチエイリアス分の余白を加えた実測ベースの値）。
 * - TerminalAnimation（JS 駆動アニメーション。06-layout-bleed / 07-layout-custom）は
 *   `page.screenshot({ animations: 'disabled' })` 後も 0.02% 程度の残差が残る（PR #242 実測）。
 *   この残差は下端ではなく本文中央（y=527..557 付近）に出るため下端マスクでは対処できず、
 *   既知の残差として別扱いする（差分検出しても失敗にしないが、必ず出力に明示する）。
 *
 * 使い方:
 *   node scripts/screenshot/diff-reference-deck.mjs [--base <git ref>] [--mask-bottom <px>]
 *
 * 既定: --base=HEAD, --mask-bottom=120
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DECK_DIR = 'resources/reference-deck'
const LOCALES = ['en', 'ja']

// JS 駆動アニメーション（TerminalAnimation）の既知の残差（PR #242）。下端マスクでは対処できない
// （本文中央に出る）ため、差分が出ても失敗にしないが、無条件に一覧を出力し黙って除外しない。
const KNOWN_RESIDUAL_FILES = new Set(['06-layout-bleed.png', '07-layout-custom.png'])
const KNOWN_RESIDUAL_NOTE = 'JS 駆動アニメーション（TerminalAnimation）の既知の残差。animations: "disabled" では停止できない（PR #242 / issue #246）'

function parseArgs(argv) {
  const result = { base: 'HEAD', maskBottom: 120 }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base' && argv[i + 1]) result.base = argv[++i]
    else if (argv[i] === '--mask-bottom' && argv[i + 1]) result.maskBottom = Number(argv[++i])
  }
  return result
}

/** git ref 側の PNG を読む。存在しない（新規追加ファイル）場合は null */
function readRefPng(base, relPath) {
  try {
    const buf = execFileSync('git', ['show', `${base}:${relPath}`], { maxBuffer: 1024 * 1024 * 64, stdio: ['ignore', 'pipe', 'ignore'] })
    return PNG.sync.read(buf)
  } catch {
    return null
  }
}

/** git ref 側のディレクトリに存在する png ファイル名一覧 */
function refFileNames(base, dir) {
  try {
    const out = execFileSync('git', ['ls-tree', '--name-only', base, `${DECK_DIR}/${dir}/`], { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] })
    return out
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((p) => basename(p))
      .filter((name) => name.endsWith('.png'))
  } catch {
    return []
  }
}

/** 下端 maskBottom px を全幅にわたって同一色で塗りつぶす（ページ番号・進捗バー領域） */
function maskBottomRows(png, maskBottom) {
  const startY = Math.max(0, png.height - maskBottom)
  for (let y = startY; y < png.height; y++) {
    for (let x = 0; x < png.width; x++) {
      const idx = (png.width * y + x) << 2
      png.data[idx] = 0
      png.data[idx + 1] = 0
      png.data[idx + 2] = 0
      png.data[idx + 3] = 255
    }
  }
}

const DIFF_COLOR = [255, 0, 0]

/** pixelmatch の出力バッファから diffColor で描画された画素のバウンディングボックスを求める */
function boundingBoxOf(output, width, height) {
  const [dr, dg, db] = DIFF_COLOR
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2
      if (output[idx] === dr && output[idx + 1] === dg && output[idx + 2] === db && output[idx + 3] === 255) {
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  return maxX === -Infinity ? null : { minX, maxX, minY, maxY }
}

function compareFile(base, locale, name, maskBottom) {
  const relPath = `${DECK_DIR}/${locale}/${name}`
  const workPath = resolve(ROOT, relPath)
  const refPng = readRefPng(base, relPath)
  const workExists = existsSync(workPath)

  if (!refPng && workExists) return { name, status: 'added' }
  if (refPng && !workExists) return { name, status: 'removed' }
  if (!refPng || !workExists) return { name, status: 'missing' }

  const workPng = PNG.sync.read(readFileSync(workPath))
  if (refPng.width !== workPng.width || refPng.height !== workPng.height) {
    return { name, status: 'resolution-mismatch', refSize: [refPng.width, refPng.height], workSize: [workPng.width, workPng.height] }
  }

  maskBottomRows(refPng, maskBottom)
  maskBottomRows(workPng, maskBottom)

  const { width, height } = refPng
  const output = new Uint8Array(width * height * 4)
  const mismatch = pixelmatch(refPng.data, workPng.data, output, width, height, {
    threshold: 0.1,
    includeAA: false,
    diffColor: DIFF_COLOR,
  })

  if (mismatch === 0) return { name, status: 'match' }

  const bbox = boundingBoxOf(output, width, height)
  return { name, status: KNOWN_RESIDUAL_FILES.has(name) ? 'known-residual' : 'diff', mismatch, bbox }
}

function main() {
  const { base, maskBottom } = parseArgs(process.argv.slice(2))
  console.log(`[diff] 基準: ${base} vs 作業ツリー / 下端マスク: ${maskBottom}px`)
  console.log(`[diff] 既知の残差として除外（差分があっても失敗にしない）: ${[...KNOWN_RESIDUAL_FILES].join(', ')}`)
  console.log(`       理由: ${KNOWN_RESIDUAL_NOTE}\n`)

  let hasFailure = false
  const summary = {}
  const bump = (status) => (summary[status] = (summary[status] ?? 0) + 1)

  for (const locale of LOCALES) {
    const dir = resolve(ROOT, DECK_DIR, locale)
    const workNames = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')) : []
    const names = [...new Set([...refFileNames(base, locale), ...workNames])].sort()

    console.log(`## ${locale} (${names.length}枚)`)
    for (const name of names) {
      const result = compareFile(base, locale, name, maskBottom)
      bump(result.status)
      switch (result.status) {
        case 'match':
          console.log(`  ✅ ${name}`)
          break
        case 'known-residual':
          console.log(`  ⚠️  ${name}: 既知の残差として無視（差分 ${result.mismatch}px, bbox x=${result.bbox.minX}..${result.bbox.maxX} y=${result.bbox.minY}..${result.bbox.maxY}）`)
          break
        case 'diff':
          console.log(`  ❌ ${name}: 差分 ${result.mismatch}px, bbox x=${result.bbox.minX}..${result.bbox.maxX} y=${result.bbox.minY}..${result.bbox.maxY}`)
          hasFailure = true
          break
        case 'added':
          console.log(`  ➕ ${name}: ${base} に存在しない（新規追加）`)
          break
        case 'removed':
          console.log(`  ➖ ${name}: 作業ツリーに存在しない（削除）`)
          hasFailure = true
          break
        case 'resolution-mismatch':
          console.log(`  ❌ ${name}: 解像度不一致（${base}=${result.refSize.join('x')} / 作業ツリー=${result.workSize.join('x')}）`)
          hasFailure = true
          break
        default:
          console.log(`  ❌ ${name}: 不明な状態 (${result.status})`)
          hasFailure = true
      }
    }
    console.log('')
  }

  const parts = Object.entries(summary)
    .map(([status, count]) => `${status}=${count}`)
    .join(' / ')
  console.log(`[diff] まとめ: ${parts}`)

  if (hasFailure) {
    console.error('[diff] 本文領域に差分あり（または想定外の削除・解像度不一致）を検出しました。')
    process.exitCode = 1
  } else {
    console.log('[diff] 本文領域に差分なし。')
  }
}

main()
