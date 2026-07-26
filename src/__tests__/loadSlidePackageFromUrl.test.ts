import { describe, it, expect, vi, beforeEach } from 'vitest'

// Tauri プラグイン依存をモックする（issue #40: URL からのスライドパッケージ読み込み）
const h = vi.hoisted(() => ({
  invoke: vi.fn(),
  readTextFile: vi.fn(),
  message: vi.fn(),
  dirname: vi.fn(),
}))

vi.mock('@tauri-apps/plugin-store', () => ({
  LazyStore: class {
    get = async () => undefined
    set = async () => {}
    save = async () => {}
  },
}))
vi.mock('@tauri-apps/plugin-dialog', () => ({ ask: vi.fn(), message: h.message, open: vi.fn() }))
vi.mock('@tauri-apps/plugin-fs', () => ({ readTextFile: h.readTextFile }))
vi.mock('@tauri-apps/api/core', () => ({ convertFileSrc: (p: string) => `asset://localhost/${p}`, invoke: h.invoke }))
vi.mock('@tauri-apps/api/path', () => ({ dirname: h.dirname }))

import { loadSlidePackageFromUrl } from '../localSlideLoader'

const VALID_JSON = JSON.stringify({ meta: { title: 'Remote Deck' }, slides: [{ id: 's1', layout: 'center', content: { title: 'Hello' } }] })

describe('loadSlidePackageFromUrl', () => {
  beforeEach(() => {
    h.invoke.mockReset()
    h.readTextFile.mockReset()
    h.message.mockReset()
    h.dirname.mockReset()
  })

  it('download_slide_package を呼び、展開先の slides.json を読み込んで最近使ったリストに記録する', async () => {
    h.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'download_slide_package') return '/cache/slide-packages/url-abc'
      if (cmd === 'allow_asset_dir') return undefined
      throw new Error(`unexpected invoke: ${cmd}`)
    })
    h.readTextFile.mockResolvedValue(VALID_JSON)

    const url = 'https://example.com/deck.spkg'
    const result = await loadSlidePackageFromUrl(url)

    expect(h.invoke).toHaveBeenCalledWith('download_slide_package', { url })
    expect(h.dirname).not.toHaveBeenCalled()
    expect(result.data?.data.meta.title).toBe('Remote Deck')
    expect(result.data?.sourcePath).toBe(url)
    expect(result.recentPackages?.[0]).toMatchObject({ path: url, title: 'Remote Deck' })
    expect(h.message).not.toHaveBeenCalled()
  })

  it('ダウンロードに失敗した場合はエラーダイアログを表示し data は null を返す', async () => {
    h.invoke.mockRejectedValue(new Error('ダウンロードに失敗しました（HTTP 404）'))

    const result = await loadSlidePackageFromUrl('https://example.com/missing.spkg')

    expect(result.data).toBeNull()
    expect(h.message).toHaveBeenCalledOnce()
  })
})
