import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type { ReactNode } from 'react'
import { BrandConfirmDialog } from '../BrandConfirmDialog'
import { I18nProvider } from '../../i18n'
import type { LocaleResource } from '../../i18n'
import type { BrandOverrides, BrandPlaceholderKind, BrandProfile, CompiledBrandTheme, MappedColorKey, PlaceholderProfile, PlaceholderTextProps } from '../../brand/types'
import type { SlideData } from '../../data'

function wrap(ui: ReactNode, localeUi: LocaleResource['ui'] = {}) {
  const locales: LocaleResource[] = [{ languageCode: 'ja-JP', languageName: '日本語', ui: localeUi }]
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
    textCandidates: [],
    markCandidates: [],
    embeddedFonts: [],
    mappedColors,
    fonts: { major: { latin: 'Trebuchet MS', ea: null, cs: null, jpan: null }, minor: { latin: 'Calibri', ea: null, cs: null, jpan: null } },
    masters: [],
    ...overrides,
  }
}

/** slideLayout の1プレースホルダ（既定文字プロパティは Rust 側で継承解決済みの形。#316）。
 * 矩形（#317）は既定 `null`（未指定）で、必要なテストだけ `rect` で明示する */
function placeholder(kind: BrandPlaceholderKind, phType: string | null, text: Partial<PlaceholderTextProps> = {}, rect: Partial<Pick<PlaceholderProfile, 'xEmu' | 'yEmu' | 'cxEmu' | 'cyEmu'>> = {}): PlaceholderProfile {
  return {
    phType,
    idx: null,
    kind,
    text: { latin: null, ea: null, cs: null, sizePt: null, bold: null, colorHex: null, fontOrigin: 'none', ...text },
    xEmu: null,
    yEmu: null,
    cxEmu: null,
    cyEmu: null,
    ...rect,
  }
}

/** 表紙・本文の2枠ぶんの layout を持ち、実書体と文字サイズが `a:defRPr` にしかないテンプレート（#316） */
function profileWithDefRprLayouts(): BrandProfile {
  return buildProfile({
    fonts: { major: { latin: 'Calibri Light', ea: null, cs: null, jpan: '游ゴシック Light' }, minor: { latin: 'Calibri', ea: null, cs: null, jpan: '游ゴシック' } },
    masters: [
      {
        part: 'ppt/slideMasters/slideMaster1.xml',
        mappedColors: buildProfile().mappedColors,
        slideLayouts: [
          {
            part: 'ppt/slideLayouts/slideLayout1.xml',
            name: 'Title Slide',
            layoutType: 'title',
            backgroundColorHex: null,
            placeholders: [placeholder('title', 'ctrTitle', { latin: 'Corporate Display', ea: 'コーポレート見出し', sizePt: 40, fontOrigin: 'defRPr' })],
          },
          {
            part: 'ppt/slideLayouts/slideLayout2.xml',
            name: 'Content',
            layoutType: 'obj',
            backgroundColorHex: null,
            placeholders: [placeholder('title', 'title', { latin: 'Corporate Display', sizePt: 24, fontOrigin: 'defRPr' }), placeholder('body', 'body', { latin: 'Corporate Text', ea: 'コーポレート本文', sizePt: 18, fontOrigin: 'defRPr' })],
          },
        ],
      },
    ],
  })
}

const DEF_RPR_ASSIGNMENTS: BrandOverrides = { layoutAssignments: { '0:0': 'center', '0:1': 'content' } }

/** `content` 枠に割り当てる、非対称な矩形の本文プレースホルダを1つだけ持つテンプレート（#317） */
function profileWithContentBodyRect(): BrandProfile {
  return buildProfile({
    masters: [
      {
        part: 'ppt/slideMasters/slideMaster1.xml',
        mappedColors: buildProfile().mappedColors,
        slideLayouts: [
          {
            part: 'ppt/slideLayouts/slideLayout1.xml',
            name: 'Content',
            layoutType: 'obj',
            backgroundColorHex: null,
            placeholders: [placeholder('body', 'body', {}, { xEmu: 609_600, yEmu: 1_143_000, cxEmu: 10_363_200, cyEmu: 5_029_200 })],
          },
        ],
      },
    ],
  })
}

