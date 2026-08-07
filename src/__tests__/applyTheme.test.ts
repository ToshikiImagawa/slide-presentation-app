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

  it('前のプレゼンテーションで設定した色・フォントの CSS 変数を消す', () => {
    applyThemeData({ colors: { primary: '#123456', text: '#abcdef' }, fonts: { heading: 'CustomHeading', baseFontSize: 24 } })

    resetThemeOverrides()

    expect(document.documentElement.style.getPropertyValue('--theme-primary')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--theme-text-body')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--theme-font-heading')).toBe('')
    expect(document.documentElement.style.getPropertyValue('--theme-font-size-base')).toBe('')
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
