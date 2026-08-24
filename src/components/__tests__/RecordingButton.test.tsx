import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RecordingButton } from '../RecordingButton'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'
import type { ReactNode } from 'react'

const jaJP: LocaleResource = {
  languageCode: 'ja-JP',
  languageName: '日本語',
  ui: {
    recording: {
      start: '録画を開始',
      stop: '録画を停止',
      saving: '保存中…',
      unavailable: 'この環境では録画を利用できません',
    },
  },
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locales={[jaJP]} defaultLocale="ja-JP">
      {children}
    </I18nProvider>
  )
}

describe('RecordingButton', () => {
  it('idle 状態で録画開始ボタンが表示される', () => {
    render(<RecordingButton state="idle" onToggle={() => {}} />, { wrapper: Wrapper })
    const button = screen.getByRole('button', { name: '録画を開始' }) as HTMLButtonElement
    expect(button).toBeDefined()
    expect(button.disabled).toBe(false)
  })

  it('recording 状態でタイトルが「録画を停止」になる', () => {
    render(<RecordingButton state="recording" onToggle={() => {}} />, { wrapper: Wrapper })
    const button = screen.getByRole('button', { name: '録画を停止' }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })

  it('saving 状態ではボタンが無効化される', () => {
    render(<RecordingButton state="saving" onToggle={() => {}} />, { wrapper: Wrapper })
    const button = screen.getByRole('button', { name: '保存中…' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('error 状態ではボタンが無効化される', () => {
    render(<RecordingButton state="error" onToggle={() => {}} />, { wrapper: Wrapper })
    const button = screen.getByRole('button', { name: 'この環境では録画を利用できません' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('idle 状態でクリックすると onToggle が呼ばれる', () => {
    const onToggle = vi.fn()
    render(<RecordingButton state="idle" onToggle={onToggle} />, { wrapper: Wrapper })

    fireEvent.click(screen.getByRole('button'))

    expect(onToggle).toHaveBeenCalledTimes(1)
  })

  it('recording 状態でクリックすると onToggle が呼ばれる', () => {
    const onToggle = vi.fn()
    render(<RecordingButton state="recording" onToggle={onToggle} />, { wrapper: Wrapper })

    fireEvent.click(screen.getByRole('button'))

    expect(onToggle).toHaveBeenCalledTimes(1)
  })
})
