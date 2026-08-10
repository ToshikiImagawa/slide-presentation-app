import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { applyTheme, applyPresentationTheme, applyThemeData, applyBaseFontSize, loadFontSources, resetThemeOverrides, normalizeHex, getThemeWarnings, getContrastRatio, mergeThemeData, fetchThemeData } from '../applyTheme'
import { hasComponent } from '../components/ComponentRegistry'
import type { ThemeData } from '../data'

describe('applyTheme', () => {
  beforeEach(() => {
    document.documentElement.style.cssText = ''
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('取得に成功したテーマカラーを CSS 変数に適用し true を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ primary: '#112233' }) }))

    await expect(applyTheme()).resolves.toBe(true)
    expect(document.documentElement.style.getPropertyValue('--theme-primary')).toBe('#112233')
  })

  it('パス省略時にデフォルトファイルが404でも失敗とせず true を返す（カスタムテーマ未使用の正常系）', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))

    await expect(applyTheme()).resolves.toBe(true)
  })

  it('パス省略時に fetch が例外を投げても失敗とせず true を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))

    await expect(applyTheme()).resolves.toBe(true)
  })

  it('明示的なパス指定時に404の場合は false を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))

    await expect(applyTheme('/pkg/theme-colors.json')).resolves.toBe(false)
  })

  it('明示的なパス指定時に fetch が例外を投げた場合は false を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))

    await expect(applyTheme('/pkg/theme-colors.json')).resolves.toBe(false)
  })

  it('パス省略時に取得は成功したがJSONパースに失敗した場合も失敗とせず true を返す（SPAフォールバック等でHTMLが返るケース）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('invalid json')
        },
      }),
    )

    await expect(applyTheme()).resolves.toBe(true)
  })

  it('明示的なパス指定時に取得は成功したがJSONパースに失敗した場合は false を返す', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('invalid json')
        },
      }),
    )

    await expect(applyTheme('/pkg/theme-colors.json')).resolves.toBe(false)
  })
})

describe('applyPresentationTheme', () => {
  beforeEach(() => {
    document.documentElement.style.cssText = ''
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('themeColors の適用に失敗した場合、theme は適用しつつ false を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))

    const result = await applyPresentationTheme('/pkg/theme-colors.json', { colors: { primary: '#445566' } })

    expect(result).toBe(false)
    expect(document.documentElement.style.getPropertyValue('--theme-primary')).toBe('#445566')
  })

  it('themeColors の適用に成功した場合は true を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ primary: '#112233' }) }))

    await expect(applyPresentationTheme('/pkg/theme-colors.json')).resolves.toBe(true)
  })

  it('4段カスケード（brand → themeColors → theme）で同名キーは後段が優先される', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ primary: '#111111', background: '#aaaaaa' }) }))

    await applyPresentationTheme('/pkg/theme-colors.json', { colors: { primary: '#333333' } }, { colors: { primary: '#000000', background: '#bbbbbb' } })

    // primary: brand(#000000) → themeColors(#111111) → theme(#333333) の順で上書きされ、最終的に theme の値が残る
    expect(document.documentElement.style.getPropertyValue('--theme-primary')).toBe('#333333')
    // background: brand(#bbbbbb) → themeColors(#aaaaaa) の順で上書きされ、theme に指定がないため themeColors の値が残る
    expect(document.documentElement.style.getPropertyValue('--theme-background')).toBe('#aaaaaa')
  })

  it('brand のみ指定時は brand の masters/masterMap/tokens が CSS として反映される', async () => {
    const brand: ThemeData = { masters: { corp: { decorations: [] } }, masterMap: { center: 'corp' }, tokens: { corp: { 'band-color': '#ff0000' } } }

    await applyPresentationTheme(undefined, undefined, brand)

    expect(document.getElementById('sdd-master-tokens-css')?.textContent).toContain('--band-color: #ff0000;')
  })

  it('意匠トークンは tokens の "*"（全体スコープ）から :root へ適用され、brand → theme の順で後勝ちする（#190）', async () => {
    const brand: ThemeData = { tokens: { '*': { 'theme-radius-lg': '4px', 'theme-border-width': '2px' } } }
    const theme: ThemeData = { tokens: { '*': { 'theme-border-width': '3px' } } }

    await applyPresentationTheme(undefined, theme, brand)

    const css = document.getElementById('sdd-master-tokens-css')?.textContent
    expect(css).toContain(':root {')
    expect(css).toContain('--theme-radius-lg: 4px;')
    expect(css).toContain('--theme-border-width: 3px;')
    expect(css).not.toContain('2px')
  })
})

