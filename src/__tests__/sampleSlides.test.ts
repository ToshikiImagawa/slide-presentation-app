import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ getVersion: vi.fn() }))
vi.mock('@tauri-apps/api/app', () => ({ getVersion: h.getVersion }))

import { getSampleSources, loadBundledSampleSlides, resolveSamplePackageName } from '../sampleSlides'

const VALID_DATA = { meta: { title: 'Bundled Deck' }, slides: [{ id: 's1', layout: 'center', content: { title: 'Hello' } }] }

/** fetch のレスポンスを最小限で模す（content-type の検証があるため headers を持つ） */
function jsonResponse(body: unknown, { ok = true, contentType = 'application/json' } = {}) {
  return {
    ok,
    headers: { get: (name: string) => (name.toLowerCase() === 'content-type' ? contentType : null) },
    json: async () => body,
  }
}

describe('resolveSamplePackageName', () => {
  it('言語コードで manifest のパッケージを解決する', () => {
    expect(resolveSamplePackageName('ja-JP')).toBe('template-guide-ja')
    expect(resolveSamplePackageName('en-US')).toBe('template-guide-en')
    expect(resolveSamplePackageName('fr-FR')).toBe('template-guide-fr')
  })

  it('サンプルが無いロケールは fallbackLocale のパッケージを使う', () => {
    expect(resolveSamplePackageName('de-DE')).toBe('template-guide-en')
  })
})

describe('getSampleSources', () => {
  beforeEach(() => {
    h.getVersion.mockReset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('バージョン固定 URL を先に、latest を保険として返す', async () => {
    h.getVersion.mockResolvedValue('1.2.3')

    const sources = await getSampleSources('ja-JP')

    expect(sources).toHaveLength(2)
    expect(sources[0].url).toBe('https://github.com/ToshikiImagawa/slide-presentation-app/releases/download/v1.2.3/template-guide-ja.spkg')
    expect(sources[1].url).toBe('https://github.com/ToshikiImagawa/slide-presentation-app/releases/latest/download/template-guide-ja.spkg')
  })

  it('バージョン固定 URL は内容が不変なのでキャッシュを再利用し、latest は再利用しない', async () => {
    h.getVersion.mockResolvedValue('1.2.3')

    const [pinned, latest] = await getSampleSources('en-US')

    expect(pinned.download).toMatchObject({ reuseCache: true, cacheKey: 'sample-template-guide-en-1.2.3' })
    expect(latest.download.reuseCache).toBeUndefined()
  })

  it('すべての候補にタイムアウトを指定する（既定 300 秒でホーム画面を長時間ロックさせない）', async () => {
    h.getVersion.mockResolvedValue('1.2.3')

    for (const source of await getSampleSources('ja-JP')) {
      expect(source.download.timeoutSecs).toBe(30)
    }
  })

  it('バージョンを取得できない環境（素のブラウザ）では latest のみを返す', async () => {
    h.getVersion.mockRejectedValue(new Error('no tauri ipc'))

    const sources = await getSampleSources('ja-JP')

    expect(sources).toHaveLength(1)
    expect(sources[0].url).toContain('/releases/latest/download/')
  })

  it('VITE_SAMPLE_PACKAGE_URL を指定した場合はその URL だけを使う', async () => {
    vi.stubEnv('VITE_SAMPLE_PACKAGE_URL', 'https://example.com/custom.spkg')
    h.getVersion.mockResolvedValue('1.2.3')

    const sources = await getSampleSources('ja-JP')

    expect(sources).toEqual([{ url: 'https://example.com/custom.spkg', download: { timeoutSecs: 30 } }])
  })
})

describe('loadBundledSampleSlides', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
  })

  it('同梱 slides.json が妥当なら採用する', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(VALID_DATA)))

    expect((await loadBundledSampleSlides())?.meta.title).toBe('Bundled Deck')
  })

  it('dev サーバーの SPA フォールバック（200 + HTML）を同梱扱いしない', async () => {
    // Vite は存在しないパスにも accept: */* で index.html を 200 で返すため、content-type で弾く必要がある
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse('<!doctype html>', { contentType: 'text/html' })))

    expect(await loadBundledSampleSlides()).toBeNull()
  })

  it('404 の場合は null を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(null, { ok: false })))

    expect(await loadBundledSampleSlides()).toBeNull()
  })

  it('JSON でもスキーマが不正なら採用しない（リモート取得へ進ませる）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ meta: {}, slides: [] })))
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

    expect(await loadBundledSampleSlides()).toBeNull()
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('fetch が例外を投げた場合も null を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')))

    expect(await loadBundledSampleSlides()).toBeNull()
  })

  it('VITE_SAMPLE_SOURCE=remote のときは同梱を無視してリモート取得へ進む', async () => {
    vi.stubEnv('VITE_SAMPLE_SOURCE', 'remote')
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse(VALID_DATA))
    vi.stubGlobal('fetch', fetchMock)

    expect(await loadBundledSampleSlides()).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
