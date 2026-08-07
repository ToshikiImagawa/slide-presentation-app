import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { SlideMasterLayer } from '../SlideMasterLayer'
import { clearRegistry, registerDefaultComponent } from '../../components/ComponentRegistry'
import type { MasterBackground, MasterDecoration, MasterDecorationOnly, MasterRenderContext, SectionInfo } from '../../data'

const ctx: MasterRenderContext = { index: 0, total: 1 }

/** back レイヤーを描画する（master は decorations / background だけを与えれば足りる） */
function renderBackLayer(master: { decorations?: MasterDecoration[]; background?: MasterBackground }, renderCtx: MasterRenderContext = ctx): HTMLElement {
  const { container } = render(<SlideMasterLayer master={{ masterKey: 'standard', decorations: master.decorations ?? [], background: master.background }} layer="back" ctx={renderCtx} />)
  return container
}

/** only 条件だけを変えた text 装飾を描画し、その装飾が出たかどうかを返す */
function isVisible(only: MasterDecorationOnly, renderCtx: MasterRenderContext): boolean {
  return renderBackLayer({ decorations: [{ type: 'text', anchor: 'bottom-right', content: 'shown', only }] }, renderCtx).textContent === 'shown'
}

/** 装飾1件を描画してそのルート要素の style を返す */
function styleOf(decoration: MasterDecoration): CSSStyleDeclaration {
  return (renderBackLayer({ decorations: [decoration] }).firstElementChild as HTMLElement).style
}

describe('SlideMasterLayer', () => {
  beforeEach(() => {
    clearRegistry()
  })

  it('master が未解決なら何も描画しない（現行と完全同一のDOM）', () => {
    const { container } = render(<SlideMasterLayer master={undefined} layer="back" ctx={ctx} />)
    expect(container.innerHTML).toBe('')
  })

  it('未登録コンポーネントを参照する component 装飾は描画しない（Fallback落ち防止）', () => {
    const container = renderBackLayer({ decorations: [{ type: 'component', anchor: 'top-left', name: 'Unregistered' }] })
    expect(container.textContent).toBe('')
    expect(container.querySelector('div')).toBeNull()
  })

  it('登録済みコンポーネントを参照する component 装飾は描画する', () => {
    registerDefaultComponent('Registered', () => <span>rendered</span>)
    expect(renderBackLayer({ decorations: [{ type: 'component', anchor: 'top-left', name: 'Registered' }] }).textContent).toBe('rendered')
  })

  it('未登録コンポーネントが混在しても他の装飾は描画される', () => {
    const decorations: MasterDecoration[] = [
      { type: 'component', anchor: 'top-left', name: 'Unregistered' },
      { type: 'text', anchor: 'bottom-right', content: 'page' },
    ]
    expect(renderBackLayer({ decorations }).textContent).toBe('page')
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

  // #189: 装飾共通の opacity / rotate（透かし・回転を6種のまま表現する）
  describe('装飾共通の opacity / rotate', () => {
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

  // #189: 帯のグラデーション（shape 装飾を増やさずにグラデーション帯を表現する）
  // 色は jsdom が rgb() に正規化するため、期待値も正規化後の表記で書く
  describe('band のグラデーション', () => {
    it('gradient 指定時は backgroundImage で塗る', () => {
      const style = styleOf({ type: 'band', anchor: 'bottom-center', gradient: { from: '#000', to: '#fff', angle: 90 } })
      expect(style.backgroundImage).toBe('linear-gradient(90deg, rgb(0, 0, 0), rgb(255, 255, 255))')
      expect(style.backgroundColor).toBe('')
    })

    it('angle 省略時は 180deg（上→下）', () => {
      expect(styleOf({ type: 'band', anchor: 'bottom-center', gradient: { from: '#000', to: '#fff' } }).backgroundImage).toBe('linear-gradient(180deg, rgb(0, 0, 0), rgb(255, 255, 255))')
    })

    it('gradient 未指定時は既存どおり color で塗る', () => {
      const style = styleOf({ type: 'band', anchor: 'top-center' })
      expect(style.backgroundColor).toBe('var(--theme-primary)')
      expect(style.backgroundImage).toBe('')
    })
  })
})

// #189: マスター背景意匠（back レイヤーの最背面に敷かれる）
describe('マスター背景', () => {
  const backgroundEl = (background: MasterBackground): HTMLElement => renderBackLayer({ background }).querySelector('.master-background') as HTMLElement

  it('background を持たないマスターでは背景要素を描かない（現行と完全同一のDOM）', () => {
    expect(renderBackLayer({ decorations: [{ type: 'band', anchor: 'top-center' }] }).querySelector('.master-background')).toBeNull()
  })

  it('front レイヤーには背景を描かない（背景は back の最背面だけ）', () => {
    const { container } = render(<SlideMasterLayer master={{ masterKey: 'standard', decorations: [], background: { type: 'plain' } }} layer="front" ctx={ctx} />)
    expect(container.querySelector('.master-background')).toBeNull()
  })

  it('背景は同じレイヤーの装飾より背面（先頭の子）に描く', () => {
    const container = renderBackLayer({ background: { type: 'plain' }, decorations: [{ type: 'band', anchor: 'top-center' }] })
    expect(container.children.length).toBe(2)
    expect(container.children[0].className).toBe('master-background')
  })

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
