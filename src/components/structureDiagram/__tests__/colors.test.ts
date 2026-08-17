import { afterEach, describe, expect, it } from 'vitest'
import { shadeSeries, shadeStep } from '../colors'

/** 各テストが documentElement へ設定したカスタムプロパティ・注入した <style> を掃除する（テスト間の汚染防止） */
afterEach(() => {
  document.documentElement.removeAttribute('style')
  document.querySelectorAll('style[data-test-scope-css]').forEach((el) => el.remove())
  document.body.innerHTML = ''
})

function injectScopedCss(css: string): void {
  const style = document.createElement('style')
  style.setAttribute('data-test-scope-css', 'true')
  style.textContent = css
  document.head.appendChild(style)
}

describe('shadeStep', () => {
  it('明示の濃淡トークンが未定義のときは shadeSeries の alpha 合成にフォールバックする（独自に alpha 計算をせず委譲する。合成算出は shadeSeries の1箇所に閉じる）', () => {
    expect(shadeStep('series1', 1)).toBe(shadeSeries('series1', 0.3))
    expect(shadeStep('series1', 2)).toBe(shadeSeries('series1', 0.6))
    expect(shadeStep('series1', 3)).toBe(shadeSeries('series1', 0.9))
  })

  it('明示の濃淡トークンが定義されていれば独自に alpha 計算をせず、その CSS 変数参照を返す', () => {
    document.documentElement.style.setProperty('--theme-series-1-shade-2', '#334455')
    expect(shadeStep('series1', 2)).toBe('var(--theme-series-1-shade-2)')
  })

  it('primary/accent にも series1〜6 と同じ命名規則が適用される', () => {
    document.documentElement.style.setProperty('--theme-primary-shade-1', '#101010')
    expect(shadeStep('primary', 1)).toBe('var(--theme-primary-shade-1)')
    expect(shadeStep('accent', 1)).toBe(shadeSeries('accent', 0.3))
  })

  it('段番号の範囲外（0）は段1へ丸める', () => {
    expect(shadeStep('series2', 0)).toBe(shadeSeries('series2', 0.3))
    document.documentElement.style.setProperty('--theme-series-2-shade-1', '#abcdef')
    expect(shadeStep('series2', 0)).toBe('var(--theme-series-2-shade-1)')
  })

  it('段番号の範囲外（4）は段3へ丸める', () => {
    expect(shadeStep('series3', 4)).toBe(shadeSeries('series3', 0.9))
    document.documentElement.style.setProperty('--theme-series-3-shade-3', '#fedcba')
    expect(shadeStep('series3', 4)).toBe('var(--theme-series-3-shade-3)')
  })

  it('マスタースコープでの上書きが効く（shadeStep が返す変数名は、実際の値の解決を CSS カスケードに委ねる）', () => {
    document.documentElement.style.setProperty('--theme-series-1-shade-1', '#111111')
    injectScopedCss('section[data-master="corp"] { --theme-series-1-shade-1: #222222; }')

    expect(shadeStep('series1', 1)).toBe('var(--theme-series-1-shade-1)')

    const scoped = document.createElement('section')
    scoped.setAttribute('data-master', 'corp')
    document.body.appendChild(scoped)

    expect(getComputedStyle(document.documentElement).getPropertyValue('--theme-series-1-shade-1').trim()).toBe('#111111')
    expect(getComputedStyle(scoped).getPropertyValue('--theme-series-1-shade-1').trim()).toBe('#222222')
  })

  it('章スコープ（data-section-accent）での上書きが効く', () => {
    document.documentElement.style.setProperty('--theme-series-1-shade-1', '#111111')
    injectScopedCss('section[data-section-accent="series3"] { --theme-series-1-shade-1: #333333; }')

    expect(shadeStep('series1', 1)).toBe('var(--theme-series-1-shade-1)')

    const scoped = document.createElement('section')
    scoped.setAttribute('data-section-accent', 'series3')
    document.body.appendChild(scoped)

    expect(getComputedStyle(scoped).getPropertyValue('--theme-series-1-shade-1').trim()).toBe('#333333')
  })
})
