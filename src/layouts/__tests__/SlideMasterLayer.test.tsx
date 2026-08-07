import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { SlideMasterBackground, SlideMasterLayer } from '../SlideMasterLayer'
import { clearRegistry, registerDefaultComponent } from '../../components/ComponentRegistry'
import type { MasterBackground, MasterDecoration, MasterDecorationOnly, MasterRenderContext, SectionInfo } from '../../data'

const ctx: MasterRenderContext = { index: 0, total: 1 }

/** only 条件だけを変えた text 装飾を描画し、その装飾が出たかどうかを返す */
function isVisible(only: MasterDecorationOnly, renderCtx: MasterRenderContext): boolean {
  const decorations: MasterDecoration[] = [{ type: 'text', anchor: 'bottom-right', content: 'shown', only }]
  const { container } = render(<SlideMasterLayer decorations={decorations} layer="back" ctx={renderCtx} />)
  return container.textContent === 'shown'
}

describe('SlideMasterLayer', () => {
  beforeEach(() => {
    clearRegistry()
  })

  it('未登録コンポーネントを参照する component 装飾は描画しない（Fallback落ち防止）', () => {
    const decorations: MasterDecoration[] = [{ type: 'component', anchor: 'top-left', name: 'Unregistered' }]
    const { container } = render(<SlideMasterLayer decorations={decorations} layer="back" ctx={ctx} />)
    expect(container.textContent).toBe('')
    expect(container.querySelector('div')).toBeNull()
  })

  it('登録済みコンポーネントを参照する component 装飾は描画する', () => {
    registerDefaultComponent('Registered', () => <span>rendered</span>)
    const decorations: MasterDecoration[] = [{ type: 'component', anchor: 'top-left', name: 'Registered' }]
    const { container } = render(<SlideMasterLayer decorations={decorations} layer="back" ctx={ctx} />)
    expect(container.textContent).toBe('rendered')
  })

  it('未登録コンポーネントが混在しても他の装飾は描画される', () => {
    const decorations: MasterDecoration[] = [
      { type: 'component', anchor: 'top-left', name: 'Unregistered' },
      { type: 'text', anchor: 'bottom-right', content: 'page' },
    ]
    const { container } = render(<SlideMasterLayer decorations={decorations} layer="back" ctx={ctx} />)
    expect(container.textContent).toBe('page')
  })

  // #191: only の語彙拡張（middle / section-first / not-section-first）
  describe('only の絞り込み条件', () => {
    // 5枚のデッキ: [0]表紙（章なし） [1][2]第1章 [3][4]第2章
    const section1: SectionInfo = { title: '導入', number: 1, startIndex: 1, slideCount: 2 }
    const section2: SectionInfo = { title: '設計', number: 2, startIndex: 3, slideCount: 2 }
    const at = (index: number, section?: SectionInfo): MasterRenderContext => ({ index, total: 5, section })

    it('middle は最初と最後以外に描画する（表紙と締めを除く）', () => {
      expect(isVisible('middle', at(0))).toBe(false)
      expect(isVisible('middle', at(2, section1))).toBe(true)
      expect(isVisible('middle', at(4, section2))).toBe(false)
    })

    it('section-first は各章の先頭スライド（章扉）だけに描画する', () => {
      expect(isVisible('section-first', at(1, section1))).toBe(true)
      expect(isVisible('section-first', at(2, section1))).toBe(false)
      expect(isVisible('section-first', at(3, section2))).toBe(true)
    })

    it('section-first は章に属さないスライドには描画しない', () => {
      expect(isVisible('section-first', at(0))).toBe(false)
    })

    it('not-section-first は章の先頭以外に描画する（章に属さないスライドも含む）', () => {
      expect(isVisible('not-section-first', at(1, section1))).toBe(false)
      expect(isVisible('not-section-first', at(2, section1))).toBe(true)
      expect(isVisible('not-section-first', at(0))).toBe(true)
    })
  })

  // #189: 装飾共通の opacity / rotate（透かし・斜め帯を6種のまま表現する）
  describe('装飾共通の opacity / rotate', () => {
    const styleOf = (decoration: MasterDecoration): CSSStyleDeclaration => {
      const { container } = render(<SlideMasterLayer decorations={[decoration]} layer="back" ctx={ctx} />)
      return (container.firstElementChild as HTMLElement).style
    }

    it('opacity を指定すると透かしとして薄く描画する', () => {
      expect(styleOf({ type: 'text', anchor: 'middle-center', content: 'CONFIDENTIAL', opacity: 0.08 }).opacity).toBe('0.08')
    })

    it('opacity 未指定なら opacity を出力しない（現行と完全同一のスタイル）', () => {
      expect(styleOf({ type: 'text', anchor: 'middle-center', content: 'plain' }).opacity).toBe('')
    })

    it('rotate はアンカーの translate の後段に付き、位置を保ったまま要素を回す', () => {
      expect(styleOf({ type: 'text', anchor: 'middle-center', content: 'CONFIDENTIAL', rotate: -30 }).transform).toBe('translate(-50%, -50%) translate(0px, 0px) rotate(-30deg)')
    })

    it('rotate 未指定・0 では transform に rotate を付けない', () => {
      expect(styleOf({ type: 'band', anchor: 'top-center', rotate: 0 }).transform).toBe('translate(0%, 0%) translate(0px, 0px)')
    })
  })

  // #189: 帯のグラデーション（shape 装飾を増やさずに斜め帯・グラデーション帯を表現する）
  // 色は jsdom が rgb() に正規化するため、期待値も正規化後の表記で書く
  describe('band のグラデーション', () => {
    const bandStyle = (decoration: MasterDecoration): CSSStyleDeclaration => {
      const { container } = render(<SlideMasterLayer decorations={[decoration]} layer="back" ctx={ctx} />)
      return (container.firstElementChild as HTMLElement).style
    }

    it('gradient 指定時は backgroundImage で塗る', () => {
      const style = bandStyle({ type: 'band', anchor: 'bottom-center', gradient: { from: '#000', to: '#fff', angle: 90 } })
      expect(style.backgroundImage).toBe('linear-gradient(90deg, rgb(0, 0, 0), rgb(255, 255, 255))')
      expect(style.backgroundColor).toBe('')
    })

    it('angle 省略時は 180deg（上→下）', () => {
      expect(bandStyle({ type: 'band', anchor: 'bottom-center', gradient: { from: '#000', to: '#fff' } }).backgroundImage).toBe('linear-gradient(180deg, rgb(0, 0, 0), rgb(255, 255, 255))')
    })

    it('gradient 未指定時は既存どおり color で塗る', () => {
      const style = bandStyle({ type: 'band', anchor: 'top-center' })
      expect(style.backgroundColor).toBe('var(--theme-primary)')
      expect(style.backgroundImage).toBe('')
    })
  })
})

