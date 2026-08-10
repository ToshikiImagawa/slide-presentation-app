import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Flow } from '../Flow'

/** jsdom はレイアウトを持たず offsetWidth/offsetHeight が常に 0 なので、DiagramCanvas の実測値を差し替える */
const CANVAS = { width: 1200, height: 500 }
const original = {
  width: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetWidth'),
  height: Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight'),
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', { configurable: true, get: () => CANVAS.width })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', { configurable: true, get: () => CANVAS.height })
})

afterAll(() => {
  if (original.width) Object.defineProperty(HTMLElement.prototype, 'offsetWidth', original.width)
  if (original.height) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', original.height)
})

const THREE_STEPS = [{ title: '要件定義' }, { title: '実装' }, { title: 'リリース', description: '本番反映' }]

describe('Flow', () => {
  it('工程数だけカードと番号バッジを描画する', () => {
    const { getByText } = render(<Flow steps={THREE_STEPS} />)
    expect(getByText('要件定義')).toBeTruthy()
    expect(getByText('実装')).toBeTruthy()
    expect(getByText('リリース')).toBeTruthy()
    expect(getByText('本番反映')).toBeTruthy()
    expect(getByText('1')).toBeTruthy()
    expect(getByText('3')).toBeTruthy()
  })

  it('工程数-1本の矢印（コネクタ）をカード間に描画する', () => {
    const { container } = render(<Flow steps={THREE_STEPS} />)
    expect(container.querySelectorAll('polyline')).toHaveLength(2)
  })

  it('4工程以上ではカードのフォント縮小率（DiagramCardのscaleプロパティ）が下がる（工程数に応じたカード幅・文字サイズの決定ロジック）', () => {
    const three = render(<Flow steps={THREE_STEPS} />)
    const five = render(<Flow steps={[{ title: 'a' }, { title: 'b' }, { title: 'c' }, { title: 'd' }, { title: 'e' }]} />)

    const threeCard = three.getByText('要件定義').parentElement as HTMLElement
    const fiveCard = five.getByText('a').parentElement as HTMLElement
    expect(threeCard.style.getPropertyValue('--diagram-font-scale')).toBe('1')
    expect(fiveCard.style.getPropertyValue('--diagram-font-scale')).toBe('0.8')
  })

  it('工程数に応じてカード幅が狭くなる', () => {
    const { getByText } = render(<Flow steps={[{ title: 'a' }, { title: 'b' }, { title: 'c' }, { title: 'd' }, { title: 'e' }]} />)
    const card = getByText('a').parentElement as HTMLElement
    // (1 - 0.035*4) / 5 = 0.172 → 17.2%
    expect(card.style.width).toBe('17.2%')
  })

  it('steps未指定・空配列では何も描画しない', () => {
    expect(render(<Flow />).container.firstChild).toBeNull()
    expect(render(<Flow steps={[]} />).container.firstChild).toBeNull()
  })

  it('stepsが配列でなくても落ちない（不正なデッキでデッキ全体を落とさない）', () => {
    expect(render(<Flow steps={'broken' as never} />).container.firstChild).toBeNull()
  })
})
