#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, rmSync } from 'fs'
import { resolve, dirname } from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..')

// --- CLI引数パース ---
function parseArgs(args) {
  const result = { name: null, slides: null, version: '1.0.0' }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--name' && args[i + 1]) result.name = args[++i]
    else if (args[i] === '--slides' && args[i + 1]) result.slides = args[++i]
    else if (args[i] === '--version' && args[i + 1]) result.version = args[++i]
  }
  return result
}

// --- JSON内のアセットパスを再帰抽出 ---
function extractAssetPaths(obj) {
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
    console.error('Usage: node scripts/export-slides.mjs --name <name> --slides <slides.json>')
    console.error('  --name     パッケージ名 (例: my-presentation)')
    console.error('  --slides   public/配下のslidesファイル名 (例: slides.json)')
    console.error('  --version  バージョン (デフォルト: 1.0.0)')
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

  // 使用されているアセットディレクトリを特定
  const usedDirs = new Set(assetPaths.map((p) => p.split('/')[0]))
  const filesField = ['slides.json', ...usedDirs]

  // package.json 生成
  const packageJson = {
    name: `@slides/${args.name}`,
    version: args.version,
    description: `Slide presentation package: ${args.name}`,
    slidePresentation: {
      entry: 'slides.json',
    },
    files: filesField,
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

main()
