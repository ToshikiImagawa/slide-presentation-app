import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsButton } from '../SettingsButton'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'
import type { ReactNode } from 'react'

const jaJP: LocaleResource = {
  languageCode: 'ja-JP',
  languageName: '日本語',
  ui: {
    settings: { open: '設定' },
  },
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locales={[jaJP]} defaultLocale="ja-JP">
      {children}
    </I18nProvider>
  )
}

describe('SettingsButton', () => {
  it('設定ボタンが表示される', () => {
    render(<SettingsButton onClick={() => {}} />, { wrapper: Wrapper })
    const button = screen.getByRole('button', { name: '設定' })
    expect(button).toBeDefined()
  })

  it('クリックで onClick が呼ばれる', () => {
    const onClick = vi.fn()
    render(<SettingsButton onClick={onClick} />, { wrapper: Wrapper })

    const button = screen.getByRole('button')
    fireEvent.click(button)

    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
