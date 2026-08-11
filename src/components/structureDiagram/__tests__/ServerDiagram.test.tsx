import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { ServerDiagram } from '../ServerDiagram'
import { mockDiagramCanvasSize } from './testCanvasSize'

mockDiagramCanvasSize()

const ZONES = [
  { title: 'パブリックサブネット', nodes: [{ id: 'lb', label: 'ロードバランサ' }] },
  {
    title: 'プライベートサブネット',
    nodes: [
      { id: 'app', label: 'APIサーバ' },
      { id: 'db', label: 'DB' },
    ],
  },
]
const CONNECTIONS = [
  { from: 'lb', to: 'app' },
  { from: 'app', to: 'db' },
]

describe('ServerDiagram', () => {
  it('ゾーンのラベルとノードのラベルを描画する', () => {
    const { getByText } = render(<ServerDiagram zones={ZONES} connections={CONNECTIONS} />)
    expect(getByText('パブリックサブネット')).toBeTruthy()
    expect(getByText('プライベートサブネット')).toBeTruthy()
    expect(getByText('ロードバランサ')).toBeTruthy()
    expect(getByText('APIサーバ')).toBeTruthy()
    expect(getByText('DB')).toBeTruthy()
  })

  it('connectionsで指定した本数だけコネクタを描画する', () => {
    const { container } = render(<ServerDiagram zones={ZONES} connections={CONNECTIONS} />)
    expect(container.querySelectorAll('polyline')).toHaveLength(2)
  })

  it('存在しないノードidを参照するconnectionsは警告を出しつつ落ちない', () => {
    const { container } = render(<ServerDiagram zones={ZONES} connections={[{ from: 'lb', to: 'missing' }]} />)
    expect(container.querySelectorAll('polyline')).toHaveLength(0)
  })

  it('idを持たないノードは描画対象から除外する（不正なデッキでデッキ全体を落とさない）', () => {
    const { getByText, queryByText } = render(<ServerDiagram zones={[{ title: 'ゾーン', nodes: [{ label: 'idなし' } as never, { id: 'ok', label: '正常' }] }]} />)
    expect(queryByText('idなし')).toBeNull()
    expect(getByText('正常')).toBeTruthy()
  })

  it('zones未指定・空配列では何も描画しない', () => {
    expect(render(<ServerDiagram />).container.firstChild).toBeNull()
    expect(render(<ServerDiagram zones={[]} />).container.firstChild).toBeNull()
  })
})
