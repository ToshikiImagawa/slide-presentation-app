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
 * - TerminalAnimation（JS 駆動アニメーション。fixture から使用スライドを導出する）は
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
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { expectedFileNames, fixtureSlides } from './reference-deck-fixture.mjs'
import { LOCALES } from './vite-runtime.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const DECK_DIR = 'resources/reference-deck'

// JS 駆動アニメーション（`animations: 'disabled'` では停止できない）を持つコンポーネント。
// これが唯一のハードコード対象で、どのスライドが該当するかは fixture から導出する。
const JS_ANIMATED_COMPONENTS = new Set(['TerminalAnimation'])
const KNOWN_RESIDUAL_NOTE = 'JS 駆動アニメーション（TerminalAnimation）の既知の残差。animations: "disabled" では停止できない（PR #242 / issue #246）'

/** content 以下（component / left.component / right.component）で参照されるコンポーネント名を集める */
function componentNamesOf(content) {
  const names = []
  const visit = (node) => {
    if (!node || typeof node !== 'object') return
    if (typeof node.name === 'string') names.push(node.name)
  }
  visit(content?.component)
  for (const side of ['left', 'right']) visit(content?.[side]?.component)
  return names
}

/**
 * JS 駆動アニメーションを含むスライド id を fixture から導出する。
 * ハードコードしないのは、TerminalAnimation を使うスライドが 3 枚（layout-content-component /
 * layout-bleed / layout-custom）あり、2 枚と決め打つと残り 1 枚が誤検知として CI を落とすため
 * （実際に発生した。既知残差の枚数は実行ごとに揺れるので実測からの推定も当てにならない）。
 */
function deriveKnownResidualIds() {
  const ids = new Set()
  for (const locale of LOCALES) {
    for (const slide of fixtureSlides(locale.lang)) {
      if (!slide?.id) continue
      if (componentNamesOf(slide.content).some((n) => JS_ANIMATED_COMPONENTS.has(n))) ids.add(slide.id)
    }
  }
  return ids
}

// 下端マスクでは対処できない（本文中央に出る）ため、差分が出ても失敗にしないが、
// 無条件に一覧を出力し黙って除外しない。ファイル名は連番プレフィックス（00-, 01-, ...）を除いた
// slide id で判定する。デッキへのスライド挿入で連番がずれても判定が壊れないようにするため。
const KNOWN_RESIDUAL_IDS = deriveKnownResidualIds()

function slideIdOf(name) {
  return name.replace(/^\d+-/, '').replace(/\.png$/, '')
}

function isKnownResidual(name) {
  return KNOWN_RESIDUAL_IDS.has(slideIdOf(name))
}

function parseArgs(argv) {
  const result = { base: 'HEAD', maskBottom: 120 }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base' && argv[i + 1]) result.base = argv[++i]
    else if (argv[i] === '--mask-bottom' && argv[i + 1]) result.maskBottom = Number(argv[++i])
  }
  return result
}

/** git コマンドを実行し、失敗（対象が存在しない等）した場合は null を返す */
function tryGit(args, options) {
  try {
    return execFileSync('git', args, { stdio: ['ignore', 'pipe', 'ignore'], ...options })
  } catch {
    return null
  }
}

/** git ref 側の PNG を読む。存在しない（新規追加ファイル）場合は null */
function readRefPng(base, relPath) {
  const buf = tryGit(['show', `${base}:${relPath}`], { maxBuffer: 1024 * 1024 * 64 })
  return buf ? PNG.sync.read(buf) : null
}

/** 下端 maskBottom px を全幅にわたって同一色（不透明黒）で塗りつぶす（ページ番号・進捗バー領域） */
function maskBottomRows(png, maskBottom) {
  const rowBytes = png.width * 4
  const startOffset = Math.max(0, png.height - maskBottom) * rowBytes
  const endOffset = png.height * rowBytes
  png.data.fill(0, startOffset, endOffset)
  for (let i = startOffset + 3; i < endOffset; i += 4) png.data[i] = 255 // alpha
}

