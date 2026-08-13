import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Heatmap } from '../Heatmap'
import { mockDiagramCanvasSize } from '../../structureDiagram/__tests__/testCanvasSize'

mockDiagramCanvasSize()

const VALUES = [
  [10, 20, 30],
  [15, 25, 35],
]

describe('Heatmap', () => {
  it('rows/cols のラベルを描画する', () => {
    const { getByText } = render(<Heatmap rows={['A', 'B']} cols={['Q1', 'Q2', 'Q3']} values={VALUES} />)
    expect(getByText('A')).toBeTruthy()
    expect(getByText('B')).toBeTruthy()
    expect(getByText('Q1')).toBeTruthy()
    expect(getByText('Q3')).toBeTruthy()
  })

  it('値ラベルを既定で描画する（セル数が閾値内）', () => {
    const { container } = render(<Heatmap rows={['A', 'B']} cols={['Q1', 'Q2', 'Q3']} values={VALUES} />)
    expect(container.textContent).toContain('10')
    expect(container.textContent).toContain('35')
  })

  it('unit を数値の後ろに連結する', () => {
    const { container } = render(<Heatmap rows={['A']} cols={['Q1']} values={[[42]]} unit="%" />)
    expect(container.textContent).toContain('42%')
  })

  it('valueLabels: false で値ラベルを消せる', () => {
    const { container } = render(<Heatmap rows={['A']} cols={['Q1']} values={[[42]]} valueLabels={false} />)
    expect(container.textContent).not.toContain('42')
  })

  it('セル背景に shadeSeries の rgba を使う（濃淡ヘルパー経由）', () => {
    const { container } = render(<Heatmap rows={['A']} cols={['Q1', 'Q2']} values={[[0, 100]]} color="series1" />)
    // 濃淡ヘルパーは rgba(var(--theme-series-N-rgb), α) 形式で色を作る（4図式で複製しない集約先）
    const cells = Array.from(container.querySelectorAll('div')).filter((el) => el.style.backgroundColor && el.style.backgroundColor.startsWith('rgba(var'))
    expect(cells.length).toBeGreaterThanOrEqual(2)
    expect(cells[0].style.backgroundColor).toContain('--theme-series-1-rgb')
  })

  it('rows/cols/values いずれも未指定の場合は何も描画しない', () => {
    expect(render(<Heatmap />).container.firstChild).toBeNull()
  })

  it('rows/cols と values の要素数が揃わなくても落ちない（余った分は空セル）', () => {
    const { container } = render(<Heatmap rows={['A', 'B', 'C']} cols={['Q1', 'Q2']} values={[[10]]} />)
    expect(container.textContent).toContain('C')
    expect(container.textContent).toContain('Q2')
  })

  it('8×8 を超えるセル数では値ラベルを既定で省く（自動縮退）', () => {
    const rows = Array.from({ length: 9 }, (_, i) => `R${i}`)
    const cols = Array.from({ length: 9 }, (_, i) => `C${i}`)
    const values = Array.from({ length: 9 }, () => Array.from({ length: 9 }, (_, j) => j + 1))
    const { container } = render(<Heatmap rows={rows} cols={cols} values={values} />)
    // セル数 81 個・値 1〜9 が繰り返し登場する状況で、数値ラベルが描画されないことを確認する
    // （行見出しの "R0"〜"R8" は残るが、セルの数値ラベルは省かれる）
    const valueSpans = container.querySelectorAll('.value, [class*="value"]')
    expect(valueSpans.length).toBe(0)
  })
})
