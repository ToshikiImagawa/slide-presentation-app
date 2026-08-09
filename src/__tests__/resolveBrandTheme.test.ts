import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Tauri プラグイン依存をモックする（#170: meta.brandTheme の解決）
const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  readTextFile: vi.fn(),
  dirname: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    get = async () => undefined
    set = async () => {}
    save = async () => {}
  },
}))
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn(), message: vi.fn(), open: vi.fn() }))
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile: h.readTextFile }))
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (p: string) => `asset://localhost/${p}`, invoke: h.invoke }))
vi.mock('@tauri-apps/api/path', () => ({ dirname: h.dirname }))

import { resolveBrandTheme } from '../localSlideLoader'

describe('resolveBrandTheme', () => {
  beforeEach(() => {
    h.invoke.mockReset()
    h.readTextFile.mockReset()
    h.dirname.mockReset()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('brandPath が未指定なら undefined を返す', async () => {
    await expect(resolveBrandTheme(undefined, '/pkg')).resolves.toBeUndefined()
    expect(h.readTextFile).not.toHaveBeenCalled()
  })

  it('baseDir 基準でローカルファイルを読み込み、中のアセット参照を asset URL に解決する', async () => {
    h.readTextFile.mockResolvedValue(JSON.stringify({ colors: { primary: '#112233' }, fonts: { sources: [{ family: 'Corp', src: 'font/corp.woff2' }] } }))

    const result = await resolveBrandTheme('theme/brand.json', '/pkg')

    expect(h.readTextFile).toHaveBeenCalledWith('/pkg/theme/brand.json')
    expect(result?.colors?.primary).toBe('#112233')
    expect(result?.fonts?.sources?.[0].src).toBe('asset://localhost//pkg/font/corp.woff2')
  })

  it('先頭スラッシュ付きの参照パスも baseDir 基準で解決する', async () => {
    h.readTextFile.mockResolvedValue(JSON.stringify({ colors: { primary: '#000000' } }))

    await resolveBrandTheme('/theme/brand.json', '/pkg')

    expect(h.readTextFile).toHaveBeenCalledWith('/pkg/theme/brand.json')
  })

  it('https URL の場合は fetch で取得する（ローカルファイル読み込みは行わない）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ colors: { primary: '#445566' } }) }))

    const result = await resolveBrandTheme('https://cdn.example.com/brand.json', '/pkg')

    expect(result?.colors?.primary).toBe('#445566')
    expect(h.readTextFile).not.toHaveBeenCalled()
  })

  it('https URL の場合、参照先ロゴ・フォントのアセット参照は取得元URL基準の絶対URLへ解決される（applyTheme.ts の fetchThemeData に委譲・#210）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ icons: { logo: 'image/logo.png' }, fonts: { sources: [{ family: 'Corp', src: 'font/corp.woff2' }] } }) }))
    vi.stubGlobal('caches', undefined)

    const result = await resolveBrandTheme('https://cdn.example.com/theme/brand.json', '/pkg')

    expect(result?.icons?.logo).toBe('https://cdn.example.com/theme/image/logo.png')
    expect(result?.fonts?.sources?.[0].src).toBe('https://cdn.example.com/theme/font/corp.woff2')
  })

  it('fetch が失敗した場合は undefined を返す（テーマ下地なしで続行）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))

    await expect(resolveBrandTheme('https://cdn.example.com/missing.json', '/pkg')).resolves.toBeUndefined()
  })

  it('ローカルファイルの読み込みに失敗した場合は undefined を返す（テーマ下地なしで続行）', async () => {
    h.readTextFile.mockRejectedValue(new Error('not found'))

    await expect(resolveBrandTheme('theme/missing.json', '/pkg')).resolves.toBeUndefined()
  })

  it('JSON パースに失敗した場合は undefined を返す', async () => {
    h.readTextFile.mockResolvedValue('not json')

    await expect(resolveBrandTheme('theme/brand.json', '/pkg')).resolves.toBeUndefined()
  })
})
