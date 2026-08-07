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

  it('列幅の比率がcolのwidthに反映される（省略列は1として等分）', () => {
    const { container } = render(<Table columns={[{ label: 'a', width: 2 }, { label: 'b' }, { label: 'c' }]} rows={[]} />)
    const cols = container.querySelectorAll('col')

    expect(cols[0].style.width).toBe('50%')
    expect(cols[1].style.width).toBe('25%')
    expect(cols[2].style.width).toBe('25%')
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

  it('行数が多いとdata-densityがdense/compactへ段階的に切り替わる', () => {
    const columns = [{ label: 'a' }]
    const normal = render(<Table columns={columns} rows={Array.from({ length: 3 }, () => ['x'])} />)
    expect(normal.getByTestId('table').dataset.density).toBe('normal')
    normal.unmount()

    const dense = render(<Table columns={columns} rows={Array.from({ length: 7 }, () => ['x'])} />)
    expect(dense.getByTestId('table').dataset.density).toBe('dense')
    dense.unmount()

    const compact = render(<Table columns={columns} rows={Array.from({ length: 11 }, () => ['x'])} />)
    expect(compact.getByTestId('table').dataset.density).toBe('compact')
  })

  it('列数が多い場合もdata-densityがdense/compactへ切り替わる', () => {
    const rows = [['a', 'b', 'c', 'd', 'e']]
    const dense = render(<Table columns={Array.from({ length: 5 }, (_, i) => ({ label: `c${i}` }))} rows={rows} />)
    expect(dense.getByTestId('table').dataset.density).toBe('dense')
    dense.unmount()

    const compact = render(<Table columns={Array.from({ length: 7 }, (_, i) => ({ label: `c${i}` }))} rows={rows} />)
    expect(compact.getByTestId('table').dataset.density).toBe('compact')
  })
})
