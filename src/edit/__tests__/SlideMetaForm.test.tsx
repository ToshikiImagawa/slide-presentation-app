import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'
import { SlideMetaForm } from '../SlideMetaForm'
import type { PresentationData } from '../../data'

const locales: LocaleResource[] = [{ languageCode: 'ja-JP', languageName: '日本語', ui: {} }]

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locales={locales} defaultLocale="ja-JP">
      {children}
    </I18nProvider>
  )
}

// theme.customCSS・未知色キー・未知コンテンツキー・slides を含む（無損失保持の検証用）
const base: PresentationData = {
  meta: { title: '元タイトル' },
  theme: { customCSS: '.x{}', colors: { primary: '#111', custom9: '#999' } },
  slides: [{ id: 's1', layout: 'center', content: { left: { k: 'v' } } }],
}

describe('SlideMetaForm', () => {
  it('タイトル編集は meta.title のみ更新し、theme・未知キー・slides を保持する（FR-004）', () => {
    const onChange = vi.fn()
    render(
      <Wrapper>
        <SlideMetaForm value={base} onChange={onChange} />
      </Wrapper>,
    )

    fireEvent.change(screen.getByLabelText(/タイトル/), { target: { value: '新タイトル' } })

    expect(onChange).toHaveBeenCalledTimes(1)
    const next = onChange.mock.calls[0][0] as PresentationData
    expect(next.meta.title).toBe('新タイトル')
    // 対象外は保持
    expect(next.theme).toEqual(base.theme)
    expect(next.slides).toEqual(base.slides)
  })

  it('色編集は対象キーのみ更新し、他の色・customCSS を保持する（FR-004）', () => {
    const onChange = vi.fn()
    render(
      <Wrapper>
        <SlideMetaForm value={base} onChange={onChange} />
      </Wrapper>,
    )

    fireEvent.change(screen.getByLabelText(/アクセント色/), { target: { value: '#abcdef' } })

    const next = onChange.mock.calls[0][0] as PresentationData
    expect(next.theme?.colors?.accent).toBe('#abcdef')
    expect(next.theme?.colors?.primary).toBe('#111')
    expect((next.theme?.colors as Record<string, unknown>).custom9).toBe('#999')
    expect(next.theme?.customCSS).toBe('.x{}')
  })

  it('マスター選択は自由入力ではなくセレクトで、選択した masterKey を該当レイアウトの masterMap に設定する（#166）', () => {
    const onChange = vi.fn()
    const withMasters: PresentationData = {
      ...base,
      theme: { ...base.theme, masters: { footer: { decorations: [] } } },
    }
    render(
      <Wrapper>
        <SlideMetaForm value={withMasters} onChange={onChange} />
      </Wrapper>,
    )

    // レイアウト名（center）はセレクトの隣に表示され、綴りミスの心配がない固定候補として選べる
    const centerSelect = screen.getByRole('combobox', { name: 'マスター: center' })
    fireEvent.mouseDown(centerSelect)
    fireEvent.click(screen.getByRole('option', { name: 'footer' }))

    const next = onChange.mock.calls[0][0] as PresentationData
    expect(next.theme?.masterMap).toEqual({ center: 'footer' })
    // 対象外は保持
    expect(next.theme?.masters).toEqual(withMasters.theme?.masters)
    expect(next.theme?.colors).toEqual(withMasters.theme?.colors)
  })

  it('「なし」を選ぶと masterMap から該当レイアウトのキーを削除する（#166）', () => {
    const onChange = vi.fn()
    const withMasterMap: PresentationData = {
      ...base,
      theme: { ...base.theme, masters: { footer: { decorations: [] } }, masterMap: { center: 'footer' } },
    }
    render(
      <Wrapper>
        <SlideMetaForm value={withMasterMap} onChange={onChange} />
      </Wrapper>,
    )

    const centerSelect = screen.getByRole('combobox', { name: 'マスター: center' })
    fireEvent.mouseDown(centerSelect)
    fireEvent.click(screen.getByRole('option', { name: 'なし' }))

    const next = onChange.mock.calls[0][0] as PresentationData
    expect(next.theme?.masterMap).toEqual({})
  })
})