// #189: マスター背景意匠。背景を持たないマスターでは SlideFrame がこの要素自体を描かない
describe('SlideMasterBackground', () => {
  const backgroundEl = (background: MasterBackground): HTMLElement => {
    const { container } = render(<SlideMasterBackground background={background} />)
    return container.firstElementChild as HTMLElement
  }

  it('plain はテーマ背景色の無地で塗る（デッキ既定の格子を隠す）', () => {
    const el = backgroundEl({ type: 'plain' })
    expect(el.className).toBe('master-background')
    expect(el.style.backgroundColor).toBe('var(--theme-background)')
    expect(el.style.backgroundImage).toBe('')
  })

  it('grid は global.css の格子意匠クラスを付け、下地はテーマ背景色にする', () => {
    const el = backgroundEl({ type: 'grid' })
    expect(el.className).toBe('master-background master-background-grid')
    expect(el.style.backgroundColor).toBe('var(--theme-background)')
    expect(el.style.getPropertyValue('--theme-background-grid-size')).toBe('')
  })

  it('grid の size は格子の密度をCSS変数の上書きで変える', () => {
    expect(backgroundEl({ type: 'grid', size: 24 }).style.getPropertyValue('--theme-background-grid-size')).toBe('24px')
  })

  it('fill は指定色で全面を塗る', () => {
    expect(backgroundEl({ type: 'fill', color: 'var(--theme-primary)' }).style.backgroundColor).toBe('var(--theme-primary)')
  })

  it('gradient は from→to の線形グラデーションで塗る（色は jsdom が rgb() に正規化する）', () => {
    expect(backgroundEl({ type: 'gradient', from: '#123456', to: '#654321', angle: 135 }).style.backgroundImage).toBe('linear-gradient(135deg, rgb(18, 52, 86), rgb(101, 67, 33))')
  })

  it('image は既定 cover で全面に敷く', () => {
    const style = backgroundEl({ type: 'image', src: 'image/bg.png' }).style
    expect(style.backgroundImage).toBe('url("image/bg.png")')
    expect(style.backgroundSize).toBe('cover')
  })

  it('image の fit で contain にできる', () => {
    expect(backgroundEl({ type: 'image', src: 'image/bg.png', fit: 'contain' }).style.backgroundSize).toBe('contain')
  })

  it('opacity を指定すると背景全体を薄くする（デッキ既定の背景が透ける）', () => {
    expect(backgroundEl({ type: 'fill', color: '#000', opacity: 0.2 }).style.opacity).toBe('0.2')
  })
})
