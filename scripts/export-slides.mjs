#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync } from 'fs'
import { resolve, dirname } from 'path'
import { execSync } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..')

// --- CLI引数パース ---
export function parseArgs(args) {
  const result = { name: null, slides: null, version: '1.0.0', addons: false }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) result.name = args[++i]
    else if (args[i] === '--slides' && args[i + 1]) result.slides = args[++i]
    else if (args[i] === '--version' && args[i + 1]) result.version = args[++i]
    else if (args[i] === '--addons') {
      // `--addons` 単独なら全同梱、`--addons a,b` なら name で個別選択（層B・FR-009）
      const next = args[i + 1]
      const hasValue = next !== undefined && !next.startsWith('--')
      if (hasValue) {
        const names = next
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
        // 値を明示指定したが有効な name が0件（例: `,` や空文字）なら「同梱なし」に統一する
        // （空配列を渡して stray な空 addons/manifest.json を生成しないため）
        result.addons = names.length > 0 ? names : false
        i++
      } else {
        result.addons = true
      }
    }
  }
  return result
}

// --- 同梱対象アドオンの選択（selected が配列なら name で絞り込み、true/未指定なら全件） ---
export function selectAddons(addons, selected) {
  const list = Array.isArray(addons) ? addons : []
  if (!Array.isArray(selected)) return list
  return list.filter((addon) => selected.includes(addon?.name))
}

// --- JSON内のアセットパスを再帰抽出 ---
export function extractAssetPaths(obj) {
  const paths = new Set()
  const prefixes = ['image/', 'voice/', 'theme/', 'font/']

  function walk(value) {
    if (typeof value === 'string') {
      const normalized = value.replace(/^\//, '')
      if (prefixes.some((p) => normalized.startsWith(p))) {
        paths.add(normalized)
      }
    } else if (Array.isArray(value)) {
      value.forEach(walk)
    } else if (value && typeof value === 'object') {
      Object.values(value).forEach(walk)
    }
  }

  walk(obj)
  return [...paths]
}

// --- アドオン manifest の bundle をパッケージ相対（addons/xxx）へ書き換える ---
export function rewriteAddonManifestBundles(manifest, selected) {
  const addons = selectAddons(manifest?.addons, selected)
  return {
    ...manifest,
    addons: addons.map((addon) => ({
      ...addon,
      bundle: `addons/${String(addon.bundle).split('/').pop()}`,
    })),
  }
}

// --- package.json の files フィールドを組み立てる ---
export function buildFilesField(assetPaths, includeAddons) {
  const usedDirs = new Set(assetPaths.map((p) => p.split('/')[0]))
  const files = ['slides.json', ...usedDirs]
  if (includeAddons) files.push('addons')
  return files
}

// --- ビルド済みアドオン（addons/dist）を outDir/addons へ同梱し、manifest を相対パス化する ---
function bundleAddons(outDir, selected) {
  const addonsDistDir = resolve(projectRoot, 'addons', 'dist')
  const manifestPath = resolve(addonsDistDir, 'manifest.json')
  if (!existsSync(manifestPath)) {
    console.warn('Warning: addons/dist/manifest.json が見つかりません（アドオン未ビルド）。アドオン同梱をスキップします')
    return false
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))

  // 明示選択した name が manifest に存在しなければ警告する（タイポ検知。0件同梱を黙って通さない）
  if (Array.isArray(selected)) {
    const known = new Set((manifest.addons ?? []).map((a) => a?.name))
    for (const n of selected) {
      if (!known.has(n)) console.warn(`Warning: 未知のアドオン name: ${n}（manifest に存在しません・スキップ）`)
    }
  }

  const outAddonsDir = resolve(outDir, 'addons')
  mkdirSync(outAddonsDir, { recursive: true })

  // selected が配列なら name で絞り込み、true なら全件（層B・FR-009）
  let copied = 0
  for (const addon of selectAddons(manifest.addons, selected)) {
    const fileName = String(addon.bundle).split('/').pop()
    const src = resolve(addonsDistDir, fileName)
    if (existsSync(src)) {
      cpSync(src, resolve(outAddonsDir, fileName))
      copied++
    } else {
      console.warn(`Warning: ${src} が見つかりません（スキップ）`)
    }
  }

  // コピー側と manifest 側を同じ選択集合で絞り込む（不整合で実行時 404 を防ぐ）
  writeFileSync(resolve(outAddonsDir, 'manifest.json'), JSON.stringify(rewriteAddonManifestBundles(manifest, selected), null, 2))
  console.log(`Bundled ${copied} addon(s)`)
  return copied > 0
}

