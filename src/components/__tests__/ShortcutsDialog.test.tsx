import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ShortcutsDialog } from '../ShortcutsDialog'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'
import type { ReactNode } from 'react'

const enUS: LocaleResource = {
  languageCode: 'en-US',
  languageName: 'English',
  ui: {
    settings: { close: 'Close' },
    shortcuts: {
      title: 'Keyboard shortcuts',
      viewerSection: 'Presentation viewer',
      editSection: 'Edit mode',
      toggleToolbar: 'Show/hide the toolbar',
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

describe('ShortcutsDialog', () => {
  it('open=false の場合、ダイアログが表示されない', () => {
    render(
      <Wrapper>
        <ShortcutsDialog open={false} onClose={() => {}} />
      </Wrapper>,
    )
    expect(screen.queryByText('Keyboard shortcuts')).toBeNull()
  })

  it('open=true の場合、ダイアログが表示される', () => {
    render(
      <Wrapper>
        <ShortcutsDialog open={true} onClose={() => {}} />
      </Wrapper>,
    )
    expect(screen.getByText('Keyboard shortcuts')).toBeDefined()
  })

  it('role="dialog" と aria-modal="true" を持つ', () => {
    render(
      <Wrapper>
        <ShortcutsDialog open={true} onClose={() => {}} />
      </Wrapper>,
    )
    const dialog = screen.getByRole('dialog')
    expect(dialog.getAttribute('aria-modal')).toBe('true')
    expect(dialog.getAttribute('aria-labelledby')).toBeTruthy()
  })

  it('ビューア用・編集モード用の両セクションを表示する', () => {
    render(
      <Wrapper>
        <ShortcutsDialog open={true} onClose={() => {}} />
      </Wrapper>,
    )
    expect(screen.getByText('Presentation viewer')).toBeDefined()
    expect(screen.getByText('Edit mode')).toBeDefined()
  })

  it('ビューア用ショートカット（T）と編集モード用ショートカット（Ctrl / Cmd + S）を表示する', () => {
    render(
      <Wrapper>
        <ShortcutsDialog open={true} onClose={() => {}} />
      </Wrapper>,
    )
    expect(screen.getByText('T')).toBeDefined()
    expect(screen.getByText('Ctrl / Cmd + S')).toBeDefined()
  })

  it('Escapeキーで onClose が呼ばれる', () => {
    const onClose = vi.fn()
    render(
      <Wrapper>
        <ShortcutsDialog open={true} onClose={onClose} />
      </Wrapper>,
    )
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('閉じるボタンをクリックすると onClose が呼ばれる', () => {
    const onClose = vi.fn()
    render(
      <Wrapper>
        <ShortcutsDialog open={true} onClose={onClose} />
      </Wrapper>,
    )
    const closeButtons = screen.getAllByRole('button', { name: 'Close' })
    fireEvent.click(closeButtons[0])
    expect(onClose).toHaveBeenCalledTimes(1)
  })
})