describe('fetchThemeData', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('取得・パースに成功した場合は ThemeData を返す', async () => {
    const theme: ThemeData = { colors: { primary: '#112233' }, fonts: { heading: 'Foo' } }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => theme }))

    await expect(fetchThemeData('/theme/brand.json')).resolves.toEqual(theme)
  })

  it('404 の場合は undefined を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))

    await expect(fetchThemeData('/theme/brand.json')).resolves.toBeUndefined()
  })

  it('fetch が例外を投げた場合は undefined を返す', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))

    await expect(fetchThemeData('/theme/brand.json')).resolves.toBeUndefined()
  })

  it('JSON パースに失敗した場合は undefined を返す', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw new SyntaxError('invalid json')
        },
      }),
    )

    await expect(fetchThemeData('/theme/brand.json')).resolves.toBeUndefined()
  })

  describe('リモート配布（https URL・#210）', () => {
    it('取得したテーマ内のアセット参照を取得元URL基準の絶対URLへ書き換える', async () => {
      const theme: ThemeData = { icons: { logo: 'image/logo.png' }, fonts: { sources: [{ family: 'Corp', src: 'font/corp.woff2' }] } }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => theme }))
      vi.stubGlobal('caches', undefined)

      const result = await fetchThemeData('https://example.com/themes/acme/theme.json')

      expect(result?.icons?.logo).toBe('https://example.com/themes/acme/image/logo.png')
      expect(result?.fonts?.sources?.[0].src).toBe('https://example.com/themes/acme/font/corp.woff2')
    })

    it('取得に成功したテーマを Cache Storage へ保存する', async () => {
      const theme: ThemeData = { colors: { primary: '#112233' } }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => theme }))
      const put = vi.fn().mockResolvedValue(undefined)
      vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue({ put, match: vi.fn() }) })

      await fetchThemeData('https://example.com/themes/acme/theme.json')

      expect(put).toHaveBeenCalledWith('https://example.com/themes/acme/theme.json', expect.anything())
    })

    it('オフライン時（fetch が例外）は直近キャッシュのテーマを返す（オフライン再適用）', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
      const cachedTheme: ThemeData = { colors: { primary: '#445566' } }
      const match = vi.fn().mockResolvedValue({ json: async () => cachedTheme })
      vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue({ put: vi.fn(), match }) })

      await expect(fetchThemeData('https://example.com/themes/acme/theme.json')).resolves.toEqual(cachedTheme)
      expect(match).toHaveBeenCalledWith('https://example.com/themes/acme/theme.json')
    })

    it('404 の場合も直近キャッシュのテーマを返す', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 404 }))
      const cachedTheme: ThemeData = { colors: { primary: '#445566' } }
      vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue({ put: vi.fn(), match: vi.fn().mockResolvedValue({ json: async () => cachedTheme }) }) })

      await expect(fetchThemeData('https://example.com/themes/acme/theme.json')).resolves.toEqual(cachedTheme)
    })

    it('キャッシュも無い場合は undefined を返す（取得失敗時に利用を妨げない）', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network')))
      vi.stubGlobal('caches', { open: vi.fn().mockResolvedValue({ put: vi.fn(), match: vi.fn().mockResolvedValue(undefined) }) })

      await expect(fetchThemeData('https://example.com/themes/acme/theme.json')).resolves.toBeUndefined()
    })

    it('相対パス（ローカル同梱）はアセット参照を書き換えない（既存の document 基準解決を維持）', async () => {
      const theme: ThemeData = { icons: { logo: 'image/logo.png' } }
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => theme }))
      vi.stubGlobal('caches', undefined)

      await expect(fetchThemeData('/theme/brand.json')).resolves.toEqual(theme)
    })
  })
})

describe('mergeThemeData（brand→deck の合成・#170）', () => {
  it('両方未指定なら undefined を返す', () => {
    expect(mergeThemeData(undefined, undefined)).toBeUndefined()
  })

  it('colors はキー単位でマージし、同名キーは theme（第2引数）が優先される', () => {
    const merged = mergeThemeData({ colors: { primary: '#000000', background: '#bbbbbb' } }, { colors: { primary: '#333333' } })

    expect(merged?.colors?.primary).toBe('#333333')
    expect(merged?.colors?.background).toBe('#bbbbbb')
  })

  it('masters/masterMap はキー単位でマージし、同名キーは theme が優先される', () => {
    const brand: ThemeData = { masters: { corp: { decorations: [] } }, masterMap: { center: 'corp', content: 'corp' } }
    const theme: ThemeData = { masters: { deck: { decorations: [] } }, masterMap: { content: 'deck' } }

    const merged = mergeThemeData(brand, theme)

    expect(Object.keys(merged?.masters ?? {})).toEqual(expect.arrayContaining(['corp', 'deck']))
    expect(merged?.masterMap?.center).toBe('corp')
    expect(merged?.masterMap?.content).toBe('deck')
  })

  it('tokens は masterKey 単位・内側の CSS 変数キー単位でマージする', () => {
    const brand: ThemeData = { tokens: { corp: { '--a': '1', '--b': '2' } } }
    const theme: ThemeData = { tokens: { corp: { '--b': '20' }, deck: { '--c': '3' } } }

    const merged = mergeThemeData(brand, theme)

    expect(merged?.tokens?.corp).toEqual({ '--a': '1', '--b': '20' })
    expect(merged?.tokens?.deck).toEqual({ '--c': '3' })
  })

  it('fonts.sources は連結し、他のキーは theme が優先される', () => {
    const brand: ThemeData = { fonts: { heading: 'BrandHeading', sources: [{ family: 'BrandFont', src: '/brand.woff2' }] } }
    const theme: ThemeData = { fonts: { heading: 'DeckHeading', sources: [{ family: 'DeckFont', src: '/deck.woff2' }] } }

    const merged = mergeThemeData(brand, theme)

    expect(merged?.fonts?.heading).toBe('DeckHeading')
    expect(merged?.fonts?.sources).toEqual([
      { family: 'BrandFont', src: '/brand.woff2' },
      { family: 'DeckFont', src: '/deck.woff2' },
    ])
  })

  it('fonts.fontSizeRatios はキー単位でマージし、同名キーは theme が優先される（#187）', () => {
    const brand: ThemeData = { fonts: { fontSizeRatios: { h1: 4.0, caption: 0.6 } } }
    const theme: ThemeData = { fonts: { fontSizeRatios: { h1: 3.6 } } }

    const merged = mergeThemeData(brand, theme)

    expect(merged?.fonts?.fontSizeRatios).toEqual({ h1: 3.6, caption: 0.6 })
  })

  it('icons はキー単位でマージし、同名キーは theme が優先される（#201）', () => {
    const brand: ThemeData = { icons: { rocket: 'image/icons/rocket-brand.svg', logo: 'image/icons/logo.svg' } }
    const theme: ThemeData = { icons: { rocket: 'image/icons/rocket-deck.svg' } }

    const merged = mergeThemeData(brand, theme)

    expect(merged?.icons).toEqual({ rocket: 'image/icons/rocket-deck.svg', logo: 'image/icons/logo.svg' })
  })

  it('customCSS は brand→theme の順で連結する', () => {
    const merged = mergeThemeData({ customCSS: '.brand {}' }, { customCSS: '.deck {}' })

    expect(merged?.customCSS).toBe('.brand {}\n.deck {}')
  })

  it('brand のみ指定時はそのまま反映される', () => {
    const brand: ThemeData = { colors: { primary: '#000000' } }

    expect(mergeThemeData(brand, undefined)).toEqual({
      colors: { primary: '#000000' },
      fonts: undefined,
      icons: undefined,
      customCSS: undefined,
      masters: undefined,
      masterMap: undefined,
      tokens: undefined,
    })
  })

  it('canvas は width/height を個別キーでマージし、同名キーは theme が優先される（#188）', () => {
    const brand: ThemeData = { canvas: { width: 1280, height: 720 } }
    const theme: ThemeData = { canvas: { height: 960 } }

    const merged = mergeThemeData(brand, theme)

    expect(merged?.canvas).toEqual({ width: 1280, height: 960 })
  })

  it('canvas.safeArea は辺単位でマージし、同名の辺は theme が優先される（#188）', () => {
    const brand: ThemeData = { canvas: { safeArea: { top: 40, left: 40 } } }
    const theme: ThemeData = { canvas: { safeArea: { top: 80 } } }

    const merged = mergeThemeData(brand, theme)

    expect(merged?.canvas?.safeArea).toEqual({ top: 80, left: 40 })
  })

  it('両方 canvas 未指定なら canvas は undefined', () => {
    const merged = mergeThemeData({ colors: { primary: '#000000' } }, { colors: { accent: '#111111' } })

    expect(merged?.canvas).toBeUndefined()
  })
})

