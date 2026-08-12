import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Flowchart } from '../Flowchart'
import { mockDiagramCanvasSize } from '../../structureDiagram/__tests__/testCanvasSize'

mockDiagramCanvasSize()

const NODES = [
  { id: 'start', label: '申請', shape: 'start' as const, row: 0, col: 1 },
  { id: 'check', label: '承認する?', shape: 'decision' as const, row: 1, col: 1 },
  { id: 'approve', label: '承認処理', shape: 'process' as const, row: 2, col: 0 },
  { id: 'reject', label: '却下通知', shape: 'process' as const, row: 2, col: 2 },
  { id: 'end', label: '完了', shape: 'end' as const, row: 3, col: 1 },
]
const EDGES = [
  { from: 'start', to: 'check' },
  { from: 'check', to: 'approve', label: 'Yes' },
  { from: 'check', to: 'reject', label: 'No' },
  { from: 'approve', to: 'end' },
  { from: 'reject', to: 'end' },
]

describe('Flowchart', () => {
  it('全ノードのラベルを描画する', () => {
    const { getByText } = render(<Flowchart nodes={NODES} edges={EDGES} />)
    expect(getByText('申請')).toBeTruthy()
    expect(getByText('承認する?')).toBeTruthy()
    expect(getByText('承認処理')).toBeTruthy()
    expect(getByText('却下通知')).toBeTruthy()
    expect(getByText('完了')).toBeTruthy()
  })

  it('分岐（1つのfromから複数のto）・合流（複数のfromが1つのtoへ）を含むedgesの本数だけ接続線を描画する', () => {
    const { container } = render(<Flowchart nodes={NODES} edges={EDGES} />)
    expect(container.querySelectorAll('polyline')).toHaveLength(5)
  })

  it('shapeがstart/endはピル形、decisionはひし形のクラスを持つ', () => {
    const { container } = render(<Flowchart nodes={NODES} edges={EDGES} />)
    expect(container.querySelectorAll('[class*="pill"]')).toHaveLength(2)
    expect(container.querySelectorAll('[class*="diamond"]')).toHaveLength(1)
  })

  it('shape省略（process相当）はpill/diamondのクラスを持たない', () => {
    const { container } = render(<Flowchart nodes={[{ id: 'a', label: 'A' }]} />)
    expect(container.querySelector('[class*="pill"]')).toBeNull()
    expect(container.querySelector('[class*="diamond"]')).toBeNull()
  })

  it('idを持たないノードは除外する（不正なデッキでデッキ全体を落とさない）', () => {
    const { getByText, queryByText } = render(<Flowchart nodes={[{ label: 'idなし' } as never, { id: 'ok', label: '正常' }]} />)
    expect(queryByText('idなし')).toBeNull()
    expect(getByText('正常')).toBeTruthy()
  })

  it('nodes未指定・空配列では何も描画しない', () => {
    expect(render(<Flowchart />).container.firstChild).toBeNull()
    expect(render(<Flowchart nodes={[]} />).container.firstChild).toBeNull()
  })

  it('colが負値でも例外にならず描画を続ける（#276）', () => {
    const nodes = [{ id: 'bad', label: '負値', col: -1, row: 0 }]
    const { getByText } = render(<Flowchart nodes={nodes} />)
    expect(getByText('負値')).toBeTruthy()
  })
})
