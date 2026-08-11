import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { HierarchyDiagram } from '../HierarchyDiagram'
import { mockDiagramCanvasSize } from './testCanvasSize'

mockDiagramCanvasSize()

const THREE_LAYERS = [{ title: 'プレゼンテーション層', description: 'Web UI' }, { title: 'ビジネス層' }, { title: 'データ層', description: 'RDB' }]

describe('HierarchyDiagram', () => {
  it('層の数だけカードを描画する', () => {
    const { getByText } = render(<HierarchyDiagram layers={THREE_LAYERS} />)
    expect(getByText('プレゼンテーション層')).toBeTruthy()
    expect(getByText('ビジネス層')).toBeTruthy()
    expect(getByText('データ層')).toBeTruthy()
    expect(getByText('Web UI')).toBeTruthy()
  })

  it('隣接層の間に層数-1本のコネクタを描画する', () => {
    const { container } = render(<HierarchyDiagram layers={THREE_LAYERS} />)
    expect(container.querySelectorAll('polyline')).toHaveLength(2)
  })

  it('layers未指定・空配列では何も描画しない', () => {
    expect(render(<HierarchyDiagram />).container.firstChild).toBeNull()
    expect(render(<HierarchyDiagram layers={[]} />).container.firstChild).toBeNull()
  })

  it('layersが配列でなくても落ちない（不正なデッキでデッキ全体を落とさない）', () => {
    expect(render(<HierarchyDiagram layers={'broken' as never} />).container.firstChild).toBeNull()
  })
})