describe('applyBaseFontSize', () => {
  let root: HTMLElement

  beforeEach(() => {
    root = document.documentElement
    root.style.cssText = ''
  })

  it('デフォルトの baseFontSize (20) で正しい比率のサイズを設定する', () => {
    applyBaseFontSize(root, 20)

    expect(root.style.getPropertyValue('--theme-font-size-base')).toBe('20px')
    expect(root.style.getPropertyValue('--theme-font-size-h1')).toBe('72px')
    expect(root.style.getPropertyValue('--theme-font-size-h2')).toBe('48px')
    expect(root.style.getPropertyValue('--theme-font-size-h3')).toBe('24px')
    expect(root.style.getPropertyValue('--theme-font-size-h4')).toBe('20px')
    expect(root.style.getPropertyValue('--theme-font-size-subtitle1')).toBe('28px')
    expect(root.style.getPropertyValue('--theme-font-size-body1')).toBe('20px')
    expect(root.style.getPropertyValue('--theme-font-size-body2')).toBe('16px')
  })

  it('baseFontSize: 24 で正しいスケーリングを行う', () => {
    applyBaseFontSize(root, 24)

    expect(root.style.getPropertyValue('--theme-font-size-base')).toBe('24px')
    expect(root.style.getPropertyValue('--theme-font-size-h1')).toBe('86.4px')
    expect(parseFloat(root.style.getPropertyValue('--theme-font-size-h2'))).toBeCloseTo(57.6)
    expect(root.style.getPropertyValue('--theme-font-size-body1')).toBe('24px')
    expect(parseFloat(root.style.getPropertyValue('--theme-font-size-body2'))).toBeCloseTo(19.2)
  })

  it('ratios で既定の比率を上書きできる（#187）', () => {
    applyBaseFontSize(root, 20, { h1: 2.0 })

    expect(root.style.getPropertyValue('--theme-font-size-h1')).toBe('40px')
    // 上書きしていない段は既定比率のまま
    expect(root.style.getPropertyValue('--theme-font-size-h2')).toBe('48px')
  })

  it('ratios で既定にない段を追加できる（型階層の拡張・#187）', () => {
    applyBaseFontSize(root, 20, { caption: 0.6 })

    expect(root.style.getPropertyValue('--theme-font-size-caption')).toBe('12px')
  })
})

describe('loadFontSources', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
  })

  it('ローカルフォントの @font-face スタイルを追加する', () => {
    loadFontSources([{ family: 'MyFont', src: '/fonts/MyFont.woff2' }])

    const style = document.getElementById('sdd-font-face-myfont-normal-normal') as HTMLStyleElement
    expect(style).not.toBeNull()
    expect(style.textContent).toContain("font-family: 'MyFont'")
    expect(style.textContent).toContain("url('/fonts/MyFont.woff2')")
  })

  it('外部フォントの link タグを追加する', () => {
    const url = 'https://fonts.googleapis.com/css2?family=Fira+Code'
    loadFontSources([{ family: 'Fira Code', url }])

    const link = document.querySelector(`link[href="${url}"]`) as HTMLLinkElement
    expect(link).not.toBeNull()
    expect(link.rel).toBe('stylesheet')
  })

  it('同じフォントを2回ロードしても重複しない', () => {
    loadFontSources([{ family: 'MyFont', src: '/fonts/MyFont.woff2' }])
    loadFontSources([{ family: 'MyFont', src: '/fonts/MyFont.woff2' }])

    const styles = document.querySelectorAll('#sdd-font-face-myfont-normal-normal')
    expect(styles.length).toBe(1)
  })

  it('同じ URL の link タグを2回追加しない', () => {
    const url = 'https://fonts.googleapis.com/css2?family=Fira+Code'
    loadFontSources([{ family: 'Fira Code', url }])
    loadFontSources([{ family: 'Fira Code', url }])

    const links = document.querySelectorAll(`link[href="${url}"]`)
    expect(links.length).toBe(1)
  })
})

