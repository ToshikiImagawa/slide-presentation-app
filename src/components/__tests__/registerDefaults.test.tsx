import { describe, expect, it, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { registerDefaultComponents } from '../registerDefaults'
import { resolveComponent, clearRegistry, componentFillsContentArea } from '../ComponentRegistry'

describe('registerDefaultComponents', () => {
  beforeEach(() => {
    clearRegistry()
    registerDefaultComponents()
  })

  it('Imageコンポーネントが登録される', () => {
    const ImageComponent = resolveComponent('Image')
    expect(ImageComponent).toBeDefined()
  })

  it('Imageコンポーネントがpropsを受け取りimg要素をレンダリングする', () => {
    const ImageComponent = resolveComponent('Image')
    const { container } = render(<ImageComponent src="/test.png" width={200} height={100} alt="テスト画像" />)
    const img = container.querySelector('img')
    expect(img).not.toBeNull()
    // 既定は Reveal.js の遅延読み込みに委ねる data-src（#224）
    expect(img?.getAttribute('data-src')).toBe('/test.png')
    expect(img?.getAttribute('alt')).toBe('テスト画像')
  })

  it('TerminalAnimationコンポーネントが登録される', () => {
    const Component = resolveComponent('TerminalAnimation')
    expect(Component).toBeDefined()
  })

  // #241: two-column 等の component 参照から Chart を使えるようにする。fillsContentArea を付け忘れると
  // カラムの高さが0になり Visual Check（getVisualCheckWarnings）が落ちるため、traits の付与を直接検査する
  it('Chartコンポーネントが fillsContentArea: true で登録される', () => {
    expect(resolveComponent('Chart')).toBeDefined()
    expect(componentFillsContentArea('Chart')).toBe(true)
  })
})
