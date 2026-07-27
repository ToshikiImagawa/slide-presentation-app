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

  it('Ctrl+F で検索バーが開く', () => {
    render(
      <Wrapper>
        <SlideJsonEditor value='{"a":"foo","b":"foo"}' onChange={() => {}} errors={[]} />
      </Wrapper>,
    )

    expect(screen.queryByPlaceholderText('検索...')).toBeNull()
    fireEvent.keyDown(screen.getByLabelText('slides.json'), { key: 'f', ctrlKey: true })
    expect(screen.getByPlaceholderText('検索...')).not.toBeNull()
  })

  it('検索クエリを入力するとマッチ数が表示され、次/前へ移動できる', () => {
    render(
      <Wrapper>
        <SlideJsonEditor value='{"a":"foo","b":"foo"}' onChange={() => {}} errors={[]} />
      </Wrapper>,
    )

    fireEvent.keyDown(screen.getByLabelText('slides.json'), { key: 'f', ctrlKey: true })
    fireEvent.change(screen.getByPlaceholderText('検索...'), { target: { value: 'foo' } })

    expect(screen.getByText('1/2')).not.toBeNull()

    fireEvent.click(screen.getByLabelText('次のマッチへ'))
    expect(screen.getByText('2/2')).not.toBeNull()

    fireEvent.click(screen.getByLabelText('前のマッチへ'))
    expect(screen.getByText('1/2')).not.toBeNull()
  })

  it('Escape で検索バーを閉じる', () => {
    render(
      <Wrapper>
        <SlideJsonEditor value='{"a":"foo"}' onChange={() => {}} errors={[]} />
      </Wrapper>,
    )

    fireEvent.keyDown(screen.getByLabelText('slides.json'), { key: 'f', ctrlKey: true })
    expect(screen.getByPlaceholderText('検索...')).not.toBeNull()

    fireEvent.keyDown(screen.getByPlaceholderText('検索...'), { key: 'Escape' })
    expect(screen.queryByPlaceholderText('検索...')).toBeNull()
  })

  it('現在のマッチを置換できる', () => {
    const onChange = vi.fn()
    render(
      <Wrapper>
        <SlideJsonEditor value='{"a":"foo","b":"foo"}' onChange={onChange} errors={[]} />
      </Wrapper>,
    )

    fireEvent.keyDown(screen.getByLabelText('slides.json'), { key: 'f', ctrlKey: true })
    fireEvent.change(screen.getByPlaceholderText('検索...'), { target: { value: 'foo' } })
    fireEvent.click(screen.getByLabelText('置換を表示'))
    fireEvent.change(screen.getByPlaceholderText('置換後の文字列'), { target: { value: 'bar' } })
    fireEvent.click(screen.getByText('置換'))

    expect(onChange).toHaveBeenCalledWith('{"a":"bar","b":"foo"}')
  })

  it('すべて置換できる', () => {
    const onChange = vi.fn()
    render(
      <Wrapper>
        <SlideJsonEditor value='{"a":"foo","b":"foo"}' onChange={onChange} errors={[]} />
      </Wrapper>,
    )

    fireEvent.keyDown(screen.getByLabelText('slides.json'), { key: 'f', ctrlKey: true })
    fireEvent.change(screen.getByPlaceholderText('検索...'), { target: { value: 'foo' } })
    fireEvent.click(screen.getByLabelText('置換を表示'))
    fireEvent.change(screen.getByPlaceholderText('置換後の文字列'), { target: { value: 'bar' } })
    fireEvent.click(screen.getByText('すべて置換'))

    expect(onChange).toHaveBeenCalledWith('{"a":"bar","b":"bar"}')
  })
})
