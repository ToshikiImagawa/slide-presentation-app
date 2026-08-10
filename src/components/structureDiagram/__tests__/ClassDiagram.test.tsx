import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { ClassDiagram } from '../ClassDiagram'
import { mockDiagramCanvasSize } from './testCanvasSize'

mockDiagramCanvasSize()

const CLASSES = [
  { id: 'user', label: 'User', attributes: ['id: string', 'name: string'], methods: ['login(): void'] },
  { id: 'admin', label: 'Admin', attributes: ['role: string'] },
]
const RELATIONS = [{ from: 'admin', to: 'user', type: 'inheritance' as const }]

describe('ClassDiagram', () => {
  it('クラス名と属性・メソッドを描画する', () => {
    const { getByText } = render(<ClassDiagram classes={CLASSES} relations={RELATIONS} />)
    expect(getByText('User')).toBeTruthy()
    expect(getByText('Admin')).toBeTruthy()
    expect(getByText((_, el) => el?.textContent === 'id: string\nname: string\n\nlogin(): void')).toBeTruthy()
  })

  it('relationsの本数だけ関係線を描画する', () => {
    const { container } = render(<ClassDiagram classes={CLASSES} relations={RELATIONS} />)
    expect(container.querySelectorAll('polyline')).toHaveLength(1)
  })

  it('type: inheritance は三角の終端マーカーを使う（head省略時の既定値）', () => {
    const { container } = render(<ClassDiagram classes={CLASSES} relations={RELATIONS} />)
    // triangleマーカーはfill付きpath、arrowはfill="none"のpath
    const marker = container.querySelector('marker path')
    expect(marker?.getAttribute('fill')).not.toBe('none')
  })

  it('relationsのhead明示指定はtypeの既定値より優先する', () => {
    const { container } = render(<ClassDiagram classes={CLASSES} relations={[{ from: 'admin', to: 'user', type: 'inheritance' as const, head: 'dot' as const }]} />)
    const marker = container.querySelector('marker circle')
    expect(marker).toBeTruthy()
  })

  it('idを持たないクラスは除外する（不正なデッキでデッキ全体を落とさない）', () => {
    const { getByText, queryByText } = render(<ClassDiagram classes={[{ label: 'idなし' } as never, { id: 'ok', label: '正常' }]} />)
    expect(queryByText('idなし')).toBeNull()
    expect(getByText('正常')).toBeTruthy()
  })

  it('classes未指定・空配列では何も描画しない', () => {
    expect(render(<ClassDiagram />).container.firstChild).toBeNull()
    expect(render(<ClassDiagram classes={[]} />).container.firstChild).toBeNull()
  })
})
