import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AudioControlBar } from '../AudioControlBar'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'
import type { ReactNode } from 'react'

const jaJP: LocaleResource = {
  languageCode: 'ja-JP',
  languageName: '日本語',
  ui: {
    audio: { play: '音声を再生', stop: '音声を停止', autoPlayOn: '自動再生をOFFにする', autoPlayOff: '自動再生をONにする', autoSlideshowOn: '自動スライドショーをOFFにする', autoSlideshowOff: '自動スライドショーをONにする' },
  },
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locales={[jaJP]} defaultLocale="ja-JP">
      {children}
    </I18nProvider>
  )
}

describe('AudioControlBar', () => {
  it('自動再生ボタンが表示される', () => {
    render(<AudioControlBar autoPlay={false} onAutoPlayChange={() => {}} autoSlideshow={false} onAutoSlideshowChange={() => {}} />, { wrapper: Wrapper })
    const button = screen.getByRole('button', { name: '自動再生をONにする' })
    expect(button).toBeDefined()
  })

  it('自動スライドショーボタンが表示される', () => {
    render(<AudioControlBar autoPlay={false} onAutoPlayChange={() => {}} autoSlideshow={false} onAutoSlideshowChange={() => {}} />, { wrapper: Wrapper })
    const button = screen.getByRole('button', { name: '自動スライドショーをONにする' })
    expect(button).toBeDefined()
  })

  it('自動再生ボタンクリックで onAutoPlayChange が呼ばれる', () => {
    const onChange = vi.fn()
    render(<AudioControlBar autoPlay={false} onAutoPlayChange={onChange} autoSlideshow={false} onAutoSlideshowChange={() => {}} />, { wrapper: Wrapper })

    fireEvent.click(screen.getByRole('button', { name: '自動再生をONにする' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('自動再生 ON 時にクリックで OFF が呼ばれる', () => {
    const onChange = vi.fn()
    render(<AudioControlBar autoPlay={true} onAutoPlayChange={onChange} autoSlideshow={false} onAutoSlideshowChange={() => {}} />, { wrapper: Wrapper })

    fireEvent.click(screen.getByRole('button', { name: '自動再生をOFFにする' }))
    expect(onChange).toHaveBeenCalledWith(false)
  })

  it('自動スライドショーボタンクリックで onAutoSlideshowChange が呼ばれる', () => {
    const onChange = vi.fn()
    render(<AudioControlBar autoPlay={false} onAutoPlayChange={() => {}} autoSlideshow={false} onAutoSlideshowChange={onChange} />, { wrapper: Wrapper })

    fireEvent.click(screen.getByRole('button', { name: '自動スライドショーをONにする' }))
    expect(onChange).toHaveBeenCalledWith(true)
  })

  it('aria-pressed が状態を反映する', () => {
    render(<AudioControlBar autoPlay={true} onAutoPlayChange={() => {}} autoSlideshow={false} onAutoSlideshowChange={() => {}} />, { wrapper: Wrapper })

    const autoPlayBtn = screen.getByRole('button', { name: '自動再生をOFFにする' })
    const autoSlideshowBtn = screen.getByRole('button', { name: '自動スライドショーをONにする' })

    expect(autoPlayBtn.getAttribute('aria-pressed')).toBe('true')
    expect(autoSlideshowBtn.getAttribute('aria-pressed')).toBe('false')
  })
})
