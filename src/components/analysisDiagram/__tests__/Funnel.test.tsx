import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Funnel } from '../Funnel'
import { mockDiagramCanvasSize } from '../../structureDiagram/__tests__/testCanvasSize'

mockDiagramCanvasSize()

const STAGES = [
  { label: 'アクセス', value: 10000 },
  { label: '登録', value: 3000, description: '会員登録' },
  { label: '有料化', value: 800 },
]

describe('Funnel', () => {
  it('段のラベルを描画する', () => {
    const { getAllByText } = render(<Funnel stages={STAGES} />)
    // ラベルは段バーとラベルボックスの2箇所（title 属性として）に置くため、片方でも存在すれば OK
    expect(getAllByText('アクセス').length).toBeGreaterThan(0)
    expect(getAllByText('登録').length).toBeGreaterThan(0)
    expect(getAllByText('有料化').length).toBeGreaterThan(0)
  })

  it('数値と単位を桁区切り + unit として描画する', () => {
    const { container } = render(<Funnel stages={STAGES} unit="件" />)
    expect(container.textContent).toContain('10,000件')
    expect(container.textContent).toContain('3,000件')
    expect(container.textContent).toContain('800件')
  })

  it('description をラベルボックスに描画する', () => {
    const { container } = render(<Funnel stages={STAGES} />)
    expect(container.textContent).toContain('会員登録')
  })

  it('stages 未指定・空配列では何も描画しない', () => {
    expect(render(<Funnel />).container.firstChild).toBeNull()
    expect(render(<Funnel stages={[]} />).container.firstChild).toBeNull()
  })

  it('value 未指定の段でも描画できる（等幅にフォールバック）', () => {
    const { getAllByText } = render(<Funnel stages={[{ label: 'A' }, { label: 'B' }]} />)
    expect(getAllByText('A').length).toBeGreaterThan(0)
    expect(getAllByText('B').length).toBeGreaterThan(0)
  })
})