describe('applyThemeData - fonts integration', () => {
  beforeEach(() => {
    document.documentElement.style.cssText = ''
    document.head.innerHTML = ''
  })

  it('fonts.baseFontSize が設定されていればフォントサイズ CSS 変数を適用する', () => {
    const themeData: ThemeData = {
      fonts: {
        baseFontSize: 24,
      },
    }
    applyThemeData(themeData)

    expect(document.documentElement.style.getPropertyValue('--theme-font-size-base')).toBe('24px')
    expect(document.documentElement.style.getPropertyValue('--theme-font-size-h1')).toBe('86.4px')
  })

  it('fonts.sources が設定されていればフォントをロードする', () => {
    const themeData: ThemeData = {
      fonts: {
        sources: [{ family: 'TestFont', src: '/fonts/test.woff2' }],
      },
    }
    applyThemeData(themeData)

    const style = document.getElementById('sdd-font-face-testfont-normal-normal')
    expect(style).not.toBeNull()
  })

  it('文字列指定はそのまま font-family CSS 変数へ設定する（後方互換）', () => {
    applyThemeData({ fonts: { heading: 'CustomHeading' } })

    expect(document.documentElement.style.getPropertyValue('--theme-font-heading')).toBe('CustomHeading')
  })

  it('オブジェクト指定は「欧文 → 和文」の順で font-family を組み立てる（和欧混植・#187）', () => {
    applyThemeData({ fonts: { heading: { latin: 'Poppins', ea: 'Noto Sans JP' } } })

    expect(document.documentElement.style.getPropertyValue('--theme-font-heading')).toBe('Poppins, Noto Sans JP')
  })

  it('オブジェクト指定の weight を font-weight CSS 変数へ設定する（#187）', () => {
    applyThemeData({ fonts: { heading: { latin: 'Poppins', weight: '900' }, body: { latin: 'Inter', weight: '300' } } })

    expect(document.documentElement.style.getPropertyValue('--theme-font-weight-heading')).toBe('900')
    expect(document.documentElement.style.getPropertyValue('--theme-font-weight-body')).toBe('300')
  })

  it('weight 未指定のオブジェクト指定では font-weight CSS 変数を設定しない（既定のカスケードに委ねる）', () => {
    applyThemeData({ fonts: { heading: { latin: 'Poppins' } } })

    expect(document.documentElement.style.getPropertyValue('--theme-font-weight-heading')).toBe('')
  })

  it('fonts.fontSizeRatios のみの指定でも既定 baseFontSize（20px）で型階層を適用する（#187）', () => {
    applyThemeData({ fonts: { fontSizeRatios: { caption: 0.6 } } })

    expect(document.documentElement.style.getPropertyValue('--theme-font-size-base')).toBe('20px')
    expect(document.documentElement.style.getPropertyValue('--theme-font-size-caption')).toBe('12px')
    expect(document.documentElement.style.getPropertyValue('--theme-font-size-h1')).toBe('72px')
  })

  it('フォント名の文字列プロパティのみ CSS 変数に設定する', () => {
    const themeData: ThemeData = {
      fonts: {
        heading: 'CustomHeading',
        body: 'CustomBody',
        baseFontSize: 24,
      },
    }
    applyThemeData(themeData)

    expect(document.documentElement.style.getPropertyValue('--theme-font-heading')).toBe('CustomHeading')
    expect(document.documentElement.style.getPropertyValue('--theme-font-body')).toBe('CustomBody')
  })
})

