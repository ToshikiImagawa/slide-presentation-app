#!/usr/bin/env node

/**
 * ブランドテーマ単体（ThemeData JSON + 参照アセット）を配布用に書き出す（#210）。
 *
 * デッキ同梱前提の export-slides.mjs とは異なり、meta.brandTheme が直接指す ThemeData JSON を
 * 対象にする。アセット抽出・フォント再配布除外は export-slides.mjs の関数を再利用し、
 * 規則を単一真実源に保つ。
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, rmSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { extractAssetPaths, excludeProhibitedFonts, mapAssetPaths, copyAssets } from './export-slides.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..')

// --- CLI引数パース ---
export function parseArgs(args) {
  const result = { name: null, theme: null, source: 'public', baseUrl: null, strict: false }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) result.name = args[++i]
    else if (args[i] === '--theme' && args[i + 1]) result.theme = args[++i]
    else if (args[i] === '--source' && args[i + 1]) result.source = args[++i]
    // 配布先の公開URL基準。指定時はアセット参照を絶対URLへ焼き込む（バージョニングの表現方法。詳細は usage/CONTRIBUTING 参照）
    else if (args[i] === '--base-url' && args[i + 1]) result.baseUrl = args[++i]
    else if (args[i] === '--strict') result.strict = true
  }
  return result
}

// --- redistribution: 'prohibited' なフォントを除外した上で書き出し対象アセットを確定する（#171 と単一真実源） ---
export function resolveExportedAssets(themeData) {
  return [...excludeProhibitedFonts(new Set(extractAssetPaths(themeData)), themeData)]
}

// --- ThemeData 内のアセット参照パスを baseUrl 基準の絶対URLへ書き換える（純粋関数）。
//     src/applyTheme.ts の resolveRemoteAssetPaths と対称の規則。木構造走査自体は export-slides.mjs の
//     mapAssetPaths（image/voice/theme/font 接頭辞）を再利用し、リーフの変換だけを差し替える ---
export function bakeBaseUrl(value, baseUrl) {
  return mapAssetPaths(value, (normalized) => new URL(normalized, baseUrl).href)
}

// --- メイン処理 ---
function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!args.name || !args.theme) {
    console.error('Usage: node scripts/export-theme.mjs --name <name> --theme <theme.json> [--source <dir>] [--base-url <url>] [--strict]')
    console.error('  --name      配布名 (出力先ディレクトリ名。例: acme-brand)')
    console.error('  --theme     source ディレクトリ配下のブランドテーマ JSON ファイル名 (例: theme/acme-brand.json)')
    console.error('  --source    テーマとアセットの基準ディレクトリ (デフォルト: public)')
    console.error('  --base-url  配布先の公開URL基準（バージョンごとに異なる URL を渡すことでバージョニングを表現する）。指定時はアセット参照をこのURL基準の絶対URLへ焼き込む')
    console.error('  --strict    参照アセットが1つでも欠けていたら失敗させる (配布物のビルド用)')
    process.exit(1)
  }

  const sourceDir = resolve(projectRoot, args.source)
  const themeSourcePath = resolve(sourceDir, args.theme)
  if (!existsSync(themeSourcePath)) {
    console.error(`Error: ${themeSourcePath} が見つかりません`)
    process.exit(1)
  }

  console.log(`Exporting brand theme: ${args.theme} as ${args.name}`)

  const themeData = JSON.parse(readFileSync(themeSourcePath, 'utf-8'))
  const assetPaths = resolveExportedAssets(themeData)
  console.log(`Found ${assetPaths.length} asset references`)

  const outDir = resolve(projectRoot, 'dist-themes', args.name)
  if (existsSync(outDir)) rmSync(outDir, { recursive: true })
  mkdirSync(outDir, { recursive: true })

  const { copiedCount, missingAssets } = copyAssets(sourceDir, outDir, assetPaths)
  console.log(`Copied ${copiedCount}/${assetPaths.length} assets`)
  // 参照だけが残った配布物は開いた先でロゴ・フォント欠けになるため、配布物を作る場合はここで止める
  if (args.strict && missingAssets.length > 0) {
    console.error(`Error: 参照アセット ${missingAssets.length} 件が見つかりません（--strict）`)
    process.exit(1)
  }

  const outThemeData = args.baseUrl ? bakeBaseUrl(themeData, args.baseUrl) : themeData
  writeFileSync(resolve(outDir, 'theme.json'), JSON.stringify(outThemeData, null, 2))
  console.log('Wrote theme.json')

  console.log(`\nExport complete!`)
  console.log(`Output: dist-themes/${args.name}/`)
  console.log(`\nHost theme.json together with its asset subdirectories (image/ font/ etc.) under the same base URL,`)
  console.log(`then point meta.brandTheme at the published theme.json URL.`)
}

// 直接実行時のみ main() を走らせる（テストからの import では実行しない）
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
