#!/usr/bin/env node

/**
 * ブランドテーマ単体（ThemeData JSON + 参照アセット）を配布用に書き出す（#210）。
 *
 * デッキ同梱前提の export-slides.mjs とは異なり、meta.brandTheme が直接指す ThemeData JSON を
 * 対象にする。アセット抽出・フォント再配布除外は export-slides.mjs の関数を再利用し、
 * 規則を単一真実源に保つ。
 */

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath, pathToFileURL } from 'url'
import { extractAssetPaths, extractProhibitedFontPaths } from './export-slides.mjs'

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
    // 配布先の公開URL基準（例: GitHub Releases の特定タグの download URL）。バージョンごとに異なる URL を渡すことで
    // バージョニングを表現する（theme.json 自体のファイル名にはバージョンを持たせない。指定時はアセット参照をこの URL 基準の
    // 絶対URLへ焼き込む。未指定時は相対パスのまま出力し、実行側の fetchThemeData（resolveRemoteAssetPaths）
    // による取得元URL基準の解決に委ねる（ディレクトリ構造を保って配置するホスティングを想定）
    else if (args[i] === '--base-url' && args[i + 1]) result.baseUrl = args[++i]
    else if (args[i] === '--strict') result.strict = true
  }
  return result
}

// --- redistribution: 'prohibited' なフォントを除外した上で書き出し対象アセットを確定する（#171 と対称） ---
export function resolveExportedAssets(themeData) {
  const paths = new Set(extractAssetPaths(themeData))
  for (const prohibited of extractProhibitedFontPaths(themeData)) {
    if (paths.delete(prohibited)) {
      console.warn(`Warning: ${prohibited} は redistribution: 'prohibited' のため書き出し対象から除外しました`)
    }
  }
  return [...paths]
}

// --- ThemeData 内のアセット参照パスを baseUrl 基準の絶対URLへ書き換える（純粋関数）。
//     src/applyTheme.ts の resolveRemoteAssetPaths と対称の規則（image/voice/theme/font 接頭辞） ---
export function bakeBaseUrl(value, baseUrl) {
  const prefixes = ['image/', 'voice/', 'theme/', 'font/']
  if (typeof value === 'string') {
    const normalized = value.replace(/^\//, '')
    if (prefixes.some((p) => normalized.startsWith(p))) {
      return new URL(normalized, baseUrl).href
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => bakeBaseUrl(item, baseUrl))
  }
  if (value && typeof value === 'object') {
    const result = {}
    for (const [key, v] of Object.entries(value)) {
      result[key] = bakeBaseUrl(v, baseUrl)
    }
    return result
  }
  return value
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

  let copiedCount = 0
  const missingAssets = []
  for (const assetPath of assetPaths) {
    const src = resolve(sourceDir, assetPath)
    const dest = resolve(outDir, assetPath)
    if (existsSync(src)) {
      mkdirSync(dirname(dest), { recursive: true })
      cpSync(src, dest)
      copiedCount++
    } else {
      missingAssets.push(src)
      console.warn(`Warning: ${src} が見つかりません（スキップ）`)
    }
  }
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