describe('applyThemeData - canvas.safeArea（#188）', () => {
  beforeEach(() => {
    document.documentElement.style.cssText = ''
  })

  it('指定した辺だけ --theme-safe-* CSS 変数を設定する', () => {
    applyThemeData({ canvas: { safeArea: { top: 100, right: 20 } } })

    expect(document.documentElement.style.getPropertyValue('--theme-safe-top')).toBe('100px')
    expect(document.documentElement.style.getPropertyValue('--theme-safe-right')).toBe('20px')
    expect(document.documentElement.style.getPropertyValue('--theme-safe-bottom')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--theme-safe-left')).toBe('')
  })

  it('canvas.safeArea 未指定時は CSS 変数を書き込まない（CSS 側の 60px フォールバックに委ねる）', () => {
    applyThemeData({ canvas: { width: 1280, height: 960 } })

    expect(document.documentElement.style.getPropertyValue('--theme-safe-top')).toBe('')
  })
})

describe('applyThemeData - icons integration（#201）', () => {
  afterEach(() => {
    resetThemeOverrides()
  })

  it('theme.icons を ComponentRegistry に Icon:<name> として登録する', () => {
    applyThemeData({ icons: { rocket: 'image/icons/rocket.svg' } })

    expect(hasComponent('Icon:rocket')).toBe(true)
  })

  it('srcが空文字列のアイコンは登録しない', () => {
    applyThemeData({ icons: { broken: '' } })

    expect(hasComponent('Icon:broken')).toBe(false)
  })
})

describe('resetThemeOverrides', () => {
  beforeEach(() => {
    document.documentElement.style.cssText = ''
    document.head.innerHTML = ''
  })

  it('意匠トークンの :root 上書き（tokens 由来の <style>）を消す（#190）', () => {
    applyThemeData({ tokens: { '*': { 'theme-radius-lg': '4px' } } })

    resetThemeOverrides()

    expect(document.getElementById('sdd-master-tokens-css')).toBeNull()
  })

  it('前のプレゼンテーションで設定した色・フォントの CSS 変数を消す', () => {
    applyThemeData({ colors: { primary: '#123456', text: '#abcdef' }, fonts: { heading: 'CustomHeading', baseFontSize: 24 } })

    resetThemeOverrides()

    expect(document.documentElement.style.getPropertyValue('--theme-primary')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--theme-text-body')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--theme-font-heading')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--theme-font-size-base')).toBe('')
  })

  it('前のプレゼンテーションで設定した font-weight と、動的に追加した型階層の段を消す（#187）', () => {
    applyThemeData({ fonts: { heading: { latin: 'Poppins', weight: '900' }, fontSizeRatios: { caption: 0.6 } } })

    resetThemeOverrides()

    expect(document.documentElement.style.getPropertyValue('--theme-font-weight-heading')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--theme-font-size-caption')).toBe('')
  })

  it('前のプレゼンテーションで設定したセーフエリアの CSS 変数を消す（#188）', () => {
    applyThemeData({ canvas: { safeArea: { top: 100, right: 20, bottom: 10, left: 5 } } })

    resetThemeOverrides()

    expect(document.documentElement.style.getPropertyValue('--theme-safe-top')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--theme-safe-right')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--theme-safe-bottom')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--theme-safe-left')).toBe('')
  })

  it('前のプレゼンテーションの customCSS を取り除く', () => {
    applyThemeData({ customCSS: '.foo { color: red; }' })
    expect(document.getElementById('sdd-custom-theme-css')).not.toBeNull()

    resetThemeOverrides()

    expect(document.getElementById('sdd-custom-theme-css')).toBeNull()
  })

  it('前のプレゼンテーションで読み込んだフォントの style/link 要素を取り除く', () => {
    loadFontSources([
      { family: 'MyFont', src: '/fonts/MyFont.woff2' },
      { family: 'Fira Code', url: 'https://fonts.googleapis.com/css2?family=Fira+Code' },
    ])

    resetThemeOverrides()

    expect(document.getElementById('sdd-font-face-myfont')).toBeNull()
    expect(document.querySelector('link[data-sdd-dynamic-font="true"]')).toBeNull()
  })

  it('前のプレゼンテーションで登録した theme.icons を ComponentRegistry から解除する（#201）', () => {
    applyThemeData({ icons: { rocket: 'image/icons/rocket.svg' } })
    expect(hasComponent('Icon:rocket')).toBe(true)

    resetThemeOverrides()

    expect(hasComponent('Icon:rocket')).toBe(false)
  })

  it('accent の CSS 変数（--theme-accent, -rgb）も消す', () => {
    applyThemeData({ colors: { accent: '#123456' } })
    expect(document.documentElement.style.getPropertyValue('--theme-accent')).toBe('#123456')

    resetThemeOverrides()

    expect(document.documentElement.style.getPropertyValue('--theme-accent')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--theme-accent-rgb')).toBe('')
  })
})

describe('normalizeHex', () => {
  it('6桁hexはそのまま（小文字化して）解釈する', () => {
    expect(normalizeHex('#2DD4BF')).toBe('#2dd4bf')
  })

  it('3桁hexを6桁に展開する', () => {
    expect(normalizeHex('#abc')).toBe('#aabbcc')
  })

  it('rgb() 表記を6桁hexに変換する', () => {
    expect(normalizeHex('rgb(45, 212, 191)')).toBe('#2dd4bf')
  })

  it('CSS色名を6桁hexに変換する', () => {
    expect(normalizeHex('teal')).toBe('#008080')
  })

  it('解釈できない値は null を返す', () => {
    expect(normalizeHex('not-a-color')).toBeNull()
  })
})

describe('THEME_COLOR_TOKENS 統合（accent/primary 分離・12キー対応・-rgb の NaN 事故防止）', () => {
  beforeEach(() => {
    document.documentElement.style.cssText = ''
  })

  it('accent は primary を上書きせず --theme-accent に独立して反映される', () => {
    applyThemeData({ colors: { primary: '#111111', accent: '#222222' } })

    expect(document.documentElement.style.getPropertyValue('--theme-primary')).toBe('#111111')
    expect(document.documentElement.style.getPropertyValue('--theme-accent')).toBe('#222222')
  })

  it('theme.colors から外部JSONと同じ12キー（textHeading 等）を指定できる', () => {
    applyThemeData({
      colors: {
        backgroundAlt: '#101010',
        backgroundGrid: '#202020',
        textHeading: '#f0f0f0',
        textBody: '#e0e0e0',
        textSubtitle: '#d0d0d0',
        textMuted: '#c0c0c0',
        border: '#303030',
        borderLight: '#404040',
        codeText: '#505050',
        success: '#606060',
      },
    })

    expect(document.documentElement.style.getPropertyValue('--theme-background-alt')).toBe('#101010')
    expect(document.documentElement.style.getPropertyValue('--theme-background-grid')).toBe('#202020')
    expect(document.documentElement.style.getPropertyValue('--theme-text-heading')).toBe('#f0f0f0')
    expect(document.documentElement.style.getPropertyValue('--theme-text-subtitle')).toBe('#d0d0d0')
    expect(document.documentElement.style.getPropertyValue('--theme-text-muted')).toBe('#c0c0c0')
    expect(document.documentElement.style.getPropertyValue('--theme-border')).toBe('#303030')
    expect(document.documentElement.style.getPropertyValue('--theme-border-light')).toBe('#404040')
    expect(document.documentElement.style.getPropertyValue('--theme-code-text')).toBe('#505050')
    expect(document.documentElement.style.getPropertyValue('--theme-success')).toBe('#606060')
  })

  it('theme.colors.text は後方互換で --theme-text-body に反映される', () => {
    applyThemeData({ colors: { text: '#e0e0e0' } })
    expect(document.documentElement.style.getPropertyValue('--theme-text-body')).toBe('#e0e0e0')
  })

  it('外部 theme-colors.json 経由でも3桁hex/rgb()/色名で -rgb が NaN にならない（事故防止）', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ primary: '#abc', background: 'rgb(10, 20, 30)', textBody: 'teal' }),
      }),
    )

    await applyTheme('/pkg/theme-colors.json')

    expect(document.documentElement.style.getPropertyValue('--theme-primary-rgb')).toBe('170, 187, 204')
    expect(document.documentElement.style.getPropertyValue('--theme-background-rgb')).toBe('10, 20, 30')
    expect(document.documentElement.style.getPropertyValue('--theme-text-body-rgb')).toBe('0, 128, 128')

    vi.unstubAllGlobals()
  })

  it('theme.colors 経由でも3桁hex/rgb()/色名で -rgb が NaN にならない（事故防止）', () => {
    applyThemeData({ colors: { primary: '#abc', accent: 'rgb(10, 20, 30)', text: 'teal' } })

    expect(document.documentElement.style.getPropertyValue('--theme-primary-rgb')).toBe('170, 187, 204')
    expect(document.documentElement.style.getPropertyValue('--theme-accent-rgb')).toBe('10, 20, 30')
    expect(document.documentElement.style.getPropertyValue('--theme-text-body-rgb')).toBe('0, 128, 128')
  })

  it('解釈できない色値は -rgb を設定しない（NaN を残さない）', () => {
    applyThemeData({ colors: { primary: 'not-a-color' } })

    expect(document.documentElement.style.getPropertyValue('--theme-primary')).toBe('not-a-color')
    expect(document.documentElement.style.getPropertyValue('--theme-primary-rgb')).toBe('')
  })
})

describe('新規カラートークン（系列色・状態色・リンク色・#186）', () => {
  beforeEach(() => {
    document.documentElement.style.cssText = ''
  })

  it('warning/danger/neutral/link/linkVisited を CSS 変数へ反映する', () => {
    applyThemeData({ colors: { warning: '#111111', danger: '#222222', neutral: '#333333', link: '#444444', linkVisited: '#555555' } })

    expect(document.documentElement.style.getPropertyValue('--theme-warning')).toBe('#111111')
    expect(document.documentElement.style.getPropertyValue('--theme-danger')).toBe('#222222')
    expect(document.documentElement.style.getPropertyValue('--theme-neutral')).toBe('#333333')
    expect(document.documentElement.style.getPropertyValue('--theme-link')).toBe('#444444')
    expect(document.documentElement.style.getPropertyValue('--theme-link-visited')).toBe('#555555')
  })

  it('未知キーとして誤検知されない（getThemeWarnings）', () => {
    const warnings = getThemeWarnings({ colors: { warning: '#111111', danger: '#222222', neutral: '#333333', link: '#444444', linkVisited: '#555555', series1: '#666666' } })
    expect(warnings).toEqual([])
  })
})

