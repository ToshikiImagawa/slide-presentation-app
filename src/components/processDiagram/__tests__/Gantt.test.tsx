import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Gantt } from '../Gantt'
import { mockDiagramCanvasSize } from '../../structureDiagram/__tests__/testCanvasSize'

mockDiagramCanvasSize()

const AXIS = ['1月', '2月', '3月', '4月']
const TASKS = [
  { label: '設計', startCol: 0, span: 1 },
  { label: '実装', startCol: 1, span: 2 },
  { label: 'テスト', startCol: 2, span: 1 },
  { label: 'リリース', startCol: 3, span: 1 },
]

describe('Gantt', () => {
  it('全工程のラベルと軸見出しを描画する', () => {
    const { getByText } = render(<Gantt axis={AXIS} tasks={TASKS} />)
    expect(getByText('設計')).toBeTruthy()
    expect(getByText('実装')).toBeTruthy()
    expect(getByText('テスト')).toBeTruthy()
    expect(getByText('リリース')).toBeTruthy()
    expect(getByText('1月')).toBeTruthy()
    expect(getByText('4月')).toBeTruthy()
  })

  it('タスク数だけ期間バー（filled variantのカード）を描画する', () => {
    const { container } = render(<Gantt axis={AXIS} tasks={TASKS} />)
    // filled variantはDiagramCard.module.cssのfilledクラスを持つ
    expect(container.querySelectorAll('[class*="filled"]')).toHaveLength(TASKS.length)
  })

  it('spanが2の工程は隣接列より広いバーになる', () => {
    const { container } = render(<Gantt axis={AXIS} tasks={TASKS} />)
    const bars = Array.from(container.querySelectorAll('[class*="filled"]')) as HTMLElement[]
    const width = (el: HTMLElement) => parseFloat(el.style.width)
    // 実装（span:2）は設計（span:1）より広い
    expect(width(bars[1])).toBeGreaterThan(width(bars[0]))
  })

  it('axis未指定でも見出しなしで描画する（列数はtasksのstartCol/spanから導出）', () => {
    const { getByText, queryByText } = render(<Gantt tasks={TASKS} />)
    expect(getByText('設計')).toBeTruthy()
    expect(queryByText('1月')).toBeNull()
  })

  it('startColを持たないタスクは除外する（不正なデッキでデッキ全体を落とさない）', () => {
    const { getByText, queryByText } = render(<Gantt tasks={[{ label: 'startColなし' } as never, { label: '正常', startCol: 0 }]} />)
    expect(queryByText('startColなし')).toBeNull()
    expect(getByText('正常')).toBeTruthy()
  })

  it('tasks未指定・空配列では何も描画しない', () => {
    expect(render(<Gantt />).container.firstChild).toBeNull()
    expect(render(<Gantt tasks={[]} />).container.firstChild).toBeNull()
  })
})
