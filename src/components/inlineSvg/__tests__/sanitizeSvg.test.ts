import { describe, expect, it } from 'vitest'
import { sanitizeSvgMarkup } from '../sanitizeSvg'

describe('sanitizeSvgMarkup', () => {
  it('無害なSVGはそのまま（除去なし）で通す', () => {
    const result = sanitizeSvgMarkup('<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="currentColor" /></svg>')
    expect(result).not.toBeNull()
    expect(result!.removed).toEqual([])
    expect(result!.html).toContain('rect')
    expect(result!.html).toContain('fill="currentColor"')
  })

  it.each([undefined, null, 123, '', '   '])('文字列以外・空文字はnullを返す（%s）', (markup) => {
    expect(sanitizeSvgMarkup(markup)).toBeNull()
  })

  it('解析不能なマークアップはnullを返す', () => {
    expect(sanitizeSvgMarkup('<svg><rect></svg')).toBeNull()
  })

  it('ルートがsvgでない場合はnullを返す', () => {
    expect(sanitizeSvgMarkup('<div>not svg</div>')).toBeNull()
  })

  it('script要素を除去する', () => {
    const result = sanitizeSvgMarkup('<svg viewBox="0 0 10 10"><script>alert(1)</script><rect width="10" height="10" /></svg>')
    expect(result!.html).not.toContain('script')
    expect(result!.removed).toContain('script要素')
  })

  it('foreignObject要素を除去する', () => {
    const result = sanitizeSvgMarkup('<svg viewBox="0 0 10 10"><foreignObject><div>html</div></foreignObject></svg>')
    expect(result!.html.toLowerCase()).not.toContain('foreignobject')
    expect(result!.removed).toContain('foreignObject要素')
  })

  it('image要素を除去する', () => {
    const result = sanitizeSvgMarkup('<svg viewBox="0 0 10 10"><image href="https://example.com/a.png" /></svg>')
    expect(result!.html).not.toContain('image')
    expect(result!.removed).toContain('image要素')
  })

  it('イベントハンドラ属性(on*)を除去する', () => {
    const result = sanitizeSvgMarkup('<svg viewBox="0 0 10 10"><rect width="10" height="10" onclick="alert(1)" /></svg>')
    expect(result!.html).not.toContain('onclick')
    expect(result!.removed).toContain('イベントハンドラ属性(on*)')
  })

  it('外部を指すhref/xlink:hrefを除去する', () => {
    const result = sanitizeSvgMarkup('<svg viewBox="0 0 10 10" xmlns:xlink="http://www.w3.org/1999/xlink"><use href="https://example.com/x.svg#a" /><use xlink:href="//example.com/y.svg#b" /></svg>')
    expect(result!.html).not.toContain('href="https://example.com')
    expect(result!.html).not.toContain('example.com/y.svg')
    expect(result!.removed).toContain('外部参照(href/xlink:href)')
  })

  it('内部参照（#始まり）のhrefは残す（<use>によるプリミティブ再利用を壊さない）', () => {
    const result = sanitizeSvgMarkup('<svg viewBox="0 0 10 10"><defs><rect id="r" width="10" height="10" /></defs><use href="#r" /></svg>')
    expect(result!.html).toContain('href="#r"')
    expect(result!.removed).toEqual([])
  })

  it('var(--theme-*)を参照するfill属性はそのまま残す（テーマ追従・#203）', () => {
    const result = sanitizeSvgMarkup('<svg viewBox="0 0 10 10"><rect width="10" height="10" fill="var(--theme-primary)" /></svg>')
    expect(result!.html).toContain('var(--theme-primary)')
  })
})