// --- READMEテンプレート読み込み ---
function generateReadme(name, assetPaths) {
  const templatePath = resolve(__dirname, 'export-slides-readme-template.md')
  if (existsSync(templatePath)) {
    let template = readFileSync(templatePath, 'utf-8')
    template = template.replace(/\{\{name}}/g, name)
    template = template.replace(/\{\{assetCount}}/g, String(assetPaths.length))
    return template
  }
  return `# @slides/${name}\n\nSlide presentation package.\n`
}

// --- メイン処理 ---
function main() {
  const args = parseArgs(process.argv.slice(2))

  if (!args.name || !args.slides) {
    console.error('Usage: node scripts/export-slides.mjs --name <name> --slides <slides.json> [--addons]')
    console.error('  --name     パッケージ名 (例: my-presentation)')
    console.error('  --slides   public/配下のslidesファイル名 (例: slides.json)')
    console.error('  --version  バージョン (デフォルト: 1.0.0)')
    console.error('  --addons   ビルド済みアドオン (addons/dist) を同梱する（`--addons a,b` で name を個別選択）')
    process.exit(1)
  }

  const slidesSourcePath = resolve(projectRoot, 'public', args.slides)
  if (!existsSync(slidesSourcePath)) {
    console.error(`Error: ${slidesSourcePath} が見つかりません`)
    process.exit(1)
  }

  console.log(`Exporting slides: ${args.slides} as @slides/${args.name}`)

  // slides.json 読み込み・アセット抽出
  const slidesData = JSON.parse(readFileSync(slidesSourcePath, 'utf-8'))
  const assetPaths = extractAssetPaths(slidesData)
  console.log(`Found ${assetPaths.length} asset references`)

  // 出力ディレクトリ準備
  const outDir = resolve(projectRoot, 'dist-slides', args.name)
  if (existsSync(outDir)) rmSync(outDir, { recursive: true })
  mkdirSync(outDir, { recursive: true })

  // slides.json コピー（正規化名）
  writeFileSync(resolve(outDir, 'slides.json'), JSON.stringify(slidesData, null, 2))
  console.log('Copied slides.json')

  // アセットファイルコピー
  let copiedCount = 0
  for (const assetPath of assetPaths) {
    const src = resolve(projectRoot, 'public', assetPath)
    const dest = resolve(outDir, assetPath)
    if (existsSync(src)) {
      mkdirSync(dirname(dest), { recursive: true })
      cpSync(src, dest)
      copiedCount++
    } else {
      console.warn(`Warning: ${src} が見つかりません（スキップ）`)
    }
  }
  console.log(`Copied ${copiedCount}/${assetPaths.length} assets`)

  // アドオン同梱（--addons 指定時のみ。値ありなら name で個別選択）
  let includeAddons = false
  if (args.addons) {
    includeAddons = bundleAddons(outDir, args.addons)
  }

  // package.json 生成
  const packageJson = {
    name: `@slides/${args.name}`,
    version: args.version,
    description: `Slide presentation package: ${args.name}`,
    slidePresentation: {
      entry: 'slides.json',
    },
    files: buildFilesField(assetPaths, includeAddons),
  }
  writeFileSync(resolve(outDir, 'package.json'), JSON.stringify(packageJson, null, 2))
  console.log('Generated package.json')

  // README 生成
  const readme = generateReadme(args.name, assetPaths)
  writeFileSync(resolve(outDir, 'README.md'), readme)
  console.log('Generated README.md')

  // npm pack
  console.log('Running npm pack...')
  const packOutput = execSync('npm pack', { cwd: outDir, encoding: 'utf-8' }).trim()
  const tgzName = packOutput.split('\n').pop()
  const tgzSource = resolve(outDir, tgzName)
  const tgzDest = resolve(projectRoot, 'dist-slides', tgzName)

  // .tgz を dist-slides/ 直下に移動
  if (tgzSource !== tgzDest) {
    cpSync(tgzSource, tgzDest)
    rmSync(tgzSource)
  }

  console.log(`\nExport complete!`)
  console.log(`Package: dist-slides/${tgzName}`)
  console.log(`\nTo install:`)
  console.log(`  npm install ./dist-slides/${tgzName}`)
}

// 直接実行時のみ main() を走らせる（テストからの import では実行しない）
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
