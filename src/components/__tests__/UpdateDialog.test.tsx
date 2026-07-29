import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { UpdateDialog } from '../UpdateDialog'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'
import type { ReactNode } from 'react'

const enUS: LocaleResource = {
  languageCode: 'en-US',
  languageName: 'English',
  ui: {
    settings: { close: 'Close' },
    updater: {
      title: 'A new version is available',
      later: 'Later',
      versionAvailable: 'Version {version} is available',
      installing: 'Installing…',
      installNow: 'Install now and restart',
    },
  },
}

const locales = [enUS]

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locales={locales} defaultLocale="en-US">
      {children}
    </I18nProvider>
  )
}

describe('UpdateDialog', () => {
  it('open=false の場合、ダイアログが表示されない', () => {
    render(
      <Wrapper>
        <UpdateDialog open={false} onClose={() => {}} onInstall={() => {}} installing={false} version="2.1.0" body={null} />
      </Wrapper>,
    )
    expect(screen.queryByText('A new version is available')).toBeNull()
  })

  it('open=true の場合、バージョン番号を表示する', () => {
    render(
      <Wrapper>
        <UpdateDialog open={true} onClose={() => {}} onInstall={() => {}} installing={false} version="2.1.0" body={null} />
      </Wrapper>,
    )
    expect(screen.getByText('A new version is available')).toBeDefined()
    expect(screen.getByText('Version 2.1.0 is available')).toBeDefined()
  })

  it('body があればリリースノートを表示する', () => {
    render(
      <Wrapper>
        <UpdateDialog open={true} onClose={() => {}} onInstall={() => {}} installing={false} version="2.1.0" body="バグ修正" />
      </Wrapper>,
    )
    expect(screen.getByText('バグ修正')).toBeDefined()
  })

  it('「今すぐ更新」ボタンをクリックすると onInstall が呼ばれる', () => {
    const onInstall = vi.fn()
    render(
      <Wrapper>
        <UpdateDialog open={true} onClose={() => {}} onInstall={onInstall} installing={false} version="2.1.0" body={null} />
      </Wrapper>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Install now and restart' }))
    expect(onInstall).toHaveBeenCalledTimes(1)
  })

  it('installing=true の場合、ボタンが無効化され「更新中…」を表示する', () => {
    render(
      <Wrapper>
        <UpdateDialog open={true} onClose={() => {}} onInstall={() => {}} installing={true} version="2.1.0" body={null} />
      </Wrapper>,
    )
    const button = screen.getByRole('button', { name: 'Installing…' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('「後で」ボタンをクリックすると onClose が呼ばれる', () => {
    const onClose = vi.fn()
    render(
      <Wrapper>
        <UpdateDialog open={true} onClose={onClose} onInstall={() => {}} installing={false} version="2.1.0" body={null} />
      </Wrapper>,
    )
    fireEvent.click(screen.getAllByRole('button', { name: 'Later' })[0])
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
