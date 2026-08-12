import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Swimlane } from '../Swimlane'
import { mockDiagramCanvasSize } from '../../structureDiagram/__tests__/testCanvasSize'

mockDiagramCanvasSize()

const PHASES = ['設計', '実装', 'レビュー', 'リリース']
const LANES = [
  { title: 'PM', nodes: [{ id: 'req', label: '要件定義', col: 0 }] },
  { title: 'エンジニア', nodes: [{ id: 'impl', label: 'コーディング', col: 1 }] },
  { title: 'QA', nodes: [{ id: 'review', label: '動作確認', col: 2 }] },
]
const CONNECTIONS = [
  { from: 'req', to: 'impl' },
  { from: 'impl', to: 'review' },
]

describe('Swimlane', () => {
  it('全レーンのノードラベルとレーン名・フェーズ名を描画する', () => {
    const { getByText } = render(<Swimlane phases={PHASES} lanes={LANES} connections={CONNECTIONS} />)
    expect(getByText('要件定義')).toBeTruthy()
    expect(getByText('コーディング')).toBeTruthy()
    expect(getByText('動作確認')).toBeTruthy()
    expect(getByText('PM')).toBeTruthy()
    expect(getByText('設計')).toBeTruthy()
  })

  it('connectionsの本数だけ接続線を描画する', () => {
    const { container } = render(<Swimlane phases={PHASES} lanes={LANES} connections={CONNECTIONS} />)
    expect(container.querySelectorAll('polyline')).toHaveLength(2)
  })

  it('phases未指定でも列数をノードの配置から自動導出して描画する', () => {
    const { getByText, queryByText } = render(<Swimlane lanes={LANES} />)
    expect(getByText('要件定義')).toBeTruthy()
    expect(queryByText('設計')).toBeNull()
  })

  it('idを持たないノードは除外する（不正なデッキでデッキ全体を落とさない）', () => {
    const { getByText, queryByText } = render(<Swimlane lanes={[{ title: 'A', nodes: [{ label: 'idなし' } as never, { id: 'ok', label: '正常' }] }]} />)
    expect(queryByText('idなし')).toBeNull()
    expect(getByText('正常')).toBeTruthy()
  })

  it('lanes未指定・空配列では何も描画しない', () => {
    expect(render(<Swimlane />).container.firstChild).toBeNull()
    expect(render(<Swimlane lanes={[]} />).container.firstChild).toBeNull()
  })
})
