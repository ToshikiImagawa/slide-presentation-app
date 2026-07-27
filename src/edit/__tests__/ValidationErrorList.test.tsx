import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'
import { ValidationErrorList } from '../ValidationErrorList'

const locales: LocaleResource[] = [{ languageCode: 'ja-JP', languageName: '日本語', ui: {} }]

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locales={locales} defaultLocale="ja-JP">
      {children}
    </I18nProvider>
  )
}

describe('ValidationErrorList', () => {
  it('text/onJumpToOffset が無い場合は行番号を表示しない', () => {
    render(
      <Wrapper>
        <ValidationErrorList errors={[{ path: 'meta.title', message: '必須です', expected: 'string', actual: 'undefined' }]} />
      </Wrapper>,
    )

    expect(screen.queryByText(/^L\d+$/)).toBeNull()
  })

  it('text/onJumpToOffset が渡されると行番号リンクを表示し、クリックでオフセットを通知する', async () => {
    const onJumpToOffset = vi.fn()
    const text = '{\n  "meta": { "title": "" }\n}'
    render(
      <Wrapper>
        <ValidationErrorList errors={[{ path: 'meta.title', message: '空にできません', expected: 'string', actual: '""' }]} text={text} onJumpToOffset={onJumpToOffset} />
      </Wrapper>,
    )

    const link = screen.getByText('L2')
    await userEvent.click(link)

    expect(onJumpToOffset).toHaveBeenCalledTimes(1)
    const offset = onJumpToOffset.mock.calls[0][0]
    expect(text.slice(offset, offset + 2)).toBe('""')
  })

  it('path に対応する位置が見つからない場合は行番号を表示しない', () => {
    const text = '{"meta": {}}'
    render(
      <Wrapper>
        <ValidationErrorList errors={[{ path: 'meta.title', message: '必須です', expected: 'string', actual: 'undefined' }]} text={text} onJumpToOffset={vi.fn()} />
      </Wrapper>,
    )

    expect(screen.queryByText(/^L\d+$/)).toBeNull()
  })
})
