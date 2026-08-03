import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { BrandConfirmDialog } from '../BrandConfirmDialog'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'
import type { BrandOverrides, BrandProfile, MappedColorKey } from '../../brand/types'
import type { SlideData } from '../../data'

// jsdom には ResizeObserver が無いので stub（SlidePreview が使用）
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as unknown as { ResizeObserver: typeof ResizeObserverStub }).ResizeObserver = ResizeObserverStub

const locales: LocaleResource[] = [{ languageCode: 'ja-JP', languageName: '日本語', ui: {} }]
function wrap(ui: ReactNode) {
  return (
    <I18nProvider locales={locales} defaultLocale="ja-JP">
      {ui}
    </I18nProvider>
  )
}

const PREVIEW_SLIDE: SlideData = { id: 's1', layout: 'center', content: { title: 'テストスライド' } }

function buildProfile(overrides: Partial<BrandProfile> = {}): BrandProfile {
  const mappedColors: Record<MappedColorKey, string | null> = {
    bg1: '#ffffff',
    tx1: '#000000',
    bg2: '#f2f2f2',
    tx2: '#44546a',
    accent1: '#1f4e79',
    accent2: '#ed7d31',
    accent3: '#a5a5a5',
    accent4: '#ffc000',
    accent5: '#5b9bd5',
    accent6: '#70ad47',
    hlink: '#0563c1',
    folHlink: '#954f72',
  }
  return {
    name: 'Corporate',
    themePart: 'ppt/theme/theme1.xml',
    slideMasterPart: 'ppt/slideMasters/slideMaster1.xml',
    templateHash: 'a'.repeat(64),
    slideSize: { widthEmu: 12_192_000, heightEmu: 6_858_000 },
    thumbnail: null,
    logoCandidates: [],
    bandCandidates: [],
    mappedColors,
    fonts: { major: { latin: 'Trebuchet MS', ea: null, cs: null, jpan: null }, minor: { latin: 'Calibri', ea: null, cs: null, jpan: null } },
    ...overrides,
  }
}

function renderDialog(props: { profile?: BrandProfile; initialOverrides?: BrandOverrides } = {}) {
  const onApply = vi.fn()
  const onCancel = vi.fn()
  render(wrap(<BrandConfirmDialog open profile={props.profile ?? buildProfile()} initialOverrides={props.initialOverrides ?? {}} previewSlide={PREVIEW_SLIDE} onApply={onApply} onCancel={onCancel} />))
  return { onApply, onCancel }
}

describe('BrandConfirmDialog（#168 並置比較・取り込み確認）', () => {
  it('サムネイルが無ければプレースホルダ文言を表示する', () => {
    renderDialog()
    expect(screen.getByText('サムネイルがありません')).toBeTruthy()
  })

  it('サムネイルがあれば実画像を表示する', () => {
    renderDialog({ profile: buildProfile({ thumbnail: { contentType: 'image/jpeg', base64: 'Zm9v' } }) })
    const img = screen.getByAltText('テンプレートのサムネイル') as HTMLImageElement
    expect(img.src).toContain('data:image/jpeg;base64,Zm9v')
  })

  it('12キー分の色見本と hex 入力欄を表示する', () => {
    renderDialog()
    expect(screen.getByDisplayValue('#1f4e79')).toBeTruthy() // accent1
    expect(screen.getByLabelText('accent1 hex')).toBeTruthy()
  })

  it('tx1/bg1 の組にコントラスト比と AA 判定を表示する', () => {
    renderDialog()
    // #000000 と #ffffff は 21:1 で AA を満たす
    expect(screen.getAllByText(/21\.00:1/).length).toBeGreaterThan(0)
    expect(screen.getAllByText('AA ✓').length).toBeGreaterThan(0)
  })

  it('hex 入力を変更して blur すると onApply に上書きが渡る', () => {
    const { onApply } = renderDialog()
    const input = screen.getByLabelText('accent1 hex') as HTMLInputElement
    fireEvent.change(input, { target: { value: '#ff0000' } })
    fireEvent.blur(input)
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }))
    expect(onApply).toHaveBeenCalledTimes(1)
    const arg = onApply.mock.calls[0][0] as { overrides: BrandOverrides }
    expect(arg.overrides.colorHex?.accent1).toBe('#ff0000')
  })

  it('不正な hex を入れて blur しても上書きは反映されない（コミットしない）', () => {
    const { onApply } = renderDialog()
    const input = screen.getByLabelText('accent1 hex') as HTMLInputElement
    fireEvent.change(input, { target: { value: 'not-a-color' } })
    fireEvent.blur(input)
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }))
    const arg = onApply.mock.calls[0][0] as { overrides: BrandOverrides }
    expect(arg.overrides.colorHex?.accent1).toBeUndefined()
  })

  it('ロゴ候補が無ければ「ロゴなし」のみ表示する', () => {
    renderDialog()
    expect(screen.getByLabelText('ロゴなし')).toBeTruthy()
  })

  it('ロゴ候補を選んで取り込むと selectedLogoIndex が渡る', () => {
    const profile = buildProfile({
      logoCandidates: [{ nameHint: 'Company Logo', image: { contentType: 'image/png', base64: 'Zm9v' }, widthEmu: 914_400, heightEmu: 304_800, xEmu: 0, yEmu: 0 }],
    })
    const { onApply } = renderDialog({ profile })
    fireEvent.click(screen.getByLabelText(/Company Logo/))
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }))
    const arg = onApply.mock.calls[0][0] as { overrides: BrandOverrides }
    expect(arg.overrides.selectedLogoIndex).toBe(0)
  })

  it('帯候補が無ければ検出されなかった旨を表示する', () => {
    renderDialog()
    expect(screen.getByText('帯は検出されませんでした')).toBeTruthy()
  })

  it('帯候補をチェックして取り込むと selectedBandIndices が渡る', () => {
    const profile = buildProfile({
      bandCandidates: [{ orientation: 'horizontal', anchor: 'top-center', colorHex: '#1f4e79', thicknessEmu: 457_200 }],
    })
    const { onApply } = renderDialog({ profile })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }))
    const arg = onApply.mock.calls[0][0] as { overrides: BrandOverrides }
    expect(arg.overrides.selectedBandIndices).toEqual([0])
  })

  it('前回保存済みの上書きを初期値として反映する（再取り込みで人手修正が保持される）', () => {
    renderDialog({ initialOverrides: { colorHex: { accent1: '#00ff00' } } })
    expect(screen.getByDisplayValue('#00ff00')).toBeTruthy()
  })

  it('[キャンセル] で onCancel を呼ぶ', () => {
    const { onCancel } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('抽出結果に生成 CSS 文字列が含まれない（compile 結果を渡すのみ）', () => {
    const { onApply } = renderDialog()
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }))
    const arg = onApply.mock.calls[0][0] as { compiled: unknown }
    expect(JSON.stringify(arg.compiled)).not.toContain('section[data-master')
  })
})
