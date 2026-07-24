import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'
import { SlideJsonEditor } from '../SlideJsonEditor'

const locales: LocaleResource[] = [{ languageCode: 'ja-JP', languageName: '日本語', ui: {} }]

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locales={locales} defaultLocale="ja-JP">
      {children}
    </I18nProvider>
  )
}

describe('SlideJsonEditor', () => {
  it('テキスト編集で onChange が呼ばれる', () => {
    const onChange = vi.fn()
    render(
      <Wrapper>
        <SlideJsonEditor value="{}" onChange={onChange} errors={[]} />
      </Wrapper>,
    )

    fireEvent.change(screen.getByLabelText('slides.json'), { target: { value: '{"a":1}' } })

    expect(onChange).toHaveBeenCalledWith('{"a":1}')
  })

  it('検証エラーが渡されると alert 領域に path とメッセージを表示する', () => {
    render(
      <Wrapper>
        <SlideJsonEditor value="{}" onChange={() => {}} errors={[{ path: 'meta.title', message: '必須です', expected: 'string', actual: 'undefined' }]} />
      </Wrapper>,
    )

    const alert = screen.getByRole('alert')
    expect(alert.textContent).toContain('meta.title')
    expect(alert.textContent).toContain('必須です')
  })

  it('エラーが無いときは alert を表示しない', () => {
    render(
      <Wrapper>
        <SlideJsonEditor value="{}" onChange={() => {}} errors={[]} />
      </Wrapper>,
    )

    expect(screen.queryByRole('alert')).toBeNull()
  })
})
