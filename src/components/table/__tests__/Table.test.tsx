import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'
import { Table } from '../Table'
import type { TableSpec } from '../types'

const PLAN_COMPARISON: TableSpec = {
  columns: [
    { label: '項目', align: 'left', width: 2 },
    { label: 'Free', align: 'center' },
    { label: 'Pro', align: 'center' },
  ],
  rows: [
    ['価格', '0円', '1,200円/月'],
    ['ユーザー数', '1', '10'],
  ],
}

describe('Table', () => {
  it('ヘッダーと本文行を描画する', () => {
    const { getByTestId, getAllByRole } = render(<Table {...PLAN_COMPARISON} />)

    expect(getByTestId('table')).not.toBeNull()
    expect(getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['項目', 'Free', 'Pro'])
    expect(getAllByRole('row')).toHaveLength(3) // ヘッダー1行 + 本文2行
  })

  it('列ごとのalignがセルのtext-alignに反映される', () => {
    const { getAllByRole } = render(<Table {...PLAN_COMPARISON} />)
    const headers = getAllByRole('columnheader')

    expect(headers[0].style.textAlign).toBe('left')
    expect(headers[1].style.textAlign).toBe('center')
  })

  it('align省略時はleftになる', () => {
    const { getAllByRole } = render(<Table columns={[{ label: '項目' }]} rows={[['値']]} />)
    expect(getAllByRole('columnheader')[0].style.textAlign).toBe('left')
  })

  it('列幅の比率がcolのwidthに反映される（省略列は内容量が同じなら等分）', () => {
    const { container } = render(<Table columns={[{ label: 'a', width: 2 }, { label: 'b' }, { label: 'c' }]} rows={[]} />)
    const cols = container.querySelectorAll('col')

    expect(cols[0].style.width).toBe('50%')
    expect(cols[1].style.width).toBe('25%')
    expect(cols[2].style.width).toBe('25%')
  })

  it('width省略列は内容量（文字数）に応じた重みになる', () => {
    const { container } = render(
      <Table
        columns={[{ label: 'a' }, { label: 'b' }]}
        rows={[
          ['xxxxxxxxxx', 'y'],
          ['xxxxxxxxxx', 'y'],
        ]}
      />,
    )
    const cols = container.querySelectorAll('col')

    expect(parseFloat(cols[0].style.width)).toBeCloseTo(90.909, 2)
    expect(parseFloat(cols[1].style.width)).toBeCloseTo(9.091, 2)
  })

  it('width省略列と明示width列が混在する場合、明示列はそのまま比率に使われる', () => {
    const { container } = render(<Table columns={[{ label: 'a', width: 2 }, { label: 'b' }, { label: 'c' }]} rows={[['短', '短', 'ながいながいながい']]} />)
    const cols = container.querySelectorAll('col')

    // b・cの内容量の平均を1とみなして重みを算出する（b: 1文字→軽く, c: 9文字→重く）
    expect(parseFloat(cols[1].style.width)).toBeLessThan(parseFloat(cols[2].style.width))
  })

  it('行のセルが列数より少ない場合は空文字で埋める', () => {
    const { getAllByRole } = render(<Table columns={[{ label: 'a' }, { label: 'b' }]} rows={[['x']]} />)
    const cells = getAllByRole('cell')

    expect(cells.map((cell) => cell.textContent)).toEqual(['x', ''])
  })

  it('columnsが空の場合は描画せず警告する', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const { container } = render(<Table rows={[['x']]} />)

    expect(container.firstChild).toBeNull()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('rowsが配列でなくても落ちない（不正なデッキでデッキ全体を落とさない）', () => {
    const { getByTestId, getAllByRole } = render(<Table columns={[{ label: 'a' }]} rows={'broken' as never} />)

    expect(getByTestId('table')).not.toBeNull()
    expect(getAllByRole('row')).toHaveLength(1) // ヘッダーのみ
  })

  it.each([
    [3, 1, 'normal'],
    [7, 1, 'dense'],
    [11, 1, 'compact'],
    [1, 5, 'dense'],
    [1, 7, 'compact'],
  ] as const)('行数%i・列数%iのときdata-densityは%sになる', (rowCount, columnCount, expected) => {
    const columns = Array.from({ length: columnCount }, (_, i) => ({ label: `c${i}` }))
    const rows = Array.from({ length: rowCount }, () => Array.from({ length: columnCount }, () => 'x'))
    const { getByTestId } = render(<Table columns={columns} rows={rows} />)

    expect(getByTestId('table').dataset.density).toBe(expected)
  })
})
