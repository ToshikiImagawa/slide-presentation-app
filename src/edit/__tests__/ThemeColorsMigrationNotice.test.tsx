import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { ThemeColorsMigrationNotice } from '../ThemeColorsMigrationNotice'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'

const locales: LocaleResource[] = [{ languageCode: 'ja-JP', languageName: '日本語', ui: {} }]
function wrap(ui: ReactNode) {
  return (
    <I18nProvider locales={locales} defaultLocale="ja-JP">
      {ui}
    </I18nProvider>
  )
}

describe('ThemeColorsMigrationNotice', () => {
  it('themeColors に値が無ければ何も表示しない', () => {
    render(wrap(<ThemeColorsMigrationNotice themeColorsPalette={{}} onDelegate={vi.fn()} />))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('効かない項目数を表示する', () => {
    render(wrap(<ThemeColorsMigrationNotice themeColorsPalette={{ primary: '#112233', accent: '#445566' }} onDelegate={vi.fn()} />))
    expect(screen.getByText(/2件/)).not.toBeNull()
  })

  it('brand 未解決のときは委譲ボタンを無効化する', () => {
    render(wrap(<ThemeColorsMigrationNotice themeColorsPalette={{ primary: '#112233' }} onDelegate={vi.fn()} />))
    expect((screen.getByRole('button', { name: 'themeColors を委譲する' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('brand 解決済みなら委譲ボタンが有効で、クリックで onDelegate を呼ぶ', async () => {
    const onDelegate = vi.fn()
    render(wrap(<ThemeColorsMigrationNotice themeColorsPalette={{ primary: '#112233' }} brandColors={{ primary: '#ffffff' }} onDelegate={onDelegate} />))

    const button = screen.getByRole('button', { name: 'themeColors を委譲する' }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
    await userEvent.click(button)
    expect(onDelegate).toHaveBeenCalledTimes(1)
  })
})
