import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { Diagram } from '../Diagram'

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

const NODES = [
  { id: 'a', rect: { x: 0.05, y: 0.2, w: 0.2, h: 0.3 }, title: '起点', body: 'カード本文', badge: 1, color: 'series1' },
  { id: 'b', rect: { x: 0.5, y: 0.2, w: 0.2, h: 0.3 }, title: '終点', color: 'series2', variant: 'filled' as const },
]

describe('Diagram', () => {
  it('nodes をカードとして正規化座標の % 位置に描画する', () => {
    const { getByText } = render(<Diagram nodes={NODES} />)
    const card = getByText('起点').parentElement as HTMLElement

    expect(card.style.left).toBe('5%')
    expect(card.style.top).toBe('20%')
    expect(card.style.width).toBe('20%')
    expect(card.style.height).toBe('30%')
  })

  it('カードの色はカラーパレットキーから CSS 変数で解決する（テーマに追従する）', () => {
    const { getByText } = render(<Diagram nodes={NODES} />)
    const card = getByText('起点').parentElement as HTMLElement

    expect(card.style.getPropertyValue('--diagram-color')).toBe('var(--theme-series-1)')
  })

  it('カードの title / body / badge を描画する', () => {
    const { getByText } = render(<Diagram nodes={NODES} />)
    expect(getByText('カード本文')).toBeTruthy()
    expect(getByText('1')).toBeTruthy()
  })

  it('connectors を要素境界に接する直交経路の polyline として描画する', () => {
    const { container } = render(<Diagram nodes={NODES} connectors={[{ from: 'a', to: 'b', head: 'triangle' }]} />)
    const polyline = container.querySelector('polyline')

    // 中心の高さが揃った左右のカードなので、右辺 (0.25) から左辺 (0.5) までの水平線になる
    expect(polyline?.getAttribute('points')).toBe('300,175 600,175')
    expect(polyline?.getAttribute('marker-end')).toMatch(/^url\(#.+-head\)$/)
  })

  it('線幅は --theme-border-width の倍率で指定する（意匠トークンに追従する）', () => {
    const { container } = render(<Diagram arrows={[{ from: { x: 0, y: 0.5 }, to: { x: 1, y: 0.5 }, thickness: 3, dashed: true }]} />)
    const polyline = container.querySelector('polyline') as SVGPolylineElement

    expect(polyline.style.strokeWidth).toBe('calc(var(--theme-border-width) * 3)')
    expect(polyline.style.strokeDasharray).toBe('calc(var(--theme-border-width) * 12) calc(var(--theme-border-width) * 9)')
  })

  it('線の色はカラーパレットキーから CSS 変数で解決する', () => {
    const { container } = render(<Diagram arrows={[{ from: { x: 0, y: 0.5 }, to: { x: 1, y: 0.5 }, color: 'danger' }]} />)
    expect(container.querySelector('polyline')?.getAttribute('stroke')).toBe('var(--theme-danger)')
  })

  it('端点形状を省略した矢印は終点にだけマーカーを付ける', () => {
    const { container } = render(<Diagram arrows={[{ from: { x: 0, y: 0.5 }, to: { x: 1, y: 0.5 } }]} />)
    const polyline = container.querySelector('polyline')

    expect(polyline?.getAttribute('marker-end')).toMatch(/^url\(#.+-head\)$/)
    expect(polyline?.getAttribute('marker-start')).toBeNull()
  })

  it('SVG 層に実測サイズを属性で持たせる（PDF 書き出しの単体シリアライズで既定サイズにならないようにする）', () => {
    const { container } = render(<Diagram arrows={[{ from: { x: 0, y: 0.5 }, to: { x: 1, y: 0.5 } }]} />)
    const svg = container.querySelector('svg')

    expect(svg?.getAttribute('width')).toBe('1200')
    expect(svg?.getAttribute('height')).toBe('500')
  })

  it('矢印のラベルを経路の中央に置く', () => {
    const { getByText } = render(<Diagram arrows={[{ from: { x: 0.2, y: 0.5 }, to: { x: 0.8, y: 0.5 }, label: 'ラベル' }]} />)
    const label = getByText('ラベル')

    expect(label.style.left).toBe('50%')
    expect(label.style.top).toBe('50%')
  })

  it('badges を正規化座標の中心に置く', () => {
    const { getByText } = render(<Diagram badges={[{ at: { x: 0.9, y: 0.4 }, text: '★', shape: 'square', color: 'warning' }]} />)
    const badge = getByText('★')

    expect(badge.style.left).toBe('90%')
    expect(badge.style.top).toBe('40%')
    expect(badge.style.getPropertyValue('--diagram-color')).toBe('var(--theme-warning)')
  })

  it('callouts はラベルを引出先の反対側へ伸ばす', () => {
    const { getByText, rerender } = render(<Diagram callouts={[{ at: { x: 0.3, y: 0.5 }, to: { x: 0.6, y: 0.8 }, label: '注記' }]} />)
    // to が at より右にあるので、ラベルは to を左辺として右へ伸びる
    expect(getByText('注記').className).toMatch(/anchorLeft/)

    rerender(<Diagram callouts={[{ at: { x: 0.9, y: 0.5 }, to: { x: 0.6, y: 0.8 }, label: '注記' }]} />)
    expect(getByText('注記').className).toMatch(/anchorRight/)
  })

  it('存在しないノードを参照するコネクタは描画しない（デッキ全体を落とさない。利用者への報告は getThemeWarnings 経路が担う・#232）', () => {
    const { container } = render(<Diagram nodes={NODES} connectors={[{ from: 'a', to: 'missing' }]} />)

    expect(container.querySelector('polyline')).toBeNull()
  })

  it('配列でない props を渡されても描画を継続する', () => {
    const broken = { nodes: 'not-an-array', arrows: null } as unknown as Parameters<typeof Diagram>[0]
    const { container } = render(<Diagram {...broken} />)

    expect(container.querySelector('[data-testid="diagram-canvas"]')).not.toBeNull()
  })
})
