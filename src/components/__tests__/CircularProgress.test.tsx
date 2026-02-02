import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { CircularProgress } from '../CircularProgress'

const RING_RADIUS = 18
const CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS

describe('CircularProgress', () => {
  it('visible=true, progress=0.5 で SVG リングが表示され stroke-dashoffset が 50% 分', () => {
    const { container } = render(<CircularProgress progress={0.5} visible={true} />)
    const circle = container.querySelector('circle')
    expect(circle).not.toBeNull()
    const expectedOffset = CIRCUMFERENCE * 0.5
    expect(circle!.getAttribute('stroke-dashoffset')).toBe(String(expectedOffset))
  })

  it('visible=false で null を返す（DOM に存在しない）', () => {
    const { container } = render(<CircularProgress progress={0.5} visible={false} />)
    expect(container.firstChild).toBeNull()
  })

  it('progress=0 で stroke-dashoffset が circumference と等しい', () => {
    const { container } = render(<CircularProgress progress={0} visible={true} />)
    const circle = container.querySelector('circle')
    expect(circle!.getAttribute('stroke-dashoffset')).toBe(String(CIRCUMFERENCE))
  })

  it('progress=1 で stroke-dashoffset が 0', () => {
    const { container } = render(<CircularProgress progress={1} visible={true} />)
    const circle = container.querySelector('circle')
    expect(circle!.getAttribute('stroke-dashoffset')).toBe('0')
  })

  it('progress が 1 を超える場合 1 にクランプされる', () => {
    const { container } = render(<CircularProgress progress={1.5} visible={true} />)
    const circle = container.querySelector('circle')
    expect(circle!.getAttribute('stroke-dashoffset')).toBe('0')
  })

  it('progress が負の場合 0 にクランプされる', () => {
    const { container } = render(<CircularProgress progress={-0.5} visible={true} />)
    const circle = container.querySelector('circle')
    expect(circle!.getAttribute('stroke-dashoffset')).toBe(String(CIRCUMFERENCE))
  })

  it('SVG 要素が描画される', () => {
    const { container } = render(<CircularProgress progress={0.5} visible={true} />)
    const svg = container.querySelector('svg')
    expect(svg).not.toBeNull()
  })

  it('animationDuration 指定時に animationDuration スタイルが設定され stroke-dashoffset 属性がない', () => {
    const { container } = render(<CircularProgress progress={0} visible={true} animationDuration={30} />)
    const circle = container.querySelector('circle')
    expect(circle).not.toBeNull()
    expect(circle!.style.animationDuration).toBe('30s')
    // animationDuration 指定時は stroke-dashoffset を直接属性に設定しない（CSS @keyframes が担当）
    expect(circle!.getAttribute('stroke-dashoffset')).toBeNull()
  })
})