describe('系列色のフォールバック導出（primary/accent からの決定的導出・#186）', () => {
  beforeEach(() => {
    document.documentElement.style.cssText = ''
  })

  it('primary/accent が指定されていれば series1/series2 はそれぞれの値をそのまま採用する', () => {
    applyThemeData({ colors: { primary: '#2dd4bf', accent: '#ff0000' } })

    expect(document.documentElement.style.getPropertyValue('--theme-series-1')).toBe('#2dd4bf')
    expect(document.documentElement.style.getPropertyValue('--theme-series-2')).toBe('#ff0000')
  })

  it('series3〜6 は primary の色相を120/180/240/300度回転させた値になる', () => {
    applyThemeData({ colors: { primary: '#2dd4bf', accent: '#ff0000' } })

    expect(document.documentElement.style.getPropertyValue('--theme-series-3')).toBe('#bf2dd4')
    expect(document.documentElement.style.getPropertyValue('--theme-series-4')).toBe('#d42d42')
    expect(document.documentElement.style.getPropertyValue('--theme-series-5')).toBe('#d4bf2d')
    expect(document.documentElement.style.getPropertyValue('--theme-series-6')).toBe('#42d42d')
  })

  it('同じ primary/accent からは常に同じ6色が導出される（決定的）', () => {
    applyThemeData({ colors: { primary: '#2dd4bf', accent: '#ff0000' } })
    const first = [1, 2, 3, 4, 5, 6].map((i) => document.documentElement.style.getPropertyValue(`--theme-series-${i}`))

    document.documentElement.style.cssText = ''
    applyThemeData({ colors: { primary: '#2dd4bf', accent: '#ff0000' } })
    const second = [1, 2, 3, 4, 5, 6].map((i) => document.documentElement.style.getPropertyValue(`--theme-series-${i}`))

    expect(second).toEqual(first)
  })

  it('明示的に指定された series は導出で上書きしない', () => {
    applyThemeData({ colors: { primary: '#2dd4bf', accent: '#ff0000', series3: '#123456' } })

    expect(document.documentElement.style.getPropertyValue('--theme-series-3')).toBe('#123456')
    // series4 は未指定なので導出される
    expect(document.documentElement.style.getPropertyValue('--theme-series-4')).toBe('#d42d42')
  })

  it('accent が primary と同色なら series2 も色相回転で作る（同色では系列を区別できないため・#204）', () => {
    applyThemeData({ colors: { primary: '#2dd4bf', accent: '#2dd4bf' } })

    expect(document.documentElement.style.getPropertyValue('--theme-series-1')).toBe('#2dd4bf')
    expect(document.documentElement.style.getPropertyValue('--theme-series-2')).toBe('#2d42d4')
    expect(new Set([1, 2, 3, 4, 5, 6].map((i) => document.documentElement.style.getPropertyValue(`--theme-series-${i}`))).size).toBe(6)
  })

  it('primary/accent のどちらも解釈できない場合は導出をスキップする（テスト環境等の未初期化状態で NaN 事故を起こさない）', () => {
    applyThemeData({ fonts: { heading: 'Foo' } })

    expect(document.documentElement.style.getPropertyValue('--theme-series-1')).toBe('')
  })
})

