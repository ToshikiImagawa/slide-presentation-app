import { describe, it, expect, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { SlideMasterLayer } from '../SlideMasterLayer'
import { clearRegistry, registerDefaultComponent } from '../../components/ComponentRegistry'
import type { MasterDecoration, MasterRenderContext } from '../../data'

const ctx: MasterRenderContext = { index: 0, total: 1 }

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
})
