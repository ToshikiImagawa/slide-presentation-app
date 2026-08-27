import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { SlideFrame } from '../SlideFrame'
import { buildSectionAccentCss } from '../../applyTheme'
import type { ConfidentialConfig, LogoConfig, MasterRenderContext, SectionInfo, SlideMeta, ThemeData } from '../../data'

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

/** logo 付きの section を描画して返す（#350: meta.logo → LogoMasterDecoration 合成の検証用）。
 * meta は slides[].meta.logo（スライド個別上書き・#393）の検証用 */
function renderFrameWithLogo(logo: LogoConfig, ctx: MasterRenderContext = at(0), theme?: ThemeData, meta?: SlideMeta): HTMLElement {
  const { container } = render(
    <SlideFrame id="s1" layout="content" logo={logo} theme={theme} meta={meta} ctx={ctx}>
      <div>body</div>
    </SlideFrame>,
  )
  return container.querySelector('section.slide-container') as HTMLElement
}

/** confidential 付きの section を描画して返す（#394: meta.confidential → TextMasterDecoration 合成の検証用）。
 * meta は slides[].meta.confidential（スライド個別上書き・#393）の検証用 */
function renderFrameWithConfidential(confidential: ConfidentialConfig, ctx: MasterRenderContext = at(0), theme?: ThemeData, meta?: SlideMeta): HTMLElement {
  const { container } = render(
    <SlideFrame id="s1" layout="content" confidential={confidential} theme={theme} meta={meta} ctx={ctx}>
      <div>body</div>
    </SlideFrame>,
  )
  return container.querySelector('section.slide-container') as HTMLElement
}

describe('meta.confidential の TextMasterDecoration への合成（#394）', () => {
  it('confidential未指定時は前面レイヤーに何も描画しない', () => {
    const section = renderFrame(at(0))
    expect(section.querySelector('.master-layer-front')?.innerHTML).toBe('')
  })

  it('anchor/offset未指定時は既定でtop-right（bottom:0/left:0 + translate(-30px,20px)相当）に描画される（meta.logoの既定位置bottom-leftと重ならないようにするため）', () => {
    const section = renderFrameWithConfidential({ text: 'Confidential' })
    const textEl = section.querySelector('.master-layer-front .master-decoration-text') as HTMLElement
    expect(textEl.style.top).toBe('0px')
    expect(textEl.style.right).toBe('0px')
    expect(textEl.style.transform).toBe('translate(0%, 0%) translate(-30px, 20px)')
    expect(textEl.textContent).toBe('Confidential')
  })

  it('anchor/opacity/rotateを指定すると斜め・半透明の透かし表現になる', () => {
    const section = renderFrameWithConfidential({ text: 'Confidential', anchor: 'middle-center', offset: { x: 0, y: 0 }, opacity: 0.15, rotate: -30 })
    const textEl = section.querySelector('.master-layer-front .master-decoration-text') as HTMLElement
    expect(textEl.style.top).toBe('50%')
    expect(textEl.style.left).toBe('50%')
    expect(textEl.style.opacity).toBe('0.15')
    expect(textEl.style.transform).toBe('translate(-50%, -50%) translate(0px, 0px) rotate(-30deg)')
  })

  it('onlyで特定スライドから除外できる', () => {
    const excluded = renderFrameWithConfidential({ text: 'Confidential', only: 'not-first' }, at(0))
    expect(excluded.querySelector('.master-layer-front .master-decoration-text')).toBeNull()

    const included = renderFrameWithConfidential({ text: 'Confidential', only: 'not-first' }, at(1, section1))
    expect(included.querySelector('.master-layer-front .master-decoration-text')).not.toBeNull()
  })

  it('meta.logoとmeta.confidentialの両方を指定した場合に両方描画される', () => {
    const section = render(
      <SlideFrame id="s1" layout="content" logo={{ src: '/meta-logo.png' }} confidential={{ text: 'Confidential' }} ctx={at(0)}>
        <div>body</div>
      </SlideFrame>,
    ).container.querySelector('section.slide-container') as HTMLElement
    expect(section.querySelector('.master-layer-front img')).not.toBeNull()
    expect(section.querySelector('.master-layer-front .master-decoration-text')?.textContent).toBe('Confidential')
  })
})

