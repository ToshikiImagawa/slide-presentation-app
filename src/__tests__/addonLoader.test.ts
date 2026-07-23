import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { loadAddonScripts, loadBuiltinAddons } from '../addonLoader'
import { clearRegistry, resolveComponent, unregisterOwner } from '../components/ComponentRegistry'

/** data-addon-src が match を含む head 内の script 要素を返す */
function scriptTags(match: string): HTMLScriptElement[] {
  return [...document.head.querySelectorAll('script')].filter((s) => (s as HTMLScriptElement).dataset.addonSrc?.includes(match)) as HTMLScriptElement[]
}

/** jsdom は script の実行・onload を発火しないため、手動で load イベントを発火する */
function fireLoad(match: string): void {
  scriptTags(match).forEach((el) => el.dispatchEvent(new Event('load')))
}

describe('addonLoader', () => {
  beforeEach(() => {
    clearRegistry()
    document.head.querySelectorAll('script').forEach((s) => s.remove())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('空の scripts では script を注入しない', async () => {
    await loadAddonScripts([], 'owner-empty')
    expect(document.head.querySelectorAll('script').length).toBe(0)
  })

  it('同一 src を再ロードしても script タグは1つに保たれる（冪等・重複蓄積なし）', async () => {
    const src = 'http://asset.localhost/pkgA/addons/a.js'

    const p1 = loadAddonScripts([src], 'ownerA')
    fireLoad('pkgA/addons/a.js')
    await p1
    expect(scriptTags('pkgA/addons/a.js').length).toBe(1)

    const p2 = loadAddonScripts([src], 'ownerA')
    fireLoad('pkgA/addons/a.js')
    await p2
    expect(scriptTags('pkgA/addons/a.js').length).toBe(1)
  })

  it('ロード中に登録されたコンポーネントが owner に紐づき、unregisterOwner で破棄される', async () => {
    const Comp = () => null
    const src = 'http://asset.localhost/pkgB/addons/b.js'

    const p = loadAddonScripts([src], 'ownerB')
    // バンドル実行で呼ばれる __ADDON_REGISTER__ を模擬（この時点で currentOwner=ownerB）
    window.__ADDON_REGISTER__!('b', [{ name: 'FromPackage', component: Comp }])
    fireLoad('pkgB/addons/b.js')
    await p

    expect(resolveComponent('FromPackage')).toBe(Comp)

    unregisterOwner('ownerB')
    expect(resolveComponent('FromPackage')).not.toBe(Comp)
  })

  it('script の onerror でロードが reject される', async () => {
    const src = 'http://asset.localhost/pkgErr/addons/err.js'
    const p = loadAddonScripts([src], 'ownerErr')
    scriptTags('pkgErr/addons/err.js').forEach((el) => el.dispatchEvent(new Event('error')))
    await expect(p).rejects.toThrow(/Failed to load addon/)
  })

  describe('loadBuiltinAddons', () => {
    it('manifest の全 bundle をロードする', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ addons: [{ name: 'builtin', bundle: '/addons/builtin.js' }] }),
      })
      vi.stubGlobal('fetch', fetchMock)

      const p = loadBuiltinAddons()
      await vi.waitFor(() => expect(scriptTags('/addons/builtin.js').length).toBe(1))
      fireLoad('/addons/builtin.js')
      await p

      expect(fetchMock).toHaveBeenCalledWith('/addons/manifest.json')
    })

    it('manifest が 404 のときは何もロードしない', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }))
      await loadBuiltinAddons()
      expect(document.head.querySelectorAll('script').length).toBe(0)
    })

    it('fetch 失敗時も例外を投げない（フォールバック）', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
      await expect(loadBuiltinAddons()).resolves.toBeUndefined()
      expect(document.head.querySelectorAll('script').length).toBe(0)
    })
  })
})
