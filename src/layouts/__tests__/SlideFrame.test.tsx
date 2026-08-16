import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SlideFrame } from '../SlideFrame'
import { buildSectionAccentCss } from '../../applyTheme'
import type { MasterRenderContext, SectionInfo, ThemeData } from '../../data'

// 5枚のデッキ: [0]表紙（章なし） [1][2]第1章 [3][4]第2章
const section1: SectionInfo = { title: '導入', number: 1, startIndex: 1, slideCount: 2 }
const section2: SectionInfo = { title: '設計', number: 2, startIndex: 3, slideCount: 2 }

function at(index: number, section?: SectionInfo): MasterRenderContext {
  return { index, total: 5, section, sections: [section1, section2] }
}

/** section 要素（.slide-container）を描画して返す */
function renderFrame(ctx: MasterRenderContext, theme?: ThemeData): HTMLElement {
  const { container } = render(
    <SlideFrame id="s1" layout="content" theme={theme} ctx={ctx}>
      <div>body</div>
    </SlideFrame>,
  )
  return container.querySelector('section.slide-container') as HTMLElement
}

describe('SlideFrame の章スコープ属性（#319）', () => {
  it('章に属するスライドには章番号と章色のカラートークン名を付ける', () => {
    const section = renderFrame(at(3, section2), { sectionAccents: ['primary', 'series3'] })

    expect(section.getAttribute('data-section-number')).toBe('2')
    expect(section.getAttribute('data-section-accent')).toBe('series3')
  })

  it('色数より章数が多い場合は先頭に戻って巡回する（resolveSectionAccent と同じ規則）', () => {
    const theme: ThemeData = { sectionAccents: ['series3'] }

    expect(renderFrame(at(1, section1), theme).getAttribute('data-section-accent')).toBe('series3')
    expect(renderFrame(at(3, section2), theme).getAttribute('data-section-accent')).toBe('series3')
  })

  it('章に属さないスライド（meta.section 未指定）にはどちらの属性も付けない', () => {
    const section = renderFrame(at(0), { sectionAccents: ['primary', 'series3'] })

    expect(section.hasAttribute('data-section-number')).toBe(false)
    expect(section.hasAttribute('data-section-accent')).toBe(false)
  })

  it('sectionAccents 未指定なら章色の属性を付けない（章番号だけを付ける）', () => {
    const section = renderFrame(at(1, section1))

    expect(section.getAttribute('data-section-number')).toBe('1')
    expect(section.hasAttribute('data-section-accent')).toBe(false)
  })

  it('buildSectionAccentCss が出力する章スコープのセレクタが描画された section に実際に一致する（属性と CSS の契約）', () => {
    const theme: ThemeData = { sectionAccents: ['primary', 'series3'] }
    const selectors = [...buildSectionAccentCss(theme.sectionAccents).matchAll(/^(section\[[^\]]+\])/gm)].map(([, selector]) => selector)

    // 章色は色数ぶん（章数ぶんではない）出力され、各章の section はそのうち自分の色の規則にだけ一致する
    expect(selectors).toEqual(['section[data-section-accent="primary"]', 'section[data-section-accent="series3"]'])
    expect(renderFrame(at(1, section1), theme).matches(selectors[0])).toBe(true)
    expect(renderFrame(at(3, section2), theme).matches(selectors[1])).toBe(true)
    expect(renderFrame(at(1, section1), theme).matches(selectors[1])).toBe(false)
  })
})
