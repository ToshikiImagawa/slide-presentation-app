import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AudioPlayButton } from '../AudioPlayButton'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'
import type { ReactNode } from 'react'

const jaJP: LocaleResource = {
  languageCode: 'ja-JP',
  languageName: '日本語',
  ui: {
    audio: { play: '音声を再生', stop: '音声を停止' },
  },
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locales={[jaJP]} defaultLocale="ja-JP">
      {children}
    </I18nProvider>
  )
}

describe('AudioPlayButton', () => {
  it('idle 状態でスピーカーアイコンが表示される', () => {
    render(<AudioPlayButton playbackState="idle" onToggle={() => {}} />, { wrapper: Wrapper })
    const button = screen.getByRole('button', { name: '音声を再生' })
    expect(button).toBeDefined()
  })

  it('playing 状態でタイトルが「音声を停止」になる', () => {
    render(<AudioPlayButton playbackState="playing" onToggle={() => {}} />, { wrapper: Wrapper })
    const button = screen.getByRole('button', { name: '音声を停止' })
    expect(button).toBeDefined()
  })

  it('クリックで onToggle が呼ばれる', () => {
    const onToggle = vi.fn()
    render(<AudioPlayButton playbackState="idle" onToggle={onToggle} />, { wrapper: Wrapper })

    const button = screen.getByRole('button')
    fireEvent.click(button)

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('playing 状態でクリックすると onToggle が呼ばれる', () => {
    const onToggle = vi.fn()
    render(<AudioPlayButton playbackState="playing" onToggle={onToggle} />, { wrapper: Wrapper })

    const button = screen.getByRole('button')
    fireEvent.click(button)

    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
