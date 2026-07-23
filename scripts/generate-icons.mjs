#!/usr/bin/env node

/**
 * resources/icon.svg から src-tauri/icons/ 配下の全アイコンを生成するスクリプト。
 *
 * 依存: macOS の sips（SVG→PNG 変換）、npx tauri icon（アイコン一括生成）
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

if (process.platform !== 'darwin') {
  console.log('Skipping icon generation (macOS only). Use pre-built icons in src-tauri/icons/.')
  process.exit(0)
}

const ROOT = new URL('..', import.meta.url).pathname
const SVG = join(ROOT, 'resources', 'icon.svg')
const TMP = join(tmpdir(), 'slide-presentation-icons')

// --- main ---

rmSync(TMP, { recursive: true, force: true })
mkdirSync(TMP, { recursive: true })

const png1024 = join(TMP, 'icon_1024.png')

// 1. SVG -> 1024x1024 PNG
console.log('SVG -> PNG (1024x1024)')
execFileSync('/usr/bin/sips', ['-s', 'format', 'png', '-z', '1024', '1024', SVG, '--out', png1024], {
  stdio: 'pipe',
})

// 2. tauri icon で src-tauri/icons/ に全アイコンを一括生成
console.log('-> src-tauri/icons/')
execFileSync('npx', ['tauri', 'icon', png1024], {
  cwd: ROOT,
  stdio: 'inherit',
})

// デスクトップ専用アプリのため、tauri icon が生成する android/ios 用アイコンは削除する
// （tauri.conf.json の bundle.icon からも参照されない）
for (const dir of ['android', 'ios']) {
  rmSync(join(ROOT, 'src-tauri', 'icons', dir), { recursive: true, force: true })
}

// cleanup
rmSync(TMP, { recursive: true, force: true })

console.log('Done.')