const DIFF_COLOR = [255, 0, 0]

/** pixelmatch の出力バッファから diffColor で描画された画素のバウンディングボックスを求める（マスク済みの下端は差分が出ないため走査対象外） */
function boundingBoxOf(output, width, height, maskBottom) {
  const [dr, dg, db] = DIFF_COLOR
  const scanHeight = height - maskBottom
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity
  for (let y = 0; y < scanHeight; y++) {
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

function formatBBox(bbox) {
  return `x=${bbox.minX}..${bbox.maxX} y=${bbox.minY}..${bbox.maxY}`
}

function compareFile(base, locale, name, maskBottom) {
  const relPath = `${DECK_DIR}/${locale}/${name}`
  const workPath = resolve(ROOT, relPath)
  const refPng = readRefPng(base, relPath)
  const workExists = existsSync(workPath)

  if (!refPng && !workExists) return { name, status: 'missing', failure: true }
  if (!refPng) return { name, status: 'added', failure: false }
  if (!workExists) return { name, status: 'removed', failure: true }

  const workPng = PNG.sync.read(readFileSync(workPath))
  if (refPng.width !== workPng.width || refPng.height !== workPng.height) {
    return { name, status: 'resolution-mismatch', failure: true, refSize: [refPng.width, refPng.height], workSize: [workPng.width, workPng.height] }
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

  if (mismatch === 0) return { name, status: 'match', failure: false }

  const bbox = boundingBoxOf(output, width, height, maskBottom)
  const known = isKnownResidual(name)
  return { name, status: known ? 'known-residual' : 'diff', failure: !known, mismatch, bbox }
}

function formatResultLine(result, base) {
  switch (result.status) {
    case 'match':
      return `  ✅ ${result.name}`
    case 'known-residual':
      return `  ⚠️  ${result.name}: 既知の残差として無視（差分 ${result.mismatch}px, bbox ${formatBBox(result.bbox)}）`
    case 'diff':
      return `  ❌ ${result.name}: 差分 ${result.mismatch}px, bbox ${formatBBox(result.bbox)}`
    case 'added':
      return `  ➕ ${result.name}: ${base} に存在しない（新規追加）`
    case 'removed':
      return `  ➖ ${result.name}: 作業ツリーに存在しない（削除）`
    case 'resolution-mismatch':
      return `  ❌ ${result.name}: 解像度不一致（${base}=${result.refSize.join('x')} / 作業ツリー=${result.workSize.join('x')}）`
    case 'missing':
      return `  ❌ ${result.name}: ${base}・作業ツリーの両方に存在しない`
    default:
      return `  ❌ ${result.name}: 不明な状態 (${result.status})`
  }
}

function main() {
  const { base, maskBottom } = parseArgs(process.argv.slice(2))
  console.log(`[diff] 基準: ${base} vs 作業ツリー / 下端マスク: ${maskBottom}px`)
  console.log(`[diff] 既知の残差として除外（差分があっても失敗にしない）: ${[...KNOWN_RESIDUAL_IDS].join(', ')}`)
  console.log(`       理由: ${KNOWN_RESIDUAL_NOTE}\n`)

  let hasFailure = false
  const summary = {}
  const bump = (status) => (summary[status] = (summary[status] ?? 0) + 1)

  for (const { dir: locale, lang } of LOCALES) {
    // 比較対象は fixture から導出した期待ファイル名のみ（ディレクトリの実ファイル列挙をやめる）。
    // 孤児（fixture に対応するスライドが無い PNG）を比較対象に含めない（#293）。孤児・欠落の検知は
    // check-reference-deck-files.mjs が担う
    const names = expectedFileNames(lang)

    console.log(`## ${locale} (${names.length}枚)`)
    for (const name of names) {
      const result = compareFile(base, locale, name, maskBottom)
      bump(result.status)
      console.log(formatResultLine(result, base))
      if (result.failure) hasFailure = true
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
