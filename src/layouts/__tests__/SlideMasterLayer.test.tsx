import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { SlideMasterLayer } from '../SlideMasterLayer'
import { clearRegistry, registerDefaultComponent } from '../../components/ComponentRegistry'
import type { MasterDecoration, MasterDecorationOnly, MasterRenderContext, SectionInfo } from '../../data'

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
})
