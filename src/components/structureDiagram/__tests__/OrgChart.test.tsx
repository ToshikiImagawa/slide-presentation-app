import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { OrgChart } from '../OrgChart'
import { mockDiagramCanvasSize } from './testCanvasSize'

mockDiagramCanvasSize()

const NODES = [
  { id: 'ceo', label: 'CEO' },
  { id: 'cto', label: 'CTO', parent: 'ceo' },
  { id: 'coo', label: 'COO', parent: 'ceo' },
  { id: 'eng', label: 'エンジニアリング部長', parent: 'cto' },
]

describe('OrgChart', () => {
  it('全ノードのラベルを描画する', () => {
    const { getByText } = render(<OrgChart nodes={NODES} />)
    expect(getByText('CEO')).toBeTruthy()
    expect(getByText('CTO')).toBeTruthy()
    expect(getByText('COO')).toBeTruthy()
    expect(getByText('エンジニアリング部長')).toBeTruthy()
  })

  it('parentを持つノードの数だけ接続線を描画する（ルートを除く）', () => {
    const { container } = render(<OrgChart nodes={NODES} />)
    expect(container.querySelectorAll('polyline')).toHaveLength(3)
  })

  it('idを持たないノードは除外する（不正なデッキでデッキ全体を落とさない）', () => {
    const { getByText, queryByText } = render(<OrgChart nodes={[{ label: 'idなし' } as never, { id: 'ok', label: '正常' }]} />)
    expect(queryByText('idなし')).toBeNull()
    expect(getByText('正常')).toBeTruthy()
  })

  it('nodes未指定・空配列では何も描画しない', () => {
    expect(render(<OrgChart />).container.firstChild).toBeNull()
    expect(render(<OrgChart nodes={[]} />).container.firstChild).toBeNull()
  })
})
