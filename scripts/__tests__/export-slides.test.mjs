import { describe, it, expect } from 'vitest'
import { parseArgs, rewriteAddonManifestBundles, buildFilesField, extractAssetPaths, selectAddons } from '../export-slides.mjs'

describe('parseArgs', () => {
  it('--addons フラグを解釈する', () => {
    const r = parseArgs(['--name', 'demo', '--slides', 'slides.json', '--addons'])
    expect(r.addons).toBe(true)
    expect(r.name).toBe('demo')
    expect(r.slides).toBe('slides.json')
  })

  it('--addons 未指定時は false', () => {
    const r = parseArgs(['--name', 'demo', '--slides', 'slides.json'])
    expect(r.addons).toBe(false)
  })

  it('--addons a,b で個別選択（name 配列）を解釈する（層B）', () => {
    const r = parseArgs(['--name', 'demo', '--slides', 'slides.json', '--addons', 'viz, other'])
    expect(r.addons).toEqual(['viz', 'other'])
  })

  it('--addons の次がフラグなら全同梱（true）のまま', () => {
    const r = parseArgs(['--addons', '--name', 'demo'])
    expect(r.addons).toBe(true)
    expect(r.name).toBe('demo')
  })

  it('--addons の値が空（カンマのみ/空文字/空白）なら同梱なし（false）に統一する', () => {
    expect(parseArgs(['--addons', ',']).addons).toBe(false)
    expect(parseArgs(['--addons', '']).addons).toBe(false)
    expect(parseArgs(['--addons', '  ']).addons).toBe(false)
  })
})

describe('selectAddons（層B）', () => {
  const addons = [
    { name: 'viz', bundle: 'addons/viz.js' },
    { name: 'other', bundle: 'addons/other.js' },
  ]

  it('selected が配列なら name で絞り込む', () => {
    expect(selectAddons(addons, ['viz'])).toEqual([{ name: 'viz', bundle: 'addons/viz.js' }])
  })

  it('selected が true/未指定なら全件を返す', () => {
    expect(selectAddons(addons, true)).toEqual(addons)
    expect(selectAddons(addons, undefined)).toEqual(addons)
  })
})

describe('rewriteAddonManifestBundles', () => {
  it('bundle をパッケージ相対（addons/xxx）へ書き換える', () => {
    const manifest = { addons: [{ name: 'ai-sdd-visuals', bundle: '/addons/addons.iife.js' }] }
    const result = rewriteAddonManifestBundles(manifest)
    expect(result.addons[0].bundle).toBe('addons/addons.iife.js')
    expect(result.addons[0].name).toBe('ai-sdd-visuals')
  })

  it('既に相対パスの場合も addons/ 配下に正規化する', () => {
    const manifest = { addons: [{ bundle: 'addons/addons.iife.js' }] }
    expect(rewriteAddonManifestBundles(manifest).addons[0].bundle).toBe('addons/addons.iife.js')
  })

  it('addons が無い manifest でも壊れない', () => {
    expect(rewriteAddonManifestBundles({}).addons).toEqual([])
  })
})

describe('buildFilesField', () => {
  it('アドオン非同梱時は addons を含めない', () => {
    expect(buildFilesField(['image/a.png'], false)).toEqual(['slides.json', 'image'])
  })

  it('アドオン同梱時は addons を含める', () => {
    expect(buildFilesField(['image/a.png', 'voice/b.mp3'], true)).toEqual(['slides.json', 'image', 'voice', 'addons'])
  })

  it('アセットが無くても slides.json は含む', () => {
    expect(buildFilesField([], false)).toEqual(['slides.json'])
  })
})

describe('extractAssetPaths', () => {
  it('image/voice/theme/font 参照を抽出し先頭スラッシュを正規化する', () => {
    const data = { a: '/image/x.png', b: 'voice/y.mp3', c: 'ignore.txt', d: ['theme/z.css'] }
    expect(extractAssetPaths(data).sort()).toEqual(['image/x.png', 'theme/z.css', 'voice/y.mp3'])
  })
})
