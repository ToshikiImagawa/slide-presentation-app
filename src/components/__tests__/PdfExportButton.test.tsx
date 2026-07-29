import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PdfExportButton } from '../PdfExportButton'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'
import type { ReactNode } from 'react'

const jaJP: LocaleResource = {
  languageCode: 'ja-JP',
  languageName: '日本語',
  ui: {
    toolbar: { pdfExport: 'PDFで保存', pdfExporting: 'PDFを生成中…', pdfExportError: 'PDFの書き出しに失敗しました' },
  },
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locales={[jaJP]} defaultLocale="ja-JP">
      {children}
    </I18nProvider>
  )
}

describe('PdfExportButton', () => {
  it('PDF書き出しボタンが表示される', () => {
    render(<PdfExportButton onClick={() => {}} state="idle" />, { wrapper: Wrapper })
    const button = screen.getByRole('button', { name: 'PDFで保存' })
    expect(button).toBeDefined()
  })

  it('クリックで onClick が呼ばれる', () => {
    const onClick = vi.fn()
    render(<PdfExportButton onClick={onClick} state="idle" />, { wrapper: Wrapper })

    const button = screen.getByRole('button')
    fireEvent.click(button)

    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('exporting 中はボタンが無効化され、ラベルが変わる', () => {
    render(<PdfExportButton onClick={() => {}} state="exporting" />, { wrapper: Wrapper })
    const button = screen.getByRole('button', { name: 'PDFを生成中…' }) as HTMLButtonElement
    expect(button.disabled).toBe(true)
  })

  it('error 状態ではエラーラベルが表示される', () => {
    render(<PdfExportButton onClick={() => {}} state="error" />, { wrapper: Wrapper })
    const button = screen.getByRole('button', { name: 'PDFの書き出しに失敗しました' }) as HTMLButtonElement
    expect(button.disabled).toBe(false)
  })
})
