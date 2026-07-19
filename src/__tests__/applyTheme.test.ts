import { describe, it, expect, beforeEach } from 'vitest'
import { applyThemeData, applyBaseFontSize, loadFontSources, resetThemeOverrides } from '../applyTheme'
import type { ThemeData } from '../data'

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

    const style = document.getElementById('sdd-font-face-myfont') as HTMLStyleElement
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

    const styles = document.querySelectorAll('#sdd-font-face-myfont')
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

    const style = document.getElementById('sdd-font-face-testfont')
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
})
