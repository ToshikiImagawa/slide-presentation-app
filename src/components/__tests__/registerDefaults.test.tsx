import { describe, expect, it, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { registerDefaultComponents } from '../registerDefaults'
import { resolveComponent, clearRegistry } from '../ComponentRegistry'

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
    expect(img?.getAttribute('src')).toBe('/test.png')
    expect(img?.getAttribute('alt')).toBe('テスト画像')
  })

  it('TerminalAnimationコンポーネントが登録される', () => {
    const Component = resolveComponent('TerminalAnimation')
    expect(Component).toBeDefined()
  })
})
