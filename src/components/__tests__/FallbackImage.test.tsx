import { describe, it, expect } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { FallbackImage, LazyImageContext } from '../FallbackImage'

describe('FallbackImage', () => {
  it('既定（Reveal デッキ内）では data-src を出し src は出さない（#224 の遅延読み込み）', () => {
    const { container } = render(<FallbackImage src="image/foo.png" />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('data-src')).toBe('image/foo.png')
    expect(img.getAttribute('src')).toBeNull()
  })

  it('decoding="async" を付与する', () => {
    const { container } = render(<FallbackImage src="image/foo.png" />)
    const img = container.querySelector('img')!
    expect(img.getAttribute('decoding')).toBe('async')
  })

  it('LazyImageContext で false を渡すと即時 src を出す（Reveal デッキを持たないプレビュー用）', () => {
    const { container } = render(
      <LazyImageContext.Provider value={false}>
        <FallbackImage src="image/foo.png" />
      </LazyImageContext.Provider>,
    )
    const img = container.querySelector('img')!
    expect(img.getAttribute('src')).toBe('image/foo.png')
    expect(img.getAttribute('data-src')).toBeNull()
  })

  it('onLoad で data-state が loaded になる', () => {
    const { container } = render(<FallbackImage src="image/foo.png" />)
    const img = container.querySelector('img')!
    fireEvent.load(img)
    expect(img.getAttribute('data-state')).toBe('loaded')
  })

  it('src が実際に設定されている状態での onError はプレースホルダに切り替える', () => {
    const { container } = render(
      <LazyImageContext.Provider value={false}>
        <FallbackImage src="image/foo.png" width={100} height={80} />
      </LazyImageContext.Provider>,
    )
    const img = container.querySelector('img')!
    fireEvent.error(img)
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('[data-state="error"]')).not.toBeNull()
  })

  it('src を持たない（data-src のみの unload 状態）の onError は無視する', () => {
    const { container } = render(<FallbackImage src="image/foo.png" />)
    const img = container.querySelector('img')!
    fireEvent.error(img)
    // Reveal.js の unload（src 除去）に伴う誤検知は無視し、プレースホルダに切り替えない
    expect(container.querySelector('img')).not.toBeNull()
    expect(container.querySelector('[data-state="error"]')).toBeNull()
  })
})
