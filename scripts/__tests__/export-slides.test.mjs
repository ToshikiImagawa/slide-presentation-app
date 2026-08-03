import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { parseArgs, rewriteAddonManifestBundles, buildFilesField, extractAssetPaths, extractAssetPathsDeep, selectAddons } from '../export-slides.mjs'

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

  it('--source 未指定時は public を既定とする', () => {
    expect(parseArgs(['--name', 'demo', '--slides', 'slides.json']).source).toBe('public')
  })

  it('--source で slides とアセットの基準ディレクトリを指定できる', () => {
    const r = parseArgs(['--name', 'demo', '--slides', 'slides.ja.json', '--source', 'samples/template-guide'])
    expect(r.source).toBe('samples/template-guide')
    expect(r.slides).toBe('slides.ja.json')
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

describe('extractAssetPathsDeep（#170: meta.brandTheme 参照先を1段だけ辿る）', () => {
  let dir

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'export-slides-test-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  it('theme/ 配下の参照 JSON を1段だけ辿り、中のアセット参照も合成する', () => {
    mkdirSync(join(dir, 'theme'))
    writeFileSync(join(dir, 'theme', 'brand.json'), JSON.stringify({ fonts: { sources: [{ family: 'Corp', src: 'font/corp.woff2' }] } }))

    const paths = extractAssetPathsDeep({ meta: { brandTheme: 'theme/brand.json' } }, dir)

    expect(paths.sort()).toEqual(['font/corp.woff2', 'theme/brand.json'])
  })

  it('参照先が存在しない場合は2段目の探索をスキップする（欠落検出は呼び出し側の missingAssets に委ねる）', () => {
    const paths = extractAssetPathsDeep({ meta: { brandTheme: 'theme/missing.json' } }, dir)
    expect(paths).toEqual(['theme/missing.json'])
  })

  it('参照先 JSON が不正な場合、非 strict では警告して1パスの結果を返す', () => {
    mkdirSync(join(dir, 'theme'))
    writeFileSync(join(dir, 'theme', 'brand.json'), 'not json')
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    const paths = extractAssetPathsDeep({ meta: { brandTheme: 'theme/brand.json' } }, dir, { strict: false })

    expect(paths).toEqual(['theme/brand.json'])
    expect(warnSpy).toHaveBeenCalledOnce()
    warnSpy.mockRestore()
  })

  it('参照先 JSON が不正な場合、strict では失敗させる', () => {
    mkdirSync(join(dir, 'theme'))
    writeFileSync(join(dir, 'theme', 'brand.json'), 'not json')
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('exit')
    })
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(() => extractAssetPathsDeep({ meta: { brandTheme: 'theme/brand.json' } }, dir, { strict: true })).toThrow('exit')
    expect(exitSpy).toHaveBeenCalledWith(1)

    exitSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it('brandTheme 未参照の通常デッキは1パス目のみで完了する', () => {
    const paths = extractAssetPathsDeep({ meta: { logo: { src: 'image/logo.png' } } }, dir)
    expect(paths).toEqual(['image/logo.png'])
  })
})
