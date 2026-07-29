import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { PdfExportOverlay } from '../PdfExportOverlay'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'
import type { ReactNode } from 'react'

const jaJP: LocaleResource = {
  languageCode: 'ja-JP',
  languageName: '日本語',
  ui: {
    toolbar: { pdfExporting: 'PDFを生成中…' },
  },
}

function Wrapper({ children }: { children: ReactNode }) {
  return (
    <I18nProvider locales={[jaJP]} defaultLocale="ja-JP">
      {children}
    </I18nProvider>
  )
}

describe('PdfExportOverlay', () => {
  it('open=true のとき生成中メッセージが表示される', () => {
    render(<PdfExportOverlay open={true} />, { wrapper: Wrapper })
    expect(screen.getByText('PDFを生成中…')).toBeDefined()
  })
})
