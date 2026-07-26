import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ToolbarVisibilityButton } from '../ToolbarVisibilityButton'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'
import type { ReactNode } from 'react'

const jaJP: LocaleResource = {
  languageCode: 'ja-JP',
  languageName: '日本語',
  ui: {
    toolbar: { hide: 'ツールバーを隠す (T)', show: 'ツールバーを表示 (T)' },
  },
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locales={[jaJP]} defaultLocale="ja-JP">
      {children}
    </I18nProvider>
  )
}

describe('ToolbarVisibilityButton', () => {
  it('表示中は「隠す」ラベルのボタンが表示される', () => {
    render(<ToolbarVisibilityButton hidden={false} onClick={() => {}} />, { wrapper: Wrapper })
    const button = screen.getByRole('button', { name: 'ツールバーを隠す (T)' })
    expect(button).toBeDefined()
  })

  it('非表示中は「表示」ラベルのボタンが表示される', () => {
    render(<ToolbarVisibilityButton hidden={true} onClick={() => {}} />, { wrapper: Wrapper })
    const button = screen.getByRole('button', { name: 'ツールバーを表示 (T)' })
    expect(button).toBeDefined()
  })

  it('クリックで onClick が呼ばれる', () => {
    const onClick = vi.fn()
    render(<ToolbarVisibilityButton hidden={false} onClick={onClick} />, { wrapper: Wrapper })

    const button = screen.getByRole('button')
    fireEvent.click(button)

    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
