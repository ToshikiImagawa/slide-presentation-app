import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsWindow } from '../SettingsWindow'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'
import type { ReactNode } from 'react'

const enUS: LocaleResource = {
  languageCode: 'en-US',
  languageName: 'English',
  ui: {
    settings: { title: 'Settings', language: 'Language', close: 'Close', scrollSpeed: 'Scroll Speed (sec)' },
  },
}

const jaJP: LocaleResource = {
  languageCode: 'ja-JP',
  languageName: '日本語',
  ui: {
    settings: { title: '設定', language: '言語', close: '閉じる', scrollSpeed: 'スクロールスピード（秒）' },
  },
}

const locales = [enUS, jaJP]

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locales={locales} defaultLocale="en-US">
      {children}
    </I18nProvider>
  )
}

describe('SettingsWindow', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('open=false の場合、ウィンドウが表示されない', () => {
    render(
      <Wrapper>
        <SettingsWindow open={false} onClose={() => {}} scrollSpeed={20} setScrollSpeed={() => {}} />
      </Wrapper>,
    )
    expect(screen.queryByText('Settings')).toBeNull()
  })

  it('open=true の場合、ウィンドウが表示される', () => {
    render(
      <Wrapper>
        <SettingsWindow open={true} onClose={() => {}} scrollSpeed={20} setScrollSpeed={() => {}} />
      </Wrapper>,
    )
    expect(screen.getByText('Settings')).toBeDefined()
  })

  it('言語選択肢が表示される', () => {
    render(
      <Wrapper>
        <SettingsWindow open={true} onClose={() => {}} scrollSpeed={20} setScrollSpeed={() => {}} />
      </Wrapper>,
    )
    expect(screen.getByText('Language')).toBeDefined()
    // select 要素の存在確認
    const select = screen.getByRole('combobox')
    expect(select).toBeDefined()
  })

  it('閉じるボタンをクリックすると onClose が呼ばれる', () => {
    const onClose = vi.fn()
    render(
      <Wrapper>
        <SettingsWindow open={true} onClose={onClose} scrollSpeed={20} setScrollSpeed={() => {}} />
      </Wrapper>,
    )

    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    fireEvent.click(closeButtons[0])

    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('スクロールスピード設定が表示される', () => {
    render(
      <Wrapper>
        <SettingsWindow open={true} onClose={() => {}} scrollSpeed={20} setScrollSpeed={() => {}} />
      </Wrapper>,
    )
    expect(screen.getByText('Scroll Speed (sec)')).toBeDefined()
    const input = screen.getByRole('spinbutton') as HTMLInputElement
    expect(input.value).toBe('20')
  })

  it('スクロールスピード変更で setScrollSpeed が呼ばれる', () => {
    const setScrollSpeed = vi.fn()
    render(
      <Wrapper>
        <SettingsWindow open={true} onClose={() => {}} scrollSpeed={20} setScrollSpeed={setScrollSpeed} />
      </Wrapper>,
    )
    const input = screen.getByRole('spinbutton')
    fireEvent.change(input, { target: { value: '30' } })
    expect(setScrollSpeed).toHaveBeenCalledWith(30)
  })

  it('言語を変更するとセレクトの値が更新される', () => {
    render(
      <Wrapper>
        <SettingsWindow open={true} onClose={() => {}} scrollSpeed={20} setScrollSpeed={() => {}} />
      </Wrapper>,
    )

    const select = screen.getByRole('combobox') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'ja-JP' } })

    expect(select.value).toBe('ja-JP')
  })
})
