import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { applyTheme, applyPresentationTheme, applyThemeData, applyBaseFontSize, loadFontSources, resetThemeOverrides, normalizeHex, getThemeWarnings } from '../applyTheme'
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