const CONTENT_ASSIGNMENT: BrandOverrides = { layoutAssignments: { '0:0': 'content' } }

function renderDialog(props: { profile?: BrandProfile; initialOverrides?: BrandOverrides; localeUi?: LocaleResource['ui'] } = {}) {
  const onApply = vi.fn()
  const onCancel = vi.fn()
  render(wrap(<BrandConfirmDialog open profile={props.profile ?? buildProfile()} initialOverrides={props.initialOverrides ?? {}} previewSlide={PREVIEW_SLIDE} onApply={onApply} onCancel={onCancel} />, props.localeUi))
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

  it('ブランドマーク候補が無ければ検出されなかった旨を表示する（#346）', () => {
    renderDialog()
    expect(screen.getByText('ブランドマークは検出されませんでした')).toBeTruthy()
  })

  it('ブランドマーク候補をチェックして取り込むと selectedMarkIndices が渡る（#346）', () => {
    const profile = buildProfile({
      markCandidates: [
        {
          shapes: [
            { xEmu: 0, yEmu: 0, widthEmu: 300_000, heightEmu: 300_000, colorHex: '#1f4e79', isCircle: true },
            { xEmu: 400_000, yEmu: 0, widthEmu: 300_000, heightEmu: 300_000, colorHex: '#1f4e79', isCircle: true },
          ],
        },
      ],
    })
    const { onApply } = renderDialog({ profile })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }))
    const arg = onApply.mock.calls[0][0] as { overrides: BrandOverrides }
    expect(arg.overrides.selectedMarkIndices).toEqual([0])
  })

  it('固定テキスト候補が無ければ検出されなかった旨を表示する（#318）', () => {
    renderDialog()
    expect(screen.getByText('固定テキストは検出されませんでした')).toBeTruthy()
  })

  it('固定テキスト候補をチェックして取り込むと selectedTextIndices が渡る（#318）', () => {
    const profile = buildProfile({
      textCandidates: [{ content: '© 2026 Acme Corp', xEmu: 457_200, yEmu: 6_400_800, widthEmu: 5_000_000, heightEmu: 300_000, sizePt: 10, colorHex: '#808080' }],
    })
    const { onApply } = renderDialog({ profile })
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }))
    const arg = onApply.mock.calls[0][0] as { overrides: BrandOverrides }
    expect(arg.overrides.selectedTextIndices).toEqual([0])
  })

  it('`{index}` を含む候補をチェックすると表示形式が選べ、indexTotal を選ぶと textIndexFormats が渡る（#318）', () => {
    const profile = buildProfile({
      textCandidates: [{ content: 'Acme Corp — {index}', xEmu: 457_200, yEmu: 6_400_800, widthEmu: 5_000_000, heightEmu: 300_000, sizePt: null, colorHex: null }],
    })
    const { onApply } = renderDialog({ profile })
    fireEvent.click(screen.getByRole('checkbox'))

    const formatSelect = screen.getByRole('combobox', { name: /Acme Corp/ })
    fireEvent.mouseDown(formatSelect)
    fireEvent.click(screen.getByRole('option', { name: '{index}/{total}' }))

    fireEvent.click(screen.getByRole('button', { name: '取り込む' }))
    const arg = onApply.mock.calls[0][0] as { overrides: BrandOverrides }
    expect(arg.overrides.selectedTextIndices).toEqual([0])
    expect(arg.overrides.textIndexFormats).toEqual({ '0': 'indexTotal' })
  })

  it('`{index}` を含まない候補は表示形式のセレクトを出さない（#318）', () => {
    const profile = buildProfile({
      textCandidates: [{ content: '固定テキスト', xEmu: 0, yEmu: 0, widthEmu: 500_000, heightEmu: 200_000, sizePt: null, colorHex: null }],
    })
    renderDialog({ profile })
    fireEvent.click(screen.getByRole('checkbox'))
    expect(screen.queryByRole('combobox', { name: /固定テキスト/ })).toBeNull()
  })

  it('埋め込みフォントが無ければ検出されなかった旨を表示する（#318）', () => {
    renderDialog()
    expect(screen.getByText('埋め込みフォントは検出されませんでした')).toBeTruthy()
  })

  it('埋め込みフォント名を表示する。Bold を持つ書体は Bold 表記を付ける（#318）', () => {
    const profile = buildProfile({
      embeddedFonts: [
        { typeface: 'Corporate Sans', hasRegular: true, hasBold: true, payload: null },
        { typeface: 'Corporate Sans Light', hasRegular: true, hasBold: false, payload: null },
      ],
    })
    renderDialog({ profile })
    expect(screen.getByText('Corporate Sans（Bold）')).toBeTruthy()
    expect(screen.getByText('Corporate Sans Light')).toBeTruthy()
  })

  it('実体を取り込めない書体は「実体を取り込めません」と表示し、チェックボックスを出さない（#321）', () => {
    const profile = buildProfile({
      embeddedFonts: [{ typeface: 'Corporate Sans', hasRegular: true, hasBold: false, payload: null }],
    })
    renderDialog({ profile })
    expect(screen.getByText('実体を取り込めません（書体名のみ登録）')).toBeTruthy()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })

  it('実体を取り込むチェックを入れると既定区分 internal-only で src を書いた FontSource が渡る（#171/#321）', () => {
    const payload = { contentType: 'font/otf', base64: 'ZmFrZS1jZmYtb3V0bGluZS1kYXRh' }
    const profile = buildProfile({
      embeddedFonts: [{ typeface: 'Corporate Sans', hasRegular: true, hasBold: false, payload }],
    })
    const { onApply } = renderDialog({ profile })

    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: '取り込む' }))

    const arg = onApply.mock.calls[0][0] as { overrides: BrandOverrides; compiled: CompiledBrandTheme }
    expect(arg.overrides.embeddedFontRedistribution).toEqual({ '0': 'internal-only' })
    expect(arg.compiled.fonts.sources).toEqual([{ family: 'Corporate Sans', localName: 'Corporate Sans', src: `data:font/otf;base64,${payload.base64}`, format: 'opentype', redistribution: 'internal-only' }])
  })

  it('区分を prohibited に変更すると src を含まない FontSource が渡る（#171/#321）', () => {
    const payload = { contentType: 'font/otf', base64: 'ZmFrZS1jZmYtb3V0bGluZS1kYXRh' }
    const profile = buildProfile({
      embeddedFonts: [{ typeface: 'Corporate Sans', hasRegular: true, hasBold: false, payload }],
    })
    const { onApply } = renderDialog({ profile })

    fireEvent.click(screen.getByRole('checkbox'))
    const redistributionSelect = screen.getByRole('combobox', { name: /Corporate Sans の再配布ライセンス区分/ })
    fireEvent.mouseDown(redistributionSelect)
    fireEvent.click(screen.getByRole('option', { name: '再配布不可（prohibited）' }))

    fireEvent.click(screen.getByRole('button', { name: '取り込む' }))
    const arg = onApply.mock.calls[0][0] as { overrides: BrandOverrides; compiled: CompiledBrandTheme }
    expect(arg.overrides.embeddedFontRedistribution).toEqual({ '0': 'prohibited' })
    expect(arg.compiled.fonts.sources).toEqual([{ family: 'Corporate Sans', localName: 'Corporate Sans', redistribution: 'prohibited' }])
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

  it('レイアウト枠の選択肢ラベルが locale 経由で解決される（#338）', () => {
    const profile = buildProfile({
      masters: [
        {
          part: 'ppt/slideMasters/slideMaster1.xml',
          mappedColors: buildProfile().mappedColors,
          slideLayouts: [{ part: 'ppt/slideLayouts/slideLayout1.xml', name: 'Section Divider', layoutType: 'secHead', placeholders: [], backgroundColorHex: '#000000' }],
        },
      ],
    })
    renderDialog({ profile, localeUi: { brand: { layoutSlotCenterSection: 'Title (Section) EN' } } })

    const layoutSelect = screen.getByRole('combobox', { name: /Section Divider/ })
    fireEvent.mouseDown(layoutSelect)
    expect(screen.getByRole('option', { name: 'Title (Section) EN' })).toBeTruthy()
    expect(screen.queryByRole('option', { name: 'タイトル（セクション）' })).toBeNull()
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

  describe('レイアウト割り当ての推薦（#372）', () => {
    function profileWithTitleOnlyLayout(): BrandProfile {
      return buildProfile({
        masters: [
          {
            part: 'ppt/slideMasters/slideMaster1.xml',
            mappedColors: buildProfile().mappedColors,
            slideLayouts: [{ part: 'ppt/slideLayouts/slideLayout1.xml', name: 'Title Slide', layoutType: 'title', backgroundColorHex: null, placeholders: [placeholder('title', 'ctrTitle')] }],
          },
        ],
      })
    }

    it('確認ダイアログを開いた時点で、確度の高いレイアウトに枠が初期選択されている', () => {
      renderDialog({ profile: profileWithTitleOnlyLayout() })
      const layoutSelect = screen.getByRole('combobox', { name: /Title Slide/ })
      expect(layoutSelect.textContent).toBe('タイトル')
    })

    it('推薦値には人の上書きと区別できる表示（推薦チップ）が付く', () => {
      renderDialog({ profile: profileWithTitleOnlyLayout() })
      expect(screen.getByText('推薦')).toBeTruthy()
      expect(screen.queryByText('人が選択')).toBeNull()
    })

    it('人が明示的に選び直すと推薦チップが消え、上書きの表示に切り替わる', () => {
      const { onApply } = renderDialog({ profile: profileWithTitleOnlyLayout() })
      const layoutSelect = screen.getByRole('combobox', { name: /Title Slide/ })
      fireEvent.mouseDown(layoutSelect)
      fireEvent.click(screen.getByRole('option', { name: '本文' }))

      expect(screen.queryByText('推薦')).toBeNull()
      expect(screen.getByText('人が選択')).toBeTruthy()

      fireEvent.click(screen.getByRole('button', { name: '取り込む' }))
      const arg = onApply.mock.calls[0][0] as { overrides: BrandOverrides; compiled: CompiledBrandTheme }
      expect(arg.overrides.layoutAssignments).toEqual({ '0:0': 'content' })
    })

    it('人が明示的に「未割当」を選ぶと、推薦があっても未割当のままになる（推薦へ戻らない）', () => {
      const { onApply } = renderDialog({ profile: profileWithTitleOnlyLayout() })
      const layoutSelect = screen.getByRole('combobox', { name: /Title Slide/ })
      fireEvent.mouseDown(layoutSelect)
      fireEvent.click(screen.getByRole('option', { name: '未割当' }))

      expect(layoutSelect.textContent).toBe('未割当')
      expect(screen.queryByText('推薦')).toBeNull()
      expect(screen.queryByText('人が選択')).toBeNull()

      fireEvent.click(screen.getByRole('button', { name: '取り込む' }))
      const arg = onApply.mock.calls[0][0] as { overrides: BrandOverrides; compiled: CompiledBrandTheme }
      expect(arg.overrides.layoutAssignments).toEqual({ '0:0': null })
      // 未割当なので center 用の brand-<slug> master は作られない
      expect(Object.keys(arg.compiled.masters)).toEqual(['brand'])
    })

    it('推薦が0件（確信が持てない構成）のとき、初期選択は現行と同一（未割当）', () => {
      const profile = buildProfile({
        masters: [
          {
            part: 'ppt/slideMasters/slideMaster1.xml',
            mappedColors: buildProfile().mappedColors,
            slideLayouts: [{ part: 'ppt/slideLayouts/slideLayout1.xml', name: 'Section Divider', layoutType: 'secHead', placeholders: [], backgroundColorHex: '#000000' }],
          },
        ],
      })
      renderDialog({ profile })
      const layoutSelect = screen.getByRole('combobox', { name: /Section Divider/ })
      expect(layoutSelect.textContent).toBe('未割当')
      expect(screen.queryByText('推薦')).toBeNull()
    })

    it('別レイアウトの人の上書きが推薦の枠を奪った場合、表示も未割当に切り替わる（取り込み結果と表示の食い違いを防ぐ）', () => {
      const profile = buildProfile({
        masters: [
          {
            part: 'ppt/slideMasters/slideMaster1.xml',
            mappedColors: buildProfile().mappedColors,
            slideLayouts: [
              { part: 'ppt/slideLayouts/slideLayout1.xml', name: 'Title Slide', layoutType: 'title', backgroundColorHex: null, placeholders: [placeholder('title', 'ctrTitle')] },
              { part: 'ppt/slideLayouts/slideLayout2.xml', name: 'Custom Layout', layoutType: 'obj', backgroundColorHex: null, placeholders: [] },
            ],
          },
        ],
      })
      const { onApply } = renderDialog({ profile })

      // '0:1'（Custom Layout）を人が明示的に center へ割り当てると、'0:0'（Title Slide）が推薦していた
      // center を奪う。'0:0' 側は表示上も未割当へ戻るべき（compile.ts の resolveAssignedLayouts と同じ判定）
      const customLayoutSelect = screen.getByRole('combobox', { name: /Custom Layout/ })
      fireEvent.mouseDown(customLayoutSelect)
      fireEvent.click(screen.getByRole('option', { name: 'タイトル' }))

      const titleSlideSelect = screen.getByRole('combobox', { name: /Title Slide/ })
      expect(titleSlideSelect.textContent).toBe('未割当')

      fireEvent.click(screen.getByRole('button', { name: '取り込む' }))
      const arg = onApply.mock.calls[0][0] as { overrides: BrandOverrides; compiled: CompiledBrandTheme }
      expect(arg.overrides.layoutAssignments).toEqual({ '0:1': 'center' })
      expect(arg.compiled.masterMap.center).toBe('brand-custom-layout-0-1')
    })
  })

  describe('書体と型階層（#316）', () => {
    it('決定された書体（defRPr 由来）と決定根拠を表示する', () => {
      renderDialog({ profile: profileWithDefRprLayouts(), initialOverrides: DEF_RPR_ASSIGNMENTS })
      expect((screen.getByLabelText('見出し書体（欧文）') as HTMLInputElement).value).toBe('Corporate Display')
      expect((screen.getByLabelText('見出し書体（和文）') as HTMLInputElement).value).toBe('コーポレート見出し')
      expect((screen.getByLabelText('本文書体（欧文）') as HTMLInputElement).value).toBe('Corporate Text')
      // 決定根拠（defRPr 由来）が report の detail として出る
      expect(screen.getAllByText(/defRPr 由来/).length).toBeGreaterThan(0)
    })

    it('決定された型階層（基準サイズと段）を表示する', () => {
      renderDialog({ profile: profileWithDefRprLayouts(), initialOverrides: DEF_RPR_ASSIGNMENTS })
      // 本文 18pt を px 換算した 24px が基準サイズ、表紙タイトル 40pt / 本文見出し 24pt が段の比率になる
      expect((screen.getByLabelText('基準サイズ（px）') as HTMLInputElement).value).toBe('24')
      expect((screen.getByLabelText('型階層 h1') as HTMLInputElement).value).toBe('2.222')
      expect((screen.getByLabelText('型階層 h3') as HTMLInputElement).value).toBe('1.333')
    })

    it('型階層の段ラベルが locale 経由で解決される（#338）', () => {
      renderDialog({ profile: profileWithDefRprLayouts(), initialOverrides: DEF_RPR_ASSIGNMENTS, localeUi: { brand: { fontSizeStepH1: 'Cover Title EN' } } })
      expect(screen.getByText('Cover Title EN')).toBeTruthy()
      expect(screen.queryByText('表紙タイトル')).toBeNull()
      // h3 は locale 未上書きのためフォールバック文言のまま表示される
      expect(screen.getByText('本文見出し')).toBeTruthy()
    })

    it('書体を上書きして取り込むと fontOverrides（欧文・和文）が渡る', () => {
      const { onApply } = renderDialog({ profile: profileWithDefRprLayouts(), initialOverrides: DEF_RPR_ASSIGNMENTS })
      const headingLatin = screen.getByLabelText('見出し書体（欧文）')
      fireEvent.change(headingLatin, { target: { value: 'Custom Sans' } })
      fireEvent.blur(headingLatin)
      const bodyEa = screen.getByLabelText('本文書体（和文）')
      fireEvent.change(bodyEa, { target: { value: 'カスタム本文' } })
      fireEvent.blur(bodyEa)
      fireEvent.click(screen.getByRole('button', { name: '取り込む' }))
      const arg = onApply.mock.calls[0][0] as { overrides: BrandOverrides; compiled: CompiledBrandTheme }
      expect(arg.overrides.fontOverrides).toMatchObject({ heading: 'Custom Sans', bodyEa: 'カスタム本文' })
      expect(arg.compiled.fonts.heading).toMatchObject({ latin: 'Custom Sans' })
      expect(arg.compiled.fonts.body).toMatchObject({ ea: 'カスタム本文' })
    })

    it('型階層（基準サイズ・段の比率）を上書きして取り込むと fontOverrides が渡る', () => {
      const { onApply } = renderDialog({ profile: profileWithDefRprLayouts(), initialOverrides: DEF_RPR_ASSIGNMENTS })
      const base = screen.getByLabelText('基準サイズ（px）')
      fireEvent.change(base, { target: { value: '20' } })
      fireEvent.blur(base)
      const h1 = screen.getByLabelText('型階層 h1')
      fireEvent.change(h1, { target: { value: '3' } })
      fireEvent.blur(h1)
      fireEvent.click(screen.getByRole('button', { name: '取り込む' }))
      const arg = onApply.mock.calls[0][0] as { overrides: BrandOverrides; compiled: CompiledBrandTheme }
      expect(arg.overrides.fontOverrides?.baseFontSize).toBe(20)
      expect(arg.overrides.fontOverrides?.fontSizeRatios).toEqual({ h1: 3 })
      expect(arg.compiled.fonts.baseFontSize).toBe(20)
      expect(arg.compiled.fonts.fontSizeRatios).toMatchObject({ h1: 3 })
    })

    it('不正な基準サイズを入れて blur してもコミットしない', () => {
      const { onApply } = renderDialog({ profile: profileWithDefRprLayouts(), initialOverrides: DEF_RPR_ASSIGNMENTS })
      const base = screen.getByLabelText('基準サイズ（px）')
      fireEvent.change(base, { target: { value: '0' } })
      fireEvent.blur(base)
      fireEvent.click(screen.getByRole('button', { name: '取り込む' }))
      const arg = onApply.mock.calls[0][0] as { overrides: BrandOverrides; compiled: CompiledBrandTheme }
      expect(arg.overrides.fontOverrides?.baseFontSize).toBeUndefined()
      expect(arg.compiled.fonts.baseFontSize).toBe(24)
    })

    it('型階層が検出されなければその旨を表示する（レイアウト未割当のテンプレート）', () => {
      renderDialog()
      expect(screen.getByText('型階層は検出されませんでした')).toBeTruthy()
    })
  })

  describe('セーフエリア（#317）', () => {
    it('content 枠の本文プレースホルダ矩形から導出した値を4辺の入力欄に表示する', () => {
      renderDialog({ profile: profileWithContentBodyRect(), initialOverrides: CONTENT_ASSIGNMENT })
      // left=64 / top=120 / right=128 / bottom=72（compile.test.ts の導出テストと同じ入力）
      expect((screen.getByLabelText('セーフエリア 上') as HTMLInputElement).value).toBe('120')
      expect((screen.getByLabelText('セーフエリア 右') as HTMLInputElement).value).toBe('128')
      expect((screen.getByLabelText('セーフエリア 下') as HTMLInputElement).value).toBe('72')
      expect((screen.getByLabelText('セーフエリア 左') as HTMLInputElement).value).toBe('64')
    })

    it('辺を編集して blur すると safeAreaOverrides として渡り、他の辺は導出値のまま残る', () => {
      const { onApply } = renderDialog({ profile: profileWithContentBodyRect(), initialOverrides: CONTENT_ASSIGNMENT })
      const top = screen.getByLabelText('セーフエリア 上')
      fireEvent.change(top, { target: { value: '10' } })
      fireEvent.blur(top)
      fireEvent.click(screen.getByRole('button', { name: '取り込む' }))
      const arg = onApply.mock.calls[0][0] as { overrides: BrandOverrides; compiled: CompiledBrandTheme }
      expect(arg.overrides.safeAreaOverrides).toEqual({ top: 10 })
      expect(arg.compiled.canvas?.safeArea).toEqual({ top: 10, left: 64, right: 128, bottom: 72 })
    })

    it('body プレースホルダが無く導出できない場合は空欄（既定60pxのプレースホルダ）で表示する', () => {
      renderDialog()
      expect((screen.getByLabelText('セーフエリア 上') as HTMLInputElement).value).toBe('')
    })
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
