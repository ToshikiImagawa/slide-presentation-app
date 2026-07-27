import { describe, it, expect, vi, beforeEach } from 'vitest'

// Tauri プラグイン依存をモックする（#105: OS のファイル関連付けから渡されたパスを開く）
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

import { openSlidePackageFromPath } from '../localSlideLoader'

const VALID_JSON = JSON.stringify({ meta: { title: 'Associated Deck' }, slides: [{ id: 's1', layout: 'center', content: { title: 'Hello' } }] })

describe('openSlidePackageFromPath', () => {
  beforeEach(() => {
    h.invoke.mockReset()
    h.readTextFile.mockReset()
    h.message.mockReset()
    h.dirname.mockReset()
  })

  it('.spkg の絶対パスを extract_slide_package に流し、展開先の slides.json を読み込んで最近使ったリストに記録する', async () => {
    h.invoke.mockImplementation(async (cmd: string) => {
      if (cmd === 'extract_slide_package') return '/cache/slide-packages/deck'
      if (cmd === 'allow_asset_dir') return undefined
      throw new Error(`unexpected invoke: ${cmd}`)
    })
    h.readTextFile.mockResolvedValue(VALID_JSON)

    const path = '/Users/me/Documents/deck.spkg'
    const result = await openSlidePackageFromPath(path)

    expect(h.invoke).toHaveBeenCalledWith('extract_slide_package', { packagePath: path })
    expect(result.data?.data.meta.title).toBe('Associated Deck')
    expect(result.data?.sourcePath).toBe(path)
    expect(result.recentPackages?.[0]).toMatchObject({ path, title: 'Associated Deck' })
    expect(h.message).not.toHaveBeenCalled()
  })

  it('slides.json の絶対パスもそのまま開ける（拡張子で分岐するため追加のパス処理は不要）', async () => {
    h.invoke.mockResolvedValue(undefined)
    h.dirname.mockResolvedValue('/Users/me/Documents')
    h.readTextFile.mockResolvedValue(VALID_JSON)

    const path = '/Users/me/Documents/slides.json'
    const result = await openSlidePackageFromPath(path)

    expect(h.invoke).not.toHaveBeenCalledWith('extract_slide_package', expect.anything())
    expect(h.readTextFile).toHaveBeenCalledWith(path)
    expect(result.data?.data.meta.title).toBe('Associated Deck')
  })

  it('展開に失敗した場合はエラーダイアログを表示し data は null を返す', async () => {
    h.invoke.mockRejectedValue(new Error('パッケージの展開に失敗しました'))

    const result = await openSlidePackageFromPath('/Users/me/Documents/broken.spkg')

    expect(result.data).toBeNull()
    expect(h.message).toHaveBeenCalledOnce()
  })
})
