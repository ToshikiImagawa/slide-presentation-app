#!/usr/bin/env node
/**
 * 実アプリ撮影と mock 撮影のデザイン差を比較するハーネス。
 *
 * 使い方:
 *   node scripts/screenshot/compare.mjs <実アプリ画像> <mock画像> [出力ベース名]
 *
 * 出力（scripts/screenshot/__compare__/ 配下）:
 *   - <base>-side-by-side.png : 左右に並べた比較画像（サイズが違っても高さを揃えて並置）
 *   - <base>-diff.png         : 解像度が一致する場合のみ pixelmatch 差分画像
 *   - 一致率（%）を標準出力に表示
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { basename, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import pixelmatch from 'pixelmatch'
import { PNG } from 'pngjs'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUT_DIR = resolve(ROOT, 'scripts/screenshot/__compare__')

const [, , realPath, mockPath, baseArg] = process.argv

if (!realPath || !mockPath) {
  console.error('使い方: node scripts/screenshot/compare.mjs <実アプリ画像> <mock画像> [出力ベース名]')
  process.exit(1)
}
for (const p of [realPath, mockPath]) {
  if (!existsSync(p)) {
    console.error(`画像が見つかりません: ${p}`)
    process.exit(1)
  }
}

mkdirSync(OUT_DIR, { recursive: true })
const base = baseArg ?? basename(mockPath).replace(/\.png$/, '')

const real = PNG.sync.read(readFileSync(realPath))
const mock = PNG.sync.read(readFileSync(mockPath))

// --- side-by-side（高さを揃えて左右に並べる）---
const gap = 24
const targetH = Math.max(real.height, mock.height)
// 等倍のまま上揃えで並置（スケールしない: ピクセル比較の素材として原寸を保つ）
const sbsW = real.width + gap + mock.width
const sbsH = targetH
const sbs = new PNG({ width: sbsW, height: sbsH })
// 背景白
for (let i = 0; i < sbs.data.length; i += 4) {
  sbs.data[i] = 255
  sbs.data[i + 1] = 255
  sbs.data[i + 2] = 255
  sbs.data[i + 3] = 255
}
const blit = (src, dstX) => {
  for (let y = 0; y < src.height; y++) {
    for (let x = 0; x < src.width; x++) {
      const s = (src.width * y + x) << 2
      const d = (sbs.width * y + (x + dstX)) << 2
      sbs.data[d] = src.data[s]
      sbs.data[d + 1] = src.data[s + 1]
      sbs.data[d + 2] = src.data[s + 2]
      sbs.data[d + 3] = src.data[s + 3]
    }
  }
}
blit(real, 0)
blit(mock, real.width + gap)
writeFileSync(resolve(OUT_DIR, `${base}-side-by-side.png`), PNG.sync.write(sbs))
console.log(
  `✅ 並置画像: __compare__/${base}-side-by-side.png  (左=実アプリ ${real.width}x${real.height} / 右=mock ${mock.width}x${mock.height})`,
)

// --- pixel diff（解像度一致時のみ）---
if (real.width === mock.width && real.height === mock.height) {
  const diff = new PNG({ width: real.width, height: real.height })
  const mismatch = pixelmatch(real.data, mock.data, diff.data, real.width, real.height, {
    threshold: 0.1,
    includeAA: false,
  })
  writeFileSync(resolve(OUT_DIR, `${base}-diff.png`), PNG.sync.write(diff))
  const total = real.width * real.height
  const matchRate = (100 * (1 - mismatch / total)).toFixed(2)
  console.log(`✅ 差分画像: __compare__/${base}-diff.png`)
  console.log(`📊 一致率: ${matchRate}%  (不一致 ${mismatch} / ${total} px)`)
} else {
  console.log('ℹ 解像度が異なるため pixel diff はスキップ（並置画像で目視比較してください）。')
  console.log('   厳密比較するには、実アプリ側をコンテンツ領域のみ・同解像度で撮影してください。')
}
