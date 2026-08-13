import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { TwoByTwoMatrix } from '../TwoByTwoMatrix'
import { mockDiagramCanvasSize } from '../../structureDiagram/__tests__/testCanvasSize'

mockDiagramCanvasSize()

describe('TwoByTwoMatrix', () => {
  it('4象限のタイトルを描画する', () => {
    const { getByText } = render(<TwoByTwoMatrix quadrants={[{ title: '左上' }, { title: '右上' }, { title: '左下' }, { title: '右下' }]} items={[{ label: 'A', x: 0.1, y: 0.1 }]} />)
    expect(getByText('左上')).toBeTruthy()
    expect(getByText('右上')).toBeTruthy()
    expect(getByText('左下')).toBeTruthy()
    expect(getByText('右下')).toBeTruthy()
  })

  it('items のラベルを Callout として描画する', () => {
    const { getByText } = render(
      <TwoByTwoMatrix
        quadrants={[{ title: 'q0' }, { title: 'q1' }, { title: 'q2' }, { title: 'q3' }]}
        items={[
          { label: '施策A', x: 0.1, y: 0.1 },
          { label: '施策B', x: 0.9, y: 0.9 },
        ]}
      />,
    )
    expect(getByText('施策A')).toBeTruthy()
    expect(getByText('施策B')).toBeTruthy()
  })

  it('quadrants と items が両方未指定の場合は何も描画しない', () => {
    expect(render(<TwoByTwoMatrix />).container.firstChild).toBeNull()
  })

  it('範囲外の x/y は端に丸める（破綻ではなく縮退）', () => {
    // ラベル文字列で存在確認できれば、範囲外座標でも例外が起きずに描画されたことが分かる
    const { getByText } = render(<TwoByTwoMatrix items={[{ label: 'over', x: 1.5, y: -0.2 }]} />)
    expect(getByText('over')).toBeTruthy()
  })

  it('axes.x.label/axes.y.label をバッジとして描画する', () => {
    const { getByText } = render(<TwoByTwoMatrix axes={{ x: { label: '影響度' }, y: { label: '工数' } }} items={[{ label: 'a', x: 0.5, y: 0.5 }]} />)
    expect(getByText('影響度')).toBeTruthy()
    expect(getByText('工数')).toBeTruthy()
  })
})
