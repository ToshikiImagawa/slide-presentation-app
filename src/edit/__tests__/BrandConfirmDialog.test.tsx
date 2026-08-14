import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { BrandConfirmDialog } from '../BrandConfirmDialog'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'
import type { BrandOverrides, BrandProfile, CompiledBrandTheme, MappedColorKey } from '../../brand/types'
import type { SlideData } from '../../data'

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
    masters: [],
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

  it('slideLayout が無ければ検出されなかった旨を表示する（#192）', () => {
    renderDialog()
    expect(screen.getByText('レイアウトは検出されませんでした')).toBeTruthy()
  })

  it('slideLayout を枠へ割り当てて取り込むと layoutAssignments が渡る（#192）', () => {
    const profile = buildProfile({
      masters: [
        {
          part: 'ppt/slideMasters/slideMaster1.xml',
          mappedColors: buildProfile().mappedColors,
          slideLayouts: [{ part: 'ppt/slideLayouts/slideLayout1.xml', name: 'Section Divider', layoutType: 'secHead', placeholders: [], backgroundColorHex: '#000000' }],
        },
      ],
    })
    const { onApply } = renderDialog({ profile })

    const layoutSelect = screen.getByRole('combobox', { name: /Section Divider/ })
    fireEvent.mouseDown(layoutSelect)
    fireEvent.click(screen.getByRole('option', { name: 'タイトル（セクション）' }))

    fireEvent.click(screen.getByRole('button', { name: '取り込む' }))
    const arg = onApply.mock.calls[0][0] as { overrides: BrandOverrides; compiled: CompiledBrandTheme }
    expect(arg.overrides.layoutAssignments).toEqual({ '0:0': 'center/section' })
    expect(arg.compiled.masterMap['center/section']).toBe('brand-section-divider-0-0')
    // backgroundColorHex（#000000）が fill 背景として配線される（#235）
    expect(arg.compiled.masters['brand-section-divider-0-0']).toEqual({ extends: 'brand', background: { type: 'fill', color: '#000000' } })
  })

  it('反転面・締め用の2枠が選択肢に表示される（#262）', () => {
    const profile = buildProfile({
      masters: [
        {
          part: 'ppt/slideMasters/slideMaster1.xml',
          mappedColors: buildProfile().mappedColors,
          slideLayouts: [{ part: 'ppt/slideLayouts/slideLayout1.xml', name: 'Dark Section', layoutType: 'secHead', placeholders: [], backgroundColorHex: '#000000' }],
        },
      ],
    })
    renderDialog({ profile })

    const layoutSelect = screen.getByRole('combobox', { name: /Dark Section/ })
    fireEvent.mouseDown(layoutSelect)
    expect(screen.getByRole('option', { name: '大メッセージ（全面塗り）' })).toBeTruthy()
    expect(screen.getByRole('option', { name: '締め' })).toBeTruthy()
  })

  it('center/message-inverse へ割り当てて取り込むと layoutAssignments と収束済みの文字色トークンが渡る（#262）', () => {
    const profile = buildProfile({
      masters: [
        {
          part: 'ppt/slideMasters/slideMaster1.xml',
          mappedColors: buildProfile().mappedColors,
          slideLayouts: [{ part: 'ppt/slideLayouts/slideLayout1.xml', name: 'Dark Section', layoutType: 'secHead', placeholders: [], backgroundColorHex: '#000000' }],
        },
      ],
    })
    const { onApply } = renderDialog({ profile })

    const layoutSelect = screen.getByRole('combobox', { name: /Dark Section/ })
    fireEvent.mouseDown(layoutSelect)
    fireEvent.click(screen.getByRole('option', { name: '大メッセージ（全面塗り）' }))

    fireEvent.click(screen.getByRole('button', { name: '取り込む' }))
    const arg = onApply.mock.calls[0][0] as { overrides: BrandOverrides; compiled: CompiledBrandTheme }
    expect(arg.overrides.layoutAssignments).toEqual({ '0:0': 'center/message-inverse' })
    const masterKey = arg.compiled.masterMap['center/message-inverse']
    // tx1 の既定値 #000000 は背景 #000000 と無コントラストなため、AA を満たす値へ調整されている
    expect(arg.compiled.tokens[masterKey]?.['theme-text-body']).not.toBe('#000000')
  })

  it('master が1枚のみなら「基準にするマスター」選択は表示しない（#300）', () => {
    renderDialog()
    expect(screen.queryByRole('combobox', { name: '基準にするマスター' })).toBeNull()
  })

  it('masterが複数あれば選択でき、取り込むと selectedMasterIndex が渡る（#300）', () => {
    const profile = buildProfile({
      masters: [
        { part: 'ppt/slideMasters/slideMaster1.xml', mappedColors: buildProfile().mappedColors, slideLayouts: [] },
        { part: 'ppt/slideMasters/slideMaster2.xml', mappedColors: { ...buildProfile().mappedColors, bg1: '#000000', tx1: '#ffffff' }, slideLayouts: [] },
      ],
    })
    const { onApply } = renderDialog({ profile })

    const masterSelect = screen.getByRole('combobox', { name: '基準にするマスター' })
    fireEvent.mouseDown(masterSelect)
    fireEvent.click(screen.getByRole('option', { name: /マスター 2/ }))

    fireEvent.click(screen.getByRole('button', { name: '取り込む' }))
    const arg = onApply.mock.calls[0][0] as { overrides: BrandOverrides; compiled: CompiledBrandTheme }
    expect(arg.overrides.selectedMasterIndex).toBe(1)
    expect(arg.compiled.colors.bg1).toBe('#000000')
  })

  it('ライト/ダークを明示指定でき、取り込むと colorScheme が渡る（#300）', () => {
    const { onApply } = renderDialog()
    fireEvent.click(screen.getByLabelText('ダーク'))
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }))
    const arg = onApply.mock.calls[0][0] as { overrides: BrandOverrides; compiled: CompiledBrandTheme }
    expect(arg.overrides.colorScheme).toBe('dark')
    // 既定は bg1=#ffffff/tx1=#000000（ライト）なので、dark 指定で反転している
    expect(arg.compiled.colors.bg1).toBe('#000000')
    expect(arg.compiled.colors.tx1).toBe('#ffffff')
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
