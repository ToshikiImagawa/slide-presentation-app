#!/usr/bin/env node

/**
 * 配布サンプル（テンプレートガイド）を .spkg として書き出す。
 *
 * samples/manifest.json の packages を順に export-slides.mjs へ流し、
 * GitHub Releases のアセット名（<name>.spkg）へリネームする。
 * アセット名にバージョンを含めないのは、アプリが releases/latest/download/<name>.spkg を
 * フォールバック先として参照するため（latest のバージョンは知り得ない）。
 */

import { readFileSync, existsSync, renameSync } from 'fs'
import { resolve, dirname } from 'path'
import { execFileSync } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const projectRoot = resolve(__dirname, '..')

/** manifest の妥当性を検証して packages を返す（純粋関数。テストから呼ぶ） */
export function validateManifest(manifest) {
  if (!manifest || typeof manifest.source !== 'string' || !manifest.source) throw new Error('manifest.source が指定されていません')
  if (!Array.isArray(manifest.packages) || manifest.packages.length === 0) throw new Error('manifest.packages が空です')
  const locales = new Set()
  for (const pkg of manifest.packages) {
    for (const key of ['locale', 'slides', 'name']) {
      if (typeof pkg[key] !== 'string' || !pkg[key]) throw new Error(`manifest.packages[].${key} が不正です: ${JSON.stringify(pkg)}`)
    }
    if (locales.has(pkg.locale)) throw new Error(`manifest.packages に locale の重複があります: ${pkg.locale}`)
    locales.add(pkg.locale)
  }
  if (typeof manifest.fallbackLocale !== 'string' || !locales.has(manifest.fallbackLocale)) {
    throw new Error(`manifest.fallbackLocale が packages に存在しません: ${manifest.fallbackLocale}`)
  }
  return manifest.packages
}

/** Releases に添付するアセット名（バージョンを含めない） */
export function getAssetName(packageName) {
  return `${packageName}.spkg`
}

function main() {
  const args = process.argv.slice(2)
  const versionIndex = args.indexOf('--version')
  const version = versionIndex >= 0 && args[versionIndex + 1] ? args[versionIndex + 1] : JSON.parse(readFileSync(resolve(projectRoot, 'package.json'), 'utf-8')).version

  const manifestPath = resolve(projectRoot, 'samples', 'manifest.json')
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
  const packages = validateManifest(manifest)

  console.log(`Exporting ${packages.length} sample package(s) at version ${version}`)

  for (const pkg of packages) {
    const slidesPath = resolve(projectRoot, manifest.source, pkg.slides)
    if (!existsSync(slidesPath)) {
      console.error(`Error: ${slidesPath} が見つかりません（samples/manifest.json の packages と実ファイルが一致していません）`)
      process.exit(1)
    }

    // --strict: 参照アセットが欠けたまま配布物を作らない
    execFileSync(process.execPath, [resolve(__dirname, 'export-slides.mjs'), '--name', pkg.name, '--slides', pkg.slides, '--source', manifest.source, '--version', version, '--strict'], {
      stdio: 'inherit',
    })

    const built = resolve(projectRoot, 'dist-slides', `${pkg.name}-${version}.spkg`)
    const asset = resolve(projectRoot, 'dist-slides', getAssetName(pkg.name))
    renameSync(built, asset)
    console.log(`Asset: dist-slides/${getAssetName(pkg.name)}`)
  }

  console.log('\nSample export complete!')
}

// 直接実行時のみ main() を走らせる（テストからの import では実行しない）
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
}