describe('getThemeWarnings', () => {
  it('theme 未指定・colors 未指定なら空配列を返す', () => {
    expect(getThemeWarnings(undefined)).toEqual([])
    expect(getThemeWarnings({})).toEqual([])
  })

  it('正常な色指定のみなら空配列を返す', () => {
    expect(getThemeWarnings({ colors: { primary: '#112233', textHeading: 'teal' } })).toEqual([])
  })

  it('不明なキーを警告する', () => {
    const warnings = getThemeWarnings({ colors: { foo: '#112233' } })
    expect(warnings.some((w) => w.includes('foo'))).toBe(true)
  })

  it('解釈できない色値を警告する', () => {
    const warnings = getThemeWarnings({ colors: { primary: 'not-a-color' } })
    expect(warnings.some((w) => w.includes('primary') && w.includes('not-a-color'))).toBe(true)
  })

  it('fonts.sources に src/url/localName のいずれも無ければ警告する', () => {
    const warnings = getThemeWarnings({ fonts: { sources: [{ family: 'Orphan' }] } })
    expect(warnings.some((w) => w.includes('Orphan'))).toBe(true)
  })

  it('fonts.sources に src/url/localName のいずれかがあれば警告しない', () => {
    expect(getThemeWarnings({ fonts: { sources: [{ family: 'X', localName: 'Arial' }] } })).toEqual([])
  })

  // #185: slides を渡すと slide.meta.master の検証（getMasterWarnings）も含まれる
  it('slides を渡すと slide.meta.master が存在しない masterKey を参照する場合に警告する', () => {
    const theme = { masters: { standard: { decorations: [] } } }
    const warnings = getThemeWarnings(theme, [{ id: 's1', layout: 'center', content: {}, meta: { master: 'missing' } }])
    expect(warnings.some((w) => w.includes('slides[0].meta.master'))).toBe(true)
  })

  // #201: theme.icons に src 未指定のエントリがあれば警告する
  it('icons に src 未指定のエントリがあれば警告する', () => {
    const warnings = getThemeWarnings({ icons: { broken: '' } })
    expect(warnings.some((w) => w.includes('theme.icons.broken'))).toBe(true)
  })

  // #201: content.tiles[].icon が ComponentRegistry に未登録なら theme 未指定でも警告する
  it('slides を渡すと content.tiles[].icon が未登録の場合に警告する', () => {
    const warnings = getThemeWarnings(undefined, [{ id: 's1', layout: 'content', content: { tiles: [{ icon: 'NoSuchIcon', title: 'A', description: 'a' }] } }])
    expect(warnings.some((w) => w.includes('slides[0].content.tiles[0].icon') && w.includes('NoSuchIcon'))).toBe(true)
  })

  // #241: content.chart の指定ミスは白紙描画になり原因が伝わらないため、既存の警告集約機構に載せる
  describe('content.chart / component:{name:"Chart"} の指定ミス（#241）', () => {
    it('未知の type を警告する', () => {
      const warnings = getThemeWarnings(undefined, [{ id: 's1', layout: 'content', content: { chart: { type: 'radar' } } }])
      expect(warnings.some((w) => w.includes('slides[0].content.chart') && w.includes('radar'))).toBe(true)
    })

    it('categories と series の両方が空の場合を警告する', () => {
      const warnings = getThemeWarnings(undefined, [{ id: 's1', layout: 'content', content: { chart: { type: 'bar' } } }])
      expect(warnings.some((w) => w.includes('slides[0].content.chart') && w.includes('categories') && w.includes('series'))).toBe(true)
    })

    it('kpi で value も trend も無い場合を警告する', () => {
      const warnings = getThemeWarnings(undefined, [{ id: 's1', layout: 'content', content: { chart: { type: 'kpi', label: 'MAU' } } }])
      expect(warnings.some((w) => w.includes('slides[0].content.chart') && w.includes('kpi'))).toBe(true)
    })

    it('未知の色トークン名を警告する（series[].color・kpi の color）', () => {
      const warnings = getThemeWarnings(undefined, [{ id: 's1', layout: 'content', content: { chart: { type: 'bar', categories: ['A'], series: [{ values: [1], color: 'seriez1' }] } } }])
      expect(warnings.some((w) => w.includes('slides[0].content.chart') && w.includes('seriez1'))).toBe(true)
    })

    it('妥当な chart 指定では警告しない', () => {
      const warnings = getThemeWarnings(undefined, [{ id: 's1', layout: 'content', content: { chart: { type: 'bar', categories: ['A', 'B'], series: [{ values: [1, 2], color: 'series2' }] } } }])
      expect(warnings.filter((w) => w.includes('content.chart'))).toEqual([])
    })

    it('two-column の左右カラムの component: { name: "Chart" } も検出する', () => {
      const warnings = getThemeWarnings(undefined, [
        {
          id: 's1',
          layout: 'two-column',
          content: {
            title: 'T',
            left: { component: { name: 'Chart', props: { type: 'radar' } } },
            right: { component: { name: 'Chart', props: { type: 'kpi' } } },
          },
        },
      ])
      expect(warnings.some((w) => w.includes('slides[0].content.left.component.props') && w.includes('radar'))).toBe(true)
      expect(warnings.some((w) => w.includes('slides[0].content.right.component.props') && w.includes('kpi'))).toBe(true)
    })

    it('bleed/custom の content.component: { name: "Chart" } も検出する', () => {
      const warnings = getThemeWarnings(undefined, [{ id: 's1', layout: 'bleed', content: { title: 'T', component: { name: 'Chart', props: { type: 'radar' } } } }])
      expect(warnings.some((w) => w.includes('slides[0].content.component.props') && w.includes('radar'))).toBe(true)
    })

    it('Chart 以外の component は対象外', () => {
      const warnings = getThemeWarnings(undefined, [{ id: 's1', layout: 'custom', content: { component: { name: 'Diagram', props: { type: 'radar' } } } }])
      expect(warnings).toEqual([])
    })
  })

  // #187: heading/body/code がオブジェクト形式の場合の weight 検証
  it('文字列指定（後方互換）では weight 検証をスキップし警告しない', () => {
    expect(getThemeWarnings({ fonts: { heading: 'Poppins' } })).toEqual([])
  })

  it('不正な形式の weight を警告する', () => {
    const warnings = getThemeWarnings({ fonts: { heading: { latin: 'Poppins', weight: 'super-bold' } } })
    expect(warnings.some((w) => w.includes('theme.fonts.heading.weight') && w.includes('super-bold'))).toBe(true)
  })

  it('有効な weight（100刻みの数値・キーワード）では形式警告を出さない', () => {
    expect(getThemeWarnings({ fonts: { heading: { latin: 'Poppins', weight: '700' } } })).toEqual([])
    expect(getThemeWarnings({ fonts: { body: { latin: 'Inter', weight: 'bold' } } })).toEqual([])
  })

  it('sources が定義されているのに、指定した weight に対応する @font-face が無ければ警告する', () => {
    const warnings = getThemeWarnings({
      fonts: {
        heading: { latin: 'Poppins', weight: '700' },
        sources: [{ family: 'Poppins', src: '/poppins-400.woff2', weight: '400' }],
      },
    })
    expect(warnings.some((w) => w.includes('theme.fonts.heading.weight') && w.includes('登録されていません'))).toBe(true)
  })

  it('sources に一致する family + weight の @font-face があれば警告しない', () => {
    const warnings = getThemeWarnings({
      fonts: {
        heading: { latin: 'Poppins', weight: '700' },
        sources: [{ family: 'Poppins', src: '/poppins-700.woff2', weight: '700' }],
      },
    })
    expect(warnings).toEqual([])
  })

  it('sources が定義されていない場合は書体登録チェックをスキップする（Webセーフフォント運用を妨げない）', () => {
    expect(getThemeWarnings({ fonts: { heading: { latin: 'Georgia', weight: '700' } } })).toEqual([])
  })

  // #209: theme.colors 直書きのコントラスト検証
  describe('コントラスト検証（#209）', () => {
    it('theme.colors で文字色/背景色の両方が明示され AA 未達なら警告する', () => {
      const warnings = getThemeWarnings({ colors: { textBody: '#ffffff', background: '#f0f0f0' } })
      expect(warnings.some((w) => w.includes('theme.colors') && w.includes('textBody') && w.includes('background') && w.includes('WCAG AA'))).toBe(true)
    })

    it('theme.colors で AA を満たす組は警告しない', () => {
      expect(getThemeWarnings({ colors: { textBody: '#000000', background: '#ffffff' } })).toEqual([])
    })

    it('文字色・背景色のどちらか一方しか明示されていない場合は検証しない（既定値の複製を避ける）', () => {
      expect(getThemeWarnings({ colors: { textBody: '#ffffff' } })).toEqual([])
      expect(getThemeWarnings({ colors: { background: '#f0f0f0' } })).toEqual([])
    })

    it('theme.tokens（masterKey スコープ）で AA 未達なら警告する', () => {
      const warnings = getThemeWarnings({ tokens: { promo: { 'theme-text-body': '#eeeeee', 'theme-background': '#ffffff' } } })
      expect(warnings.some((w) => w.includes('theme.tokens.promo') && w.includes('textBody') && w.includes('background'))).toBe(true)
    })

    it('theme.tokens で AA を満たす組は警告しない', () => {
      const theme = { masters: { promo: { decorations: [] } }, tokens: { promo: { 'theme-text-body': '#000000', 'theme-background': '#ffffff' } } }
      expect(getThemeWarnings(theme)).toEqual([])
    })

    it('masters の全面塗り背景（fill）が本文文字色と AA 未達なら警告する', () => {
      const theme = { colors: { textBody: '#ffffff' }, masters: { promo: { decorations: [], background: { type: 'fill' as const, color: '#f5f5f5' } } } }
      const warnings = getThemeWarnings(theme)
      expect(warnings.some((w) => w.includes('theme.masters.promo.background'))).toBe(true)
    })

    it('masters の全面塗り背景（gradient）は from/to の両方を検証する', () => {
      // from（黒地に近い#111111）は本文色（黒）と AA 未達、to（白地に近い#eeeeee）は十分な明度差で AA 達成
      const theme = { colors: { textBody: '#000000' }, masters: { promo: { decorations: [], background: { type: 'gradient' as const, from: '#111111', to: '#eeeeee' } } } }
      const warnings = getThemeWarnings(theme)
      expect(warnings.some((w) => w.includes('theme.masters.promo.background') && w.includes('from'))).toBe(true)
      expect(warnings.some((w) => w.includes('theme.masters.promo.background') && w.includes('to'))).toBe(false)
    })

    it('masters の background が plain/grid/image の場合は塗り色が不定のため検証しない', () => {
      const theme = { colors: { textBody: '#ffffff' }, masters: { promo: { decorations: [], background: { type: 'plain' as const } } } }
      expect(getThemeWarnings(theme)).toEqual([])
    })

    // #197: 全面塗り背景の上には本文（大メッセージ）だけでなく出典・補足（textMuted）も載る
    it('masters の全面塗り背景は本文色以外の文字色（textMuted 等）も検証する', () => {
      const theme = {
        tokens: { inverse: { 'theme-text-body': '#ffffff', 'theme-text-muted': '#4a4a4a' } },
        masters: { inverse: { decorations: [], background: { type: 'fill' as const, color: '#1f2430' } } },
      }
      const warnings = getThemeWarnings(theme)
      // 本文色（白）は AA 達成、補足色（暗いグレー）は暗い塗りの上で AA 未達
      expect(warnings.some((w) => w.includes('theme.masters.inverse.background') && w.includes('textMuted'))).toBe(true)
      expect(warnings.some((w) => w.includes('theme.masters.inverse.background') && w.includes('textBody'))).toBe(false)
    })

    it('masters 背景の検証は tokens の上書きを theme.colors より優先する', () => {
      const theme = {
        colors: { textBody: '#ffffff' },
        tokens: { promo: { 'theme-text-body': '#000000' } },
        masters: { promo: { decorations: [], background: { type: 'fill' as const, color: '#f5f5f5' } } },
      }
      const warnings = getThemeWarnings(theme)
      expect(warnings.some((w) => w.includes('theme.masters.promo.background'))).toBe(false)
    })
  })
})

