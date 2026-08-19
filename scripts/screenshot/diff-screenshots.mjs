#!/usr/bin/env node
/**
 * README スクリーンショット（resources/screenshots/）の HEAD 版と作業ツリー版を比較し、
 * 差分率をレポートする回帰検知ツール（#125 Phase2）。
 *
 * 背景:
 * - 従来の回帰検知は git 差分ベース（画像が1bitでも変わればコミット差分に出る）で、
 *   「意図した変更」と「レンダリングノイズ（フォントアンチエイリアス等。実測 0.02% 前後 —
 *   diff-reference-deck.mjs の TerminalAnimation 残差と同オーダー）」の区別は目視に依存していた。
 * - 本ツールは pixelmatch で全撮影キー×ロケール（scenarios.mjs から導出。ハードコードしない）の
 *   差分率を算出し、NOISE_THRESHOLD_PERCENT 以下をノイズ、それを超えるものを
 *   「意味のある変更」として分離してレポートする。
 * - `--expect` で更新を意図したシナリオキーを渡すと、実際に意味のある変更が検出されたキーの集合と
 *   比較し、食い違い（意図していないのに変わった／意図したのに変化が検出されない）を検出して
 *   非ゼロ終了する。写り込み事故等の「意図しない変更」を merge 前に検知するための仕組みで、
 *   `--expect` を渡さない場合は純粋なレポートのみ（解像度不一致・想定外の削除を除き exit 0）。
 * - git の `HEAD` に存在しない撮影キー（新規シナリオの初回撮影）は `added` として扱い失敗にしない。
 *   一方で `HEAD` にあった撮影キーが作業ツリーから消えている（撮影自体が欠落した）場合は、
 *   scenarios.mjs にそのキーがまだ定義されている限り常に失敗として扱う
 *   （diff-reference-deck.mjs の「想定外の削除は常に失敗」という方針を踏襲）。
 *
 * 使い方:
 *   node scripts/screenshot/diff-screenshots.mjs [--base <git ref>] [--expect key1,key2,...]
 *
 * 既定: --base=HEAD
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'
import { readRefBuffer } from './git-ref-buffer.mjs'
import { scenarios } from './scenarios.mjs'
import { LOCALES } from './vite-runtime.mjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SHOTS_DIR = 'resources/screenshots'

// レンダリングノイズの実測値（0.02% 前後）に余白を加えた閾値。これを超えたら「意味のある変更」とみなす。
const NOISE_THRESHOLD_PERCENT = 0.05

function parseArgs(argv) {
  const result = { base: 'HEAD', expect: null }
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--base' && argv[i + 1]) result.base = argv[++i]
    else if (argv[i] === '--expect' && argv[i + 1])
      result.expect = argv[++i]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
  }
  return result
}

/** git ref 側の PNG を読む。存在しない（新規追加ファイル）場合は null */
function readRefPng(base, relPath) {
  const buf = readRefBuffer(base, relPath)
  return buf ? PNG.sync.read(buf) : null
}

function compareFile(base, locale, key) {
  const relPath = `${SHOTS_DIR}/${locale}/${key}.png`
  const workPath = resolve(ROOT, relPath)
  const refPng = readRefPng(base, relPath)
  const workExists = existsSync(workPath)

  if (!refPng && !workExists) return { key, status: 'missing' }
  if (!refPng) return { key, status: 'added' }
  if (!workExists) return { key, status: 'removed' }

  const workPng = PNG.sync.read(readFileSync(workPath))
  if (refPng.width !== workPng.width || refPng.height !== workPng.height) {
    return { key, status: 'resolution-mismatch', refSize: [refPng.width, refPng.height], workSize: [workPng.width, workPng.height] }
  }

  const { width, height } = refPng
  const output = new Uint8Array(width * height * 4)
  const mismatch = pixelmatch(refPng.data, workPng.data, output, width, height, { threshold: 0.1, includeAA: false })
  if (mismatch === 0) return { key, status: 'match', ratio: 0 }

  const ratio = (100 * mismatch) / (width * height)
  return { key, status: ratio <= NOISE_THRESHOLD_PERCENT ? 'noise' : 'changed', ratio, mismatch }
}

function formatResultLine(result, base) {
  switch (result.status) {
    case 'match':
      return `  ✅ ${result.key}: 差分なし`
    case 'noise':
      return `  ℹ️  ${result.key}: ノイズ（${result.ratio.toFixed(3)}% ≦ ${NOISE_THRESHOLD_PERCENT}%）`
    case 'changed':
      return `  🔶 ${result.key}: 意味のある変更（${result.ratio.toFixed(3)}%, ${result.mismatch}px）`
    case 'added':
      return `  ➕ ${result.key}: ${base} に存在しない（新規追加）`
    case 'removed':
      return `  ➖ ${result.key}: 作業ツリーに存在しない（想定外の削除）`
    case 'resolution-mismatch':
      return `  ❌ ${result.key}: 解像度不一致（base=${result.refSize.join('x')} / 作業ツリー=${result.workSize.join('x')}）`
    case 'missing':
      return `  ❌ ${result.key}: ${base}・作業ツリーの両方に存在しない`
    default:
      return `  ❌ ${result.key}: 不明な状態 (${result.status})`
  }
}

function main() {
  const { base, expect } = parseArgs(process.argv.slice(2))
  console.log(`[diff] 基準: ${base} vs 作業ツリー / ノイズ閾値: ${NOISE_THRESHOLD_PERCENT}%`)
  if (expect) console.log(`[diff] 変更を意図したキー: ${expect.join(', ')}`)
  console.log('')

  const changedKeys = new Set()
  const summary = {}
  const bump = (status) => (summary[status] = (summary[status] ?? 0) + 1)
  let hasHardFailure = false

  for (const { dir: locale } of LOCALES) {
    console.log(`## ${locale}`)
    for (const sc of scenarios) {
      const result = compareFile(base, locale, sc.key)
      bump(result.status)
      console.log(formatResultLine(result, base))
      if (result.status === 'changed' || result.status === 'added' || result.status === 'removed') changedKeys.add(sc.key)
      if (result.status === 'resolution-mismatch' || result.status === 'missing' || result.status === 'removed') hasHardFailure = true
    }
    console.log('')
  }

  const parts = Object.entries(summary)
    .map(([status, count]) => `${status}=${count}`)
    .join(' / ')
  console.log(`[diff] まとめ: ${parts}`)

  if (expect) {
    const expectSet = new Set(expect)
    const unexpected = [...changedKeys].filter((k) => !expectSet.has(k))
    const notDetected = expect.filter((k) => !changedKeys.has(k))
    if (unexpected.length) console.error(`[diff] ⚠ 意図していないのに変わったキー: ${unexpected.join(', ')}`)
    if (notDetected.length) console.error(`[diff] ⚠ 意図したのに変化が検出されなかったキー: ${notDetected.join(', ')}`)
    if (unexpected.length || notDetected.length) hasHardFailure = true
  }

  if (hasHardFailure) {
    console.error('[diff] 想定外の差分（または解像度不一致・欠落）を検出しました。')
    process.exitCode = 1
  } else {
    console.log('[diff] 想定外の差分はありません。')
  }
}

main()