describe('meta.logo の LogoMasterDecoration への合成（#350）', () => {
  it('logo未指定時は前面レイヤーに何も描画しない', () => {
    const section = renderFrame(at(0))
    expect(section.querySelector('.master-layer-front')?.innerHTML).toBe('')
  })

  it('anchor/offset未指定時は現行と同一の位置（bottom:0/left:0 + translate(30px,-20px)相当）に描画される', () => {
    const section = renderFrameWithLogo({ src: '/logo.png' })
    const logoEl = section.querySelector('.master-layer-front > div') as HTMLElement
    expect(logoEl.style.bottom).toBe('0px')
    expect(logoEl.style.left).toBe('0px')
    expect(logoEl.style.transform).toBe('translate(0%, 0%) translate(30px, -20px)')
  })

  it('width/height未指定時の既定値は120/40（現行と同一）', () => {
    const section = renderFrameWithLogo({ src: '/logo.png' })
    const img = section.querySelector('.master-layer-front img') as HTMLImageElement
    expect(img.style.width).toBe('120px')
    expect(img.style.height).toBe('40px')
  })

  it('anchorを指定すると位置が変わる', () => {
    const section = renderFrameWithLogo({ src: '/logo.png', anchor: 'top-right', offset: { x: 5, y: 5 } })
    const logoEl = section.querySelector('.master-layer-front > div') as HTMLElement
    expect(logoEl.style.top).toBe('0px')
    expect(logoEl.style.right).toBe('0px')
    expect(logoEl.style.transform).toBe('translate(0%, 0%) translate(5px, 5px)')
  })

  it('onlyで特定スライドから除外できる（本文領域全体を使うコンポーネントと重なるスライドを除外する用途）', () => {
    const excluded = renderFrameWithLogo({ src: '/logo.png', only: 'not-first' }, at(0))
    expect(excluded.querySelector('.master-layer-front img')).toBeNull()

    const included = renderFrameWithLogo({ src: '/logo.png', only: 'not-first' }, at(1, section1))
    expect(included.querySelector('.master-layer-front img')).not.toBeNull()
  })

  it('マスター装飾のlogoとmeta.logoの両方を指定した場合に両方描画される', () => {
    const theme: ThemeData = {
      masters: { standard: { decorations: [{ type: 'logo', anchor: 'top-left', src: '/brand.png', layer: 'front' }] } },
      masterMap: { content: 'standard' },
    }
    const section = renderFrameWithLogo({ src: '/meta-logo.png' }, at(0), theme)
    const imgs = [...section.querySelectorAll('.master-layer-front img')] as HTMLImageElement[]
    expect(imgs.map((img) => img.getAttribute('data-src'))).toEqual(['/brand.png', '/meta-logo.png'])
  })
})

describe('slides[].meta.logo / meta.confidential によるスライド個別上書き（#393）', () => {
  it('override 未指定のスライドは meta.logo と完全同一の見た目になる', () => {
    const withEmptyMeta = renderFrameWithLogo({ src: '/logo.png' }, at(0), undefined, {})
    const without = renderFrameWithLogo({ src: '/logo.png' })
    expect(withEmptyMeta.querySelector('.master-layer-front')?.innerHTML).toBe(without.querySelector('.master-layer-front')?.innerHTML)
  })

  it('meta.logo.hidden: true を指定したスライドだけロゴを非表示にできる', () => {
    const section = renderFrameWithLogo({ src: '/logo.png' }, at(0), undefined, { logo: { hidden: true } })
    expect(section.querySelector('.master-layer-front img')).toBeNull()
  })

  it('meta.logo.anchor/offset を指定したスライドだけロゴの配置を上書きできる', () => {
    const section = renderFrameWithLogo({ src: '/logo.png', anchor: 'bottom-left' }, at(0), undefined, { logo: { anchor: 'top-right', offset: { x: 5, y: 5 } } })
    const logoEl = section.querySelector('.master-layer-front > div') as HTMLElement
    expect(logoEl.style.top).toBe('0px')
    expect(logoEl.style.right).toBe('0px')
    expect(logoEl.style.transform).toBe('translate(0%, 0%) translate(5px, 5px)')
    const img = section.querySelector('.master-layer-front img') as HTMLImageElement
    expect(img.getAttribute('data-src')).toBe('/logo.png')
  })

  it('meta.confidential.hidden: true を指定したスライドだけ透かしを非表示にできる', () => {
    const section = renderFrameWithConfidential({ text: 'Confidential' }, at(0), undefined, { confidential: { hidden: true } })
    expect(section.querySelector('.master-layer-front .master-decoration-text')).toBeNull()
  })

  it('meta.confidential.content/anchor を指定したスライドだけ透かしの内容・配置を上書きできる', () => {
    const section = renderFrameWithConfidential({ text: 'Confidential' }, at(0), undefined, { confidential: { text: 'Draft', anchor: 'middle-center' } })
    const textEl = section.querySelector('.master-layer-front .master-decoration-text') as HTMLElement
    expect(textEl.textContent).toBe('Draft')
    expect(textEl.style.top).toBe('50%')
    expect(textEl.style.left).toBe('50%')
  })
})

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