describe('getContrastRatio（WCAG コントラスト比・#166）', () => {
  it('黒背景に白文字は最大値 21:1 に近いコントラスト比になる', () => {
    expect(getContrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0)
  })

  it('同色同士は 1:1 になる', () => {
    expect(getContrastRatio('#336699', '#336699')).toBeCloseTo(1, 5)
  })

  it('引数の順序に依存しない（明暗どちらが先でも同じ値）', () => {
    expect(getContrastRatio('#ffffff', '#000000')).toBeCloseTo(getContrastRatio('#000000', '#ffffff')!, 5)
  })

  it('どちらかが未指定なら null を返す', () => {
    expect(getContrastRatio(undefined, '#000000')).toBeNull()
    expect(getContrastRatio('#ffffff', undefined)).toBeNull()
  })

  it('解釈できない色値なら null を返す', () => {
    expect(getContrastRatio('not-a-color', '#000000')).toBeNull()
  })
})

describe('FontSource（weight/style/format/localName・#162）', () => {
  beforeEach(() => {
    document.head.innerHTML = ''
  })

  it('同じ family でも weight/style が異なれば別の @font-face として両方ロードされる', () => {
    loadFontSources([
      { family: 'MyFont', src: '/fonts/MyFont-Regular.woff2', weight: '400' },
      { family: 'MyFont', src: '/fonts/MyFont-Bold.woff2', weight: '700' },
    ])

    const styles = document.querySelectorAll('style[id^="sdd-font-face-myfont"]')
    expect(styles.length).toBe(2)
  })

  it('同じ family + weight + style は重複登録しない', () => {
    loadFontSources([{ family: 'MyFont', src: '/fonts/MyFont.woff2', weight: '400', style: 'italic' }])
    loadFontSources([{ family: 'MyFont', src: '/fonts/MyFont.woff2', weight: '400', style: 'italic' }])

    const styles = document.querySelectorAll('style[id^="sdd-font-face-myfont"]')
    expect(styles.length).toBe(1)
  })

  it('localName のみ（src なし）でも @font-face をロードする', () => {
    loadFontSources([{ family: 'SystemFont', localName: 'Arial' }])

    const style = document.querySelector('style[id^="sdd-font-face-systemfont"]')
    expect(style).not.toBeNull()
    expect(style?.textContent).toContain("local('Arial')")
  })

  it('format を指定すると @font-face の src に format() が付与される', () => {
    loadFontSources([{ family: 'MyFont', src: '/fonts/MyFont.woff2', format: 'woff2' }])

    const style = document.querySelector('style[id^="sdd-font-face-myfont"]')
    expect(style?.textContent).toContain("format('woff2')")
  })

  it('weight/style を @font-face の font-weight/font-style に反映する', () => {
    loadFontSources([{ family: 'MyFont', src: '/fonts/MyFont.woff2', weight: '700', style: 'italic' }])

    const style = document.querySelector('style[id^="sdd-font-face-myfont"]')
    expect(style?.textContent).toContain('font-weight: 700')
    expect(style?.textContent).toContain('font-style: italic')
  })
})
