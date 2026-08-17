import { describe, expect, it } from 'vitest'
import { getContrastRatio } from '../../applyTheme'
import { compile, mergeCompiledBrandTheme } from '../compile'
import type { BrandOverrides, BrandPlaceholderKind, BrandProfile, CompiledBrandTheme, MappedColorKey, PlaceholderProfile, PlaceholderTextProps } from '../types'

function profile(overrides: Partial<BrandProfile> = {}): BrandProfile {
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
    embeddedFonts: [],
    mappedColors,
    fonts: { major: { latin: 'Trebuchet MS', ea: null, cs: null, jpan: null }, minor: { latin: 'Calibri', ea: null, cs: null, jpan: null } },
    masters: [],
    ...overrides,
  }
}

/** slideLayout の1プレースホルダ（`kind` と既定文字プロパティは Rust 側で解決済みの形。#316）。
 * `kind` を `phType` から導出せず明示するのは、Rust の分類結果をそのまま受け取る契約を写すため。
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

describe('compile（#168 の並置比較・取り込み確認）', () => {
  it('抽出済みの12キーをそのまま採用し、ステータスを ok にする', () => {
    const { theme, report } = compile(profile(), {})
    expect(theme.colors.accent1).toBe('#1f4e79')
    expect(report.fields['colors.accent1']).toEqual({ status: 'ok' })
  })

  it('人の上書き（colorHex）を抽出値より優先し derived ではなく ok にする', () => {
    const overrides: BrandOverrides = { colorHex: { accent1: '#ff0000' } }
    const { theme, report } = compile(profile(), overrides)
    expect(theme.colors.accent1).toBe('#ff0000')
    expect(report.fields['colors.accent1']?.status).toBe('ok')
  })

  it('抽出できなかったキーは既定値で fallback として報告する', () => {
    const p = profile({ mappedColors: { ...profile().mappedColors, hlink: null } })
    const { theme, report } = compile(p, {})
    expect(theme.colors.hlink).toBeTruthy()
    expect(report.fields['colors.hlink']?.status).toBe('fallback')
  })

  it('生成 CSS 文字列を出力しない（値のみのトークン）', () => {
    const { theme } = compile(profile(), {})
    const serialized = JSON.stringify(theme)
    expect(serialized).not.toMatch(/section\[data-master/)
    expect(serialized).not.toContain(';')
  })

  describe('複数masterの選択（#300）', () => {
    const darkMappedColors: Record<MappedColorKey, string | null> = {
      ...profile().mappedColors,
      bg1: '#000000',
      tx1: '#ffffff',
      bg2: '#333333',
      tx2: '#eeeeee',
    }
    const withTwoMasters = () =>
      profile({
        masters: [
          { part: 'ppt/slideMasters/slideMaster1.xml', mappedColors: profile().mappedColors, slideLayouts: [] },
          { part: 'ppt/slideMasters/slideMaster2.xml', mappedColors: darkMappedColors, slideLayouts: [] },
        ],
      })

    it('selectedMasterIndex 未指定なら profile.mappedColors（1枚目基準）を使う', () => {
      const { theme } = compile(withTwoMasters(), {})
      expect(theme.colors.bg1).toBe('#ffffff')
    })

    it('selectedMasterIndex で指定した master の12キーを基準にする', () => {
      const { theme } = compile(withTwoMasters(), { selectedMasterIndex: 1 })
      expect(theme.colors.bg1).toBe('#000000')
      expect(theme.colors.tx1).toBe('#ffffff')
    })

    it('存在しない masterIndex は profile.mappedColors にフォールバックする', () => {
      const { theme } = compile(withTwoMasters(), { selectedMasterIndex: 9 })
      expect(theme.colors.bg1).toBe('#ffffff')
    })

    it('colorHex による個別上書きは master 選択後も最終的に優先される', () => {
      const { theme } = compile(withTwoMasters(), { selectedMasterIndex: 1, colorHex: { bg1: '#ff00ff' } })
      expect(theme.colors.bg1).toBe('#ff00ff')
    })
  })

  describe('ライト/ダークの明示指定（#300）', () => {
    it('auto（既定）はテンプレートの extracted 値をそのまま使う', () => {
      const { theme } = compile(profile(), { colorScheme: 'auto' })
      expect(theme.colors.bg1).toBe('#ffffff')
      expect(theme.colors.tx1).toBe('#000000')
    })

    it('既にライトなテンプレートに light を指定しても変化しない', () => {
      const { theme } = compile(profile(), { colorScheme: 'light' })
      expect(theme.colors.bg1).toBe('#ffffff')
      expect(theme.colors.tx1).toBe('#000000')
    })

    it('ライトなテンプレートに dark を指定すると bg1⇄tx1・bg2⇄tx2 が入れ替わる', () => {
      const { theme } = compile(profile(), { colorScheme: 'dark' })
      expect(theme.colors.bg1).toBe('#000000')
      expect(theme.colors.tx1).toBe('#ffffff')
      expect(theme.colors.bg2).toBe('#44546a')
      expect(theme.colors.tx2).toBe('#f2f2f2')
      // 反転対象外のキーは変化しない
      expect(theme.colors.accent1).toBe('#1f4e79')
    })

    it('曖昧なケース（slideMaster を持たず既定写像で bg1=lt1 に決め打ちされた抽出結果）でも dark 指定で反転できる', () => {
      // 標準写像（`ClrMap::default`）は bg1=lt1/tx1=dk1 を機械的に割り当てるだけで、
      // 実際の意図がダークかどうかは判定できない。bg1/tx1 の実値そのもの（lt1/dk1）は正しく取れているため、
      // 入れ替えるだけで正しいダーク配色になる（Rust 側の変更なしにフロントだけで解決できる）
      const p = profile({ mappedColors: { ...profile().mappedColors, bg1: '#ffffff', tx1: '#000000' } })
      const { theme } = compile(p, { colorScheme: 'dark' })
      expect(theme.colors.bg1).toBe('#000000')
      expect(theme.colors.tx1).toBe('#ffffff')
    })

    it('selectedMasterIndex と併用でき、選択した master に対して反転が適用される', () => {
      const p = profile({
        masters: [{ part: 'ppt/slideMasters/slideMaster1.xml', mappedColors: { ...profile().mappedColors, bg1: '#111111', tx1: '#f0f0f0' }, slideLayouts: [] }],
      })
      const { theme } = compile(p, { selectedMasterIndex: 0, colorScheme: 'light' })
      expect(theme.colors.bg1).toBe('#f0f0f0')
      expect(theme.colors.tx1).toBe('#111111')
    })
  })

  describe('WCAG コントラスト収束', () => {
    it('AA を満たす組はそのまま変更しない', () => {
      const { theme, report } = compile(profile(), {})
      expect(getContrastRatio(theme.colors.tx1, theme.colors.bg1)).toBeGreaterThanOrEqual(4.5)
      expect(report.fields['colors.tx1']?.status).toBe('ok')
    })

    it('AA 未達（低コントラストな上書き）は閾値を満たすまで調整し derived として報告する', () => {
      // 背景 #ffffff に対し文字色 #eeeeee はコントラスト比 1.16 程度で AA に届かない
      const overrides: BrandOverrides = { colorHex: { tx1: '#eeeeee' } }
      const { theme, report } = compile(profile(), overrides)
      const ratio = getContrastRatio(theme.colors.tx1, theme.colors.bg1)
      expect(ratio).not.toBeNull()
      expect(ratio!).toBeGreaterThanOrEqual(4.5)
      expect(report.fields['colors.tx1']?.status).toBe('derived')
    })

    it('bg2/tx2 の組も個別に収束させる', () => {
      const overrides: BrandOverrides = { colorHex: { tx2: '#f0f0f0', bg2: '#ffffff' } }
      const { theme } = compile(profile(), overrides)
      expect(getContrastRatio(theme.colors.tx2, theme.colors.bg2)!).toBeGreaterThanOrEqual(4.5)
    })

    it('同じ入力から必ず同じ調整結果になる（決定的）', () => {
      const overrides: BrandOverrides = { colorHex: { tx1: '#dddddd' } }
      const first = compile(profile(), overrides).theme.colors.tx1
      for (let i = 0; i < 5; i++) {
        expect(compile(profile(), overrides).theme.colors.tx1).toBe(first)
      }
    })
  })

  describe('ロゴ', () => {
    const withLogo = () =>
      profile({
        logoCandidates: [{ nameHint: 'Company Logo', image: { contentType: 'image/png', base64: 'Zm9v' }, widthEmu: 914_400, heightEmu: 304_800, xEmu: 10_000_000, yEmu: 6_000_000 }],
      })

    it('未選択（selectedLogoIndex・manualLogo どちらも未指定）なら missing として報告し decorations も空', () => {
      const { theme, report } = compile(withLogo(), {})
      expect(theme.logo).toBeNull()
      expect(theme.masters.brand.decorations!).toHaveLength(0)
      expect(report.fields.logo?.status).toBe('missing')
    })

    it('selectedLogoIndex で選んだ候補が logo 装飾になる', () => {
      const { theme, report } = compile(withLogo(), { selectedLogoIndex: 0 })
      expect(theme.logo?.base64).toBe('Zm9v')
      expect(theme.masters.brand.decorations![0]).toMatchObject({ type: 'logo', anchor: 'bottom-right' })
      expect(report.fields.logo?.status).toBe('ok')
    })

    it('manualLogo が null（明示的にロゴなし）のときは selectedLogoIndex を無視する', () => {
      const { theme } = compile(withLogo(), { selectedLogoIndex: 0, manualLogo: null })
      expect(theme.logo).toBeNull()
    })

    it('manualLogo が指定されていれば候補より優先する', () => {
      const manual = { contentType: 'image/png', base64: 'YmFy' }
      const { theme } = compile(withLogo(), { selectedLogoIndex: 0, manualLogo: manual })
      expect(theme.logo?.base64).toBe('YmFy')
    })

    it('ロゴのEMU寸法をスライドサイズから 1280x720 基準の px へ換算する', () => {
      const { theme } = compile(withLogo(), { selectedLogoIndex: 0 })
      const logo = theme.masters.brand.decorations![0]
      expect(logo).toMatchObject({ type: 'logo' })
      if (logo.type === 'logo') {
        // widthEmu 914_400 / slideWidthEmu 12_192_000 * 1280 ≈ 96
        expect(logo.width).toBeCloseTo(96, 0)
        expect(logo.height).toBeCloseTo(32, 0)
      }
    })
  })

  describe('帯', () => {
    const withBands = () =>
      profile({
        bandCandidates: [
          { orientation: 'horizontal', anchor: 'top-center', colorHex: '#1f4e79', thicknessEmu: 457_200 },
          { orientation: 'vertical', anchor: 'middle-left', colorHex: '#ed7d31', thicknessEmu: 609_600 },
        ],
      })

    it('selectedBandIndices が空（既定）なら decorations に含めず missing として報告する', () => {
      const { theme, report } = compile(withBands(), {})
      expect(theme.masters.brand.decorations!).toHaveLength(0)
      expect(report.fields.bands?.status).toBe('missing')
    })

    it('選択した帯だけを decorations に含め、厚みを px 換算する', () => {
      const { theme, report } = compile(withBands(), { selectedBandIndices: [0] })
      expect(theme.masters.brand.decorations!).toHaveLength(1)
      const band = theme.masters.brand.decorations![0]
      expect(band).toMatchObject({ type: 'band', anchor: 'top-center', orientation: 'horizontal', color: '#1f4e79' })
      if (band.type === 'band') {
        // thicknessEmu 457_200 / slideHeightEmu 6_858_000 * 720 = 48
        expect(band.thickness).toBeCloseTo(48, 0)
      }
      expect(report.fields.bands?.status).toBe('ok')
    })

    it('検出された帯が無いテンプレートは missing として報告する（未検出と未選択を区別する detail）', () => {
      const { report } = compile(profile(), {})
      expect(report.fields.bands?.status).toBe('missing')
      expect(report.fields.bands?.detail).toContain('検出されなかった')
    })
  })

  describe('固定テキスト・ページ番号（#318）', () => {
    const withTexts = () =>
      profile({
        textCandidates: [
          { content: 'Acme Corp — {index}', xEmu: 0, yEmu: 0, widthEmu: 500_000, heightEmu: 200_000, sizePt: 10, colorHex: '#808080' },
          { content: '固定テキスト（ページ番号なし）', xEmu: 5_000_000, yEmu: 6_558_000, widthEmu: 2_192_000, heightEmu: 300_000, sizePt: null, colorHex: null },
        ],
      })

    it('selectedTextIndices が空（既定）なら decorations に含めず missing として報告する（現行と完全同一）', () => {
      const { theme, report } = compile(withTexts(), {})
      expect(theme.masters.brand.decorations!).toHaveLength(0)
      expect(report.fields['decorations.text']?.status).toBe('missing')
    })

    it('選択した候補だけを text 装飾として含め、矩形をアンカー+オフセットへ換算する', () => {
      const { theme, report } = compile(withTexts(), { selectedTextIndices: [0] })
      expect(theme.masters.brand.decorations!).toHaveLength(1)
      const text = theme.masters.brand.decorations![0]
      // xEmu=yEmu=0 のスライド左上角に接する矩形なので anchor は top-left・offset は (0,0)
      expect(text).toMatchObject({ type: 'text', anchor: 'top-left', offset: { x: 0, y: 0 }, color: '#808080' })
      if (text.type === 'text') {
        expect(text.fontSize).toBeCloseTo(13, 0) // 10pt → px（96dpi 相当の換算。10 * 96/72 ≈ 13.3）
      }
      expect(report.fields['decorations.text']?.status).toBe('ok')
    })

    it('横位置が中央かつ下端に接する矩形は bottom-center へ、水平オフセットは 0 になる', () => {
      const { theme } = compile(withTexts(), { selectedTextIndices: [1] })
      const text = theme.masters.brand.decorations!.find((d) => d.type === 'text')
      expect(text).toMatchObject({ type: 'text', anchor: 'bottom-center' })
      if (text?.type === 'text') {
        expect(text.offset?.x).toBeCloseTo(0, 0)
        expect(text.color).toBeUndefined()
        expect(text.fontSize).toBeUndefined()
      }
    })

    it('`{index}` を含む候補は既定で `{index}` のまま、`indexTotal` を指定すると `{index}/{total}` に展開する', () => {
      const asIndex = compile(withTexts(), { selectedTextIndices: [0] }).theme.masters.brand.decorations![0]
      expect(asIndex.type === 'text' && asIndex.content).toBe('Acme Corp — {index}')

      const asIndexTotal = compile(withTexts(), { selectedTextIndices: [0], textIndexFormats: { '0': 'indexTotal' } }).theme.masters.brand.decorations![0]
      expect(asIndexTotal.type === 'text' && asIndexTotal.content).toBe('Acme Corp — {index}/{total}')
    })

    it('`{index}` を含まない候補は `indexTotal` を指定しても内容が変わらない', () => {
      const { theme } = compile(withTexts(), { selectedTextIndices: [1], textIndexFormats: { '1': 'indexTotal' } })
      const text = theme.masters.brand.decorations!.find((d) => d.type === 'text')
      expect(text?.type === 'text' && text.content).toBe('固定テキスト（ページ番号なし）')
    })

    it('検出されたテキスト候補が無いテンプレートは missing として報告する（未検出と未選択を区別する detail）', () => {
      const { report } = compile(profile(), {})
      expect(report.fields['decorations.text']?.status).toBe('missing')
      expect(report.fields['decorations.text']?.detail).toContain('検出されなかった')
    })
  })

  describe('埋め込みフォント（#318）', () => {
    it('embeddedFonts が無ければ sources を積まず missing として報告する（既定で何も自動適用しない）', () => {
      const { theme, report } = compile(profile(), {})
      expect(theme.fonts.sources).toBeUndefined()
      expect(report.fields['fonts.embedded']?.status).toBe('missing')
    })

    it('embeddedFonts を localName のみの FontSource として登録する（src は持たせない）', () => {
      const p = profile({ embeddedFonts: [{ typeface: 'Corporate Sans', hasRegular: true, hasBold: true }] })
      const { theme, report } = compile(p, {})
      expect(theme.fonts.sources).toEqual([{ family: 'Corporate Sans', localName: 'Corporate Sans' }])
      expect(report.fields['fonts.embedded']?.status).toBe('derived')
    })

    it('同じ typeface が重複しても sources には1件だけ登録する', () => {
      const p = profile({
        embeddedFonts: [
          { typeface: 'Corporate Sans', hasRegular: true, hasBold: false },
          { typeface: 'Corporate Sans', hasRegular: true, hasBold: true },
        ],
      })
      const { theme } = compile(p, {})
      expect(theme.fonts.sources).toHaveLength(1)
    })
  })

  describe('キャンバス（#188）', () => {
    it('16:9（既定 profile）は canvas 1280x720（現行と完全同一）', () => {
      const { theme } = compile(profile(), {})
      expect(theme.canvas).toEqual({ width: 1280, height: 720 })
    })

    it('4:3 テンプレートは幅1280固定・実比率から高さ960を算出する', () => {
      const p = profile({ slideSize: { widthEmu: 9_144_000, heightEmu: 6_858_000 } })
      const { theme } = compile(p, {})
      expect(theme.canvas).toEqual({ width: 1280, height: 960 })
    })

    it('slideSize が無い場合は canvas を生成しない（既定の1280x720のまま）', () => {
      const p = profile({ slideSize: null })
      const { theme } = compile(p, {})
      expect(theme.canvas).toBeUndefined()
    })

    it('4:3 テンプレートのロゴ/帯の px 換算は実際の canvas 高さ（960）を基準にする', () => {
      const p = profile({
        slideSize: { widthEmu: 9_144_000, heightEmu: 6_858_000 },
        logoCandidates: [{ nameHint: 'Company Logo', image: { contentType: 'image/png', base64: 'Zm9v' }, widthEmu: 914_400, heightEmu: 304_800, xEmu: 10_000_000, yEmu: 6_000_000 }],
        bandCandidates: [{ orientation: 'horizontal', anchor: 'top-center', colorHex: '#1f4e79', thicknessEmu: 457_200 }],
      })
      const { theme } = compile(p, { selectedLogoIndex: 0, selectedBandIndices: [0] })

      const logo = theme.masters.brand.decorations!.find((d) => d.type === 'logo')
      // heightEmu 304_800 / slideHeightEmu 6_858_000 * canvasHeight(960) ≈ 43（720基準なら32）
      expect(logo?.type === 'logo' && logo.height).toBeCloseTo(43, 0)

      const band = theme.masters.brand.decorations!.find((d) => d.type === 'band')
      // thicknessEmu 457_200 / slideHeightEmu 6_858_000 * canvasHeight(960) = 64（720基準なら48）
      expect(band?.type === 'band' && band.thickness).toBeCloseTo(64, 0)
    })
  })

  describe('masterMap / tokens', () => {
    it('主要レイアウト種別すべてを合成した brand master へ割り当てる', () => {
      const { theme } = compile(profile(), {})
      expect(theme.masterMap.center).toBe('brand')
      expect(theme.masterMap.content).toBe('brand')
      expect(theme.masterMap['two-column']).toBe('brand')
      expect(theme.masterMap.bleed).toBe('brand')
    })

    it('tokens は brand master にスコープした CSS 変数（値のみ）を持つ', () => {
      const { theme } = compile(profile(), {})
      expect(theme.tokens.brand['theme-background']).toBe('#ffffff')
      expect(theme.tokens.brand['theme-primary']).toBe('#1f4e79')
    })

    it('12キーすべてが tokens に反映される（#186）: accent3〜6 は系列色、hlink/folHlink はリンク色へ', () => {
      const { theme } = compile(profile(), {})
      expect(theme.tokens.brand['theme-series-3']).toBe('#a5a5a5') // accent3
      expect(theme.tokens.brand['theme-series-4']).toBe('#ffc000') // accent4
      expect(theme.tokens.brand['theme-series-5']).toBe('#5b9bd5') // accent5
      expect(theme.tokens.brand['theme-series-6']).toBe('#70ad47') // accent6
      expect(theme.tokens.brand['theme-link']).toBe('#0563c1') // hlink
      expect(theme.tokens.brand['theme-link-visited']).toBe('#954f72') // folHlink
    })

    it('系列色へ機械的に割り当てた accent3〜6 は report で derived として報告する（#186）', () => {
      const { report } = compile(profile(), {})
      expect(report.fields['colors.accent3']?.status).toBe('derived')
      expect(report.fields['colors.accent4']?.status).toBe('derived')
      expect(report.fields['colors.accent5']?.status).toBe('derived')
      expect(report.fields['colors.accent6']?.status).toBe('derived')
      // 意味が明確な hlink/folHlink や accent1/accent2 は derived ではなく ok のまま
      expect(report.fields['colors.hlink']?.status).toBe('ok')
      expect(report.fields['colors.accent1']?.status).toBe('ok')
    })

    it('accent3〜6 が抽出できず既定値になった場合は derived ではなく fallback として報告する', () => {
      const p = profile({ mappedColors: { ...profile().mappedColors, accent3: null } })
      const { theme, report } = compile(p, {})
      expect(theme.colors.accent3).toBeTruthy()
      expect(report.fields['colors.accent3']?.status).toBe('fallback')
    })
  })

  describe('フォント', () => {
    it('抽出できた書体名を latin として採用する（#187）', () => {
      const { theme, report } = compile(profile(), {})
      expect(theme.fonts.heading).toEqual({ latin: 'Trebuchet MS' })
      expect(theme.fonts.body).toEqual({ latin: 'Calibri' })
      expect(report.fields['fonts.heading']?.status).toBe('ok')
    })

    it('ea/jpan も latin を潰さずに写す。jpan が定義されていれば ea より優先する（#187）', () => {
      const p = profile({ fonts: { major: { latin: 'Trebuchet MS', ea: 'MS PGothic', cs: null, jpan: 'MS PGothic (Jpan)' }, minor: { latin: 'Calibri', ea: 'MS PGothic', cs: null, jpan: null } } })
      const { theme } = compile(p, {})
      expect(theme.fonts.heading).toEqual({ latin: 'Trebuchet MS', ea: 'MS PGothic (Jpan)' })
      expect(theme.fonts.body).toEqual({ latin: 'Calibri', ea: 'MS PGothic' })
    })

    it('人の上書きを latin として優先する', () => {
      const { theme } = compile(profile(), { fontOverrides: { heading: 'Custom Sans' } })
      expect(theme.fonts.heading).toEqual({ latin: 'Custom Sans' })
    })

    it('抽出できなければ fallback として報告する', () => {
      const p = profile({ fonts: { major: { latin: null, ea: null, cs: null, jpan: null }, minor: { latin: null, ea: null, cs: null, jpan: null } } })
      const { theme, report } = compile(p, {})
      expect(theme.fonts.heading).toBeUndefined()
      expect(report.fields['fonts.heading']?.status).toBe('fallback')
    })
  })

  describe('defRPr 由来の書体と型階層（#316）', () => {
    /** `a:fontScheme` は Office 既定のまま（欧文が汎用書体・和文が Office 既定の書体）で、実書体は
     * slideLayout のプレースホルダの `a:defRPr` にしか書かれていないテンプレート */
    const officeDefaultFontScheme = {
      major: { latin: 'Calibri Light', ea: null, cs: null, jpan: '游ゴシック Light' },
      minor: { latin: 'Calibri', ea: null, cs: null, jpan: '游ゴシック' },
    }

    /** 表紙 / 章 / 本文の3枠ぶんの layout を持つテンプレート。プレースホルダの既定文字プロパティが
     * `defRPr` 由来（実測値）であることを `fontOrigin` で表す */
    const withDefRprLayouts = () =>
      profile({
        fonts: officeDefaultFontScheme,
        masters: [
          {
            part: 'ppt/slideMasters/slideMaster1.xml',
            mappedColors: profile().mappedColors,
            slideLayouts: [
              {
                part: 'ppt/slideLayouts/slideLayout1.xml',
                name: 'Title Slide',
                layoutType: 'title',
                backgroundColorHex: null,
                placeholders: [
                  placeholder('title', 'ctrTitle', { latin: 'Corporate Display', ea: 'コーポレート見出し', sizePt: 40, bold: true, fontOrigin: 'defRPr' }),
                  placeholder('body', 'subTitle', { latin: 'Corporate Text', sizePt: 20, fontOrigin: 'defRPr' }),
                ],
              },
              {
                part: 'ppt/slideLayouts/slideLayout2.xml',
                name: 'Section Divider',
                layoutType: 'secHead',
                backgroundColorHex: null,
                placeholders: [placeholder('title', 'title', { latin: 'Corporate Display', sizePt: 32, fontOrigin: 'defRPr' })],
              },
              {
                part: 'ppt/slideLayouts/slideLayout3.xml',
                name: 'Content',
                layoutType: 'obj',
                backgroundColorHex: null,
                placeholders: [
                  placeholder('title', 'title', { latin: 'Corporate Display', sizePt: 24, fontOrigin: 'defRPr' }),
                  // 属性省略（phType が null）は OOXML の既定値 "body" として扱う
                  placeholder('body', null, { latin: 'Corporate Text', ea: 'コーポレート本文', sizePt: 18, fontOrigin: 'defRPr' }),
                ],
              },
            ],
          },
        ],
      })

    const allAssigned: BrandOverrides = { layoutAssignments: { '0:0': 'center', '0:1': 'center/section', '0:2': 'content' } }

    it('fontScheme が Office 既定のままでも defRPr の実書体を fonts.heading / fonts.body に採る', () => {
      const { theme } = compile(withDefRprLayouts(), allAssigned)
      expect(theme.fonts.heading).toEqual({ latin: 'Corporate Display', ea: 'コーポレート見出し', weight: '700' })
      expect(theme.fonts.body).toEqual({ latin: 'Corporate Text', ea: 'コーポレート本文' })
    })

    it('書体の決定根拠を report に出す（defRPr 由来は derived）', () => {
      const { report } = compile(withDefRprLayouts(), allAssigned)
      expect(report.fields['fonts.heading']?.status).toBe('derived')
      expect(report.fields['fonts.heading']?.detail).toContain('defRPr')
      expect(report.fields['fonts.body']?.status).toBe('derived')
    })

    it('fontScheme に実書体が書かれているテンプレート（defRPr 無し）は fontScheme 由来のまま ok として報告する', () => {
      // defRPr が無いプレースホルダについて、Rust 側は fontScheme へフォールバック済みの値を
      // fontOrigin: 'fontScheme' として返す（major = Trebuchet MS / minor = Calibri）
      const p = withDefRprLayouts()
      p.fonts = profile().fonts
      p.masters[0].slideLayouts = p.masters[0].slideLayouts.map((layout) => ({
        ...layout,
        placeholders: layout.placeholders.map((ph) => placeholder(ph.kind, ph.phType, { latin: ph.kind === 'title' ? 'Trebuchet MS' : 'Calibri', sizePt: ph.text.sizePt, fontOrigin: 'fontScheme' })),
      }))
      const { theme, report } = compile(p, allAssigned)
      expect(theme.fonts.heading).toEqual({ latin: 'Trebuchet MS' })
      expect(theme.fonts.body).toEqual({ latin: 'Calibri' })
      expect(report.fields['fonts.heading']?.status).toBe('ok')
      expect(report.fields['fonts.heading']?.detail).toContain('fontScheme')
    })

    it('割り当て済みレイアウトの文字サイズから baseFontSize と fontSizeRatios を導出する', () => {
      const { theme, report } = compile(withDefRprLayouts(), allAssigned)
      // 本文（content 枠の body）18pt を基準にし、スライド実寸から px へ換算する（16:9 既定は 1pt ≒ 1.333px）
      expect(theme.fonts.baseFontSize).toBe(24)
      // 表紙タイトル40pt / 章タイトル32pt / 本文見出し24pt を 18pt に対する比率で写す
      expect(theme.fonts.fontSizeRatios).toEqual({ h1: 2.222, h2: 1.778, h3: 1.333 })
      expect(report.fields['fonts.fontSizeRatios']?.status).toBe('derived')
      expect(report.fields['fonts.baseFontSize']?.status).toBe('derived')
    })

    it('本文枠だけを割り当てた場合も、その枠のタイトルから段（h3）が取れる', () => {
      const { theme } = compile(withDefRprLayouts(), { layoutAssignments: { '0:2': 'content' } })
      expect(theme.fonts.fontSizeRatios).toEqual({ h3: 1.333 })
    })

    it('本文の段しか取れない（型階層が1段）場合は fontSizeRatios を出さず missing として報告する', () => {
      const p = withDefRprLayouts()
      // 本文プレースホルダだけの layout（タイトルの段が無い）
      p.masters[0].slideLayouts = [{ ...p.masters[0].slideLayouts[2], placeholders: [placeholder('body', null, { latin: 'Corporate Text', sizePt: 18, fontOrigin: 'defRPr' })] }]
      const { theme, report } = compile(p, { layoutAssignments: { '0:0': 'content' } })
      expect(theme.fonts.fontSizeRatios).toBeUndefined()
      expect(theme.fonts.baseFontSize).toBe(24)
      expect(report.fields['fonts.fontSizeRatios']?.status).toBe('missing')
    })

    it('未割当のレイアウトのプレースホルダは無視する（書体・型階層とも fontScheme と既定のまま）', () => {
      const { theme, report } = compile(withDefRprLayouts(), {})
      expect(theme.fonts.heading).toEqual({ latin: 'Calibri Light', ea: '游ゴシック Light' })
      expect(theme.fonts.baseFontSize).toBeUndefined()
      expect(theme.fonts.fontSizeRatios).toBeUndefined()
      expect(report.fields['fonts.baseFontSize']?.status).toBe('missing')
    })

    it('本文枠（content/two-column/bleed）以外の body プレースホルダは基準サイズに採らない', () => {
      // center 枠の body はサブタイトル（20pt）であって本文の段ではない
      const { theme } = compile(withDefRprLayouts(), { layoutAssignments: { '0:0': 'center' } })
      expect(theme.fonts.baseFontSize).toBeUndefined()
    })

    it('人の上書きは defRPr 由来の値より優先する（欧文・和文・基準サイズ・段の比率）', () => {
      const overrides: BrandOverrides = {
        ...allAssigned,
        fontOverrides: { heading: 'Custom Sans', headingEa: 'カスタム見出し', baseFontSize: 20, fontSizeRatios: { h1: 3 } },
      }
      const { theme, report } = compile(withDefRprLayouts(), overrides)
      expect(theme.fonts.heading).toMatchObject({ latin: 'Custom Sans', ea: 'カスタム見出し' })
      expect(theme.fonts.baseFontSize).toBe(20)
      expect(theme.fonts.fontSizeRatios).toEqual({ h1: 3, h2: 1.778, h3: 1.333 })
      expect(report.fields['fonts.heading']?.detail).toContain('人が上書き')
      expect(report.fields['fonts.baseFontSize']?.detail).toContain('人が上書き')
    })

    it('同じ入力から必ず同じ書体・型階層になる（決定的）', () => {
      const first = JSON.stringify(compile(withDefRprLayouts(), allAssigned).theme.fonts)
      for (let i = 0; i < 5; i++) {
        expect(JSON.stringify(compile(withDefRprLayouts(), allAssigned).theme.fonts)).toBe(first)
      }
    })
  })

  describe('レイアウト割り当て（#192）', () => {
    const withLayouts = () =>
      profile({
        masters: [
          {
            part: 'ppt/slideMasters/slideMaster1.xml',
            mappedColors: profile().mappedColors,
            slideLayouts: [
              { part: 'ppt/slideLayouts/slideLayout1.xml', name: 'Section Divider', layoutType: 'secHead', placeholders: [], backgroundColorHex: '#000000' },
              { part: 'ppt/slideLayouts/slideLayout2.xml', name: 'Content', layoutType: 'obj', placeholders: [], backgroundColorHex: null },
            ],
          },
        ],
      })

    it('割り当てが無ければ既定の masterMap（4種すべて brand）のまま変わらない', () => {
      const { theme } = compile(withLayouts(), {})
      expect(theme.masterMap).toEqual({ center: 'brand', content: 'brand', 'two-column': 'brand', bleed: 'brand' })
      expect(Object.keys(theme.masters)).toEqual(['brand'])
    })

    it('割り当てた layout ごとに brand-<slug> master（extends: brand）と masterMap を追加する', () => {
      const { theme } = compile(withLayouts(), { layoutAssignments: { '0:1': 'content' } })
      expect(theme.masterMap.content).toBe('brand-content-0-1')
      expect(theme.masters['brand-content-0-1']).toEqual({ extends: 'brand' })
      // 既定の4種は変わらない
      expect(theme.masterMap.center).toBe('brand')
    })

    it('抽出済みの背景色（backgroundColorHex）を fill 背景として MasterDefinition.background へ配線する（#235）', () => {
      const { theme } = compile(withLayouts(), { layoutAssignments: { '0:0': 'center/section' } })
      expect(theme.masterMap['center/section']).toBe('brand-section-divider-0-0')
      expect(theme.masters['brand-section-divider-0-0']).toEqual({ extends: 'brand', background: { type: 'fill', color: '#000000' } })
    })

    it('背景色を持たないレイアウトのマスターは現行と同一（extends のみ）のまま変わらない（#235）', () => {
      const { theme } = compile(withLayouts(), { layoutAssignments: { '0:1': 'content' } })
      expect(theme.masters['brand-content-0-1']).toEqual({ extends: 'brand' })
    })

    it('複数の layout をそれぞれ別枠へ割り当てられる', () => {
      const { theme } = compile(withLayouts(), { layoutAssignments: { '0:0': 'center/section', '0:1': 'content' } })
      expect(theme.masterMap['center/section']).toBe('brand-section-divider-0-0')
      expect(theme.masterMap.content).toBe('brand-content-0-1')
      expect(Object.keys(theme.masters).sort()).toEqual(['brand', 'brand-content-0-1', 'brand-section-divider-0-0'])
    })

    it('存在しない master/layout の添字を指す割り当ては無視する', () => {
      const { theme } = compile(withLayouts(), { layoutAssignments: { '9:9': 'content' } })
      expect(Object.keys(theme.masters)).toEqual(['brand'])
      expect(theme.masterMap.content).toBe('brand')
    })

    it('7枠に無い不正な値の割り当ては無視する', () => {
      const { theme } = compile(withLayouts(), { layoutAssignments: { '0:0': 'not-a-real-slot' as never } })
      expect(Object.keys(theme.masters)).toEqual(['brand'])
    })
  })

  describe('反転面・締めの枠割り当てとコントラスト収束（#262）', () => {
    const withLayouts = () =>
      profile({
        masters: [
          {
            part: 'ppt/slideMasters/slideMaster1.xml',
            mappedColors: profile().mappedColors,
            slideLayouts: [
              { part: 'ppt/slideLayouts/slideLayout1.xml', name: 'Dark Section', layoutType: 'secHead', placeholders: [], backgroundColorHex: '#000000' },
              { part: 'ppt/slideLayouts/slideLayout2.xml', name: 'Closing', layoutType: 'blank', placeholders: [], backgroundColorHex: '#ffffff' },
              { part: 'ppt/slideLayouts/slideLayout3.xml', name: 'Plain', layoutType: 'obj', placeholders: [], backgroundColorHex: null },
            ],
          },
        ],
      })

    it('center/message-inverse・center/closing にマスターを割り当てられる', () => {
      const { theme } = compile(withLayouts(), { layoutAssignments: { '0:0': 'center/message-inverse', '0:1': 'center/closing' } })
      expect(theme.masterMap['center/message-inverse']).toBe('brand-dark-section-0-0')
      expect(theme.masterMap['center/closing']).toBe('brand-closing-0-1')
      expect(theme.masters['brand-dark-section-0-0']).toMatchObject({ background: { type: 'fill', color: '#000000' } })
    })

    it('デフォルトの文字色（tx1=#000000）が全面塗りの背景（#000000）とコントラストしない場合、layout ごとの masterKey に AA を満たす文字色トークンを積む', () => {
      const { theme } = compile(withLayouts(), { layoutAssignments: { '0:0': 'center/message-inverse' } })
      const masterKey = theme.masterMap['center/message-inverse']
      const bodyColor = theme.tokens[masterKey]?.['theme-text-body']
      expect(bodyColor).toBeTruthy()
      expect(getContrastRatio(bodyColor!, '#000000')).toBeGreaterThanOrEqual(4.5)
      // brand master 自体（tx1 と bg1=#ffffff の組）は変更しない
      expect(theme.colors.tx1).toBe('#000000')
    })

    it('既に AA を満たす組（黒地に白背景）は文字色を変更しない（決定的・不要な色ブレを避ける）', () => {
      const { theme } = compile(withLayouts(), { layoutAssignments: { '0:1': 'center/closing' } })
      const masterKey = theme.masterMap['center/closing']
      expect(theme.tokens[masterKey]?.['theme-text-body']).toBe(theme.colors.tx1)
      expect(theme.tokens[masterKey]?.['theme-text-muted']).toBe(theme.colors.tx2)
    })

    it('背景色を持たないレイアウトの masterKey には文字色トークンを積まない（fill 背景が無く検証対象にならないため）', () => {
      const { theme } = compile(withLayouts(), { layoutAssignments: { '0:2': 'content' } })
      const masterKey = theme.masterMap.content
      expect(theme.tokens[masterKey]).toBeUndefined()
    })

    it('同じ入力から必ず同じ調整結果になる（決定的）', () => {
      const overrides: BrandOverrides = { layoutAssignments: { '0:0': 'center/message-inverse' } }
      const first = compile(withLayouts(), overrides).theme.tokens['brand-dark-section-0-0']['theme-text-body']
      for (let i = 0; i < 5; i++) {
        expect(compile(withLayouts(), overrides).theme.tokens['brand-dark-section-0-0']['theme-text-body']).toBe(first)
      }
    })
  })

  describe('canvas.safeArea の導出（#317）', () => {
    /** `content` 枠に割り当てる1レイアウト。プレースホルダは1つだけ持たせる */
    function profileWithContentPlaceholder(kind: BrandPlaceholderKind, rect: Partial<Pick<PlaceholderProfile, 'xEmu' | 'yEmu' | 'cxEmu' | 'cyEmu'>>): BrandProfile {
      return profile({
        masters: [
          {
            part: 'ppt/slideMasters/slideMaster1.xml',
            mappedColors: profile().mappedColors,
            slideLayouts: [
              {
                part: 'ppt/slideLayouts/slideLayout1.xml',
                name: 'Content',
                layoutType: 'obj',
                backgroundColorHex: null,
                placeholders: [placeholder(kind, kind === 'title' ? 'title' : 'body', {}, rect)],
              },
            ],
          },
        ],
      })
    }

    const assignedToContent: BrandOverrides = { layoutAssignments: { '0:0': 'content' } }

    it('非対称な余白を持つ本文プレースホルダの矩形から4辺を導出する（bandToDecoration と同じ EMU→px 換算）', () => {
      // slideSize は 12,192,000 x 6,858,000 EMU（16:9）。canvasHeight は SLIDE_WIDTH(1280) 基準で 720
      const p = profileWithContentPlaceholder('body', { xEmu: 609_600, yEmu: 1_143_000, cxEmu: 10_363_200, cyEmu: 5_029_200 })
      const { theme, report } = compile(p, assignedToContent)
      // left=609600/12192000*1280=64 / top=1143000/6858000*720=120
      // right=(12192000-10972800)/12192000*1280=128 / bottom=(6858000-6172200)/6858000*720=72
      expect(theme.canvas?.safeArea).toEqual({ top: 120, left: 64, right: 128, bottom: 72 })
      expect(report.fields['canvas.safeArea']).toEqual({ status: 'derived', detail: '本文プレースホルダの矩形から算出' })
    })

    it('body プレースホルダを持たないレイアウトが content 枠に割り当てられた場合、safeArea を省略する（現行の CSS 既定 60px のまま）', () => {
      const p = profileWithContentPlaceholder('title', { xEmu: 609_600, yEmu: 1_143_000, cxEmu: 10_363_200, cyEmu: 5_029_200 })
      const { theme, report } = compile(p, assignedToContent)
      expect(theme.canvas?.safeArea).toBeUndefined()
      expect(report.fields['canvas.safeArea']?.status).toBe('missing')
    })

    it('content 枠が未割当の場合も safeArea を省略する', () => {
      const p = profileWithContentPlaceholder('body', { xEmu: 609_600, yEmu: 1_143_000, cxEmu: 10_363_200, cyEmu: 5_029_200 })
      const { theme, report } = compile(p, {})
      expect(theme.canvas?.safeArea).toBeUndefined()
      expect(report.fields['canvas.safeArea']?.status).toBe('missing')
    })

    it('矩形の一部（cxEmu）が欠けている場合は導出しない（片方だけの矩形は使えない）', () => {
      const p = profileWithContentPlaceholder('body', { xEmu: 609_600, yEmu: 1_143_000, cyEmu: 5_029_200 })
      const { theme, report } = compile(p, assignedToContent)
      expect(theme.canvas?.safeArea).toBeUndefined()
      expect(report.fields['canvas.safeArea']?.status).toBe('missing')
    })

    it('負値・キャンバス超過（壊れたテンプレートで矩形がスライド境界の外にある）は0にクランプする', () => {
      // off.x が負値、かつ x+cx がスライド幅を超える（右端の余白が負値になる）矩形
      const p = profileWithContentPlaceholder('body', { xEmu: -609_600, yEmu: 0, cxEmu: 13_000_000, cyEmu: 6_858_000 })
      const { theme } = compile(p, assignedToContent)
      expect(theme.canvas?.safeArea).toEqual({ top: 0, left: 0, right: 0, bottom: 0 })
    })

    it('safeAreaOverrides は辺単位で導出値より優先し、ステータスを ok として報告する', () => {
      const p = profileWithContentPlaceholder('body', { xEmu: 609_600, yEmu: 1_143_000, cxEmu: 10_363_200, cyEmu: 5_029_200 })
      const { theme, report } = compile(p, { ...assignedToContent, safeAreaOverrides: { top: 10 } })
      expect(theme.canvas?.safeArea).toEqual({ top: 10, left: 64, right: 128, bottom: 72 })
      expect(report.fields['canvas.safeArea']).toEqual({ status: 'ok', detail: '人が上書き' })
    })

    it('導出できない場合でも safeAreaOverrides だけで safeArea を組み立てられる', () => {
      const p = profileWithContentPlaceholder('title', {})
      const { theme, report } = compile(p, { ...assignedToContent, safeAreaOverrides: { top: 10, left: 20 } })
      expect(theme.canvas?.safeArea).toEqual({ top: 10, left: 20 })
      expect(report.fields['canvas.safeArea']?.status).toBe('ok')
    })

    it('同じ入力から必ず同じ導出結果になる（決定的）', () => {
      const p = profileWithContentPlaceholder('body', { xEmu: 609_600, yEmu: 1_143_000, cxEmu: 10_363_200, cyEmu: 5_029_200 })
      const first = compile(p, assignedToContent).theme.canvas?.safeArea
      for (let i = 0; i < 5; i++) {
        expect(compile(p, assignedToContent).theme.canvas?.safeArea).toEqual(first)
      }
    })
  })
})

describe('mergeCompiledBrandTheme のキャンバス合成（#188）', () => {
  function compiledTheme(overrides: Partial<CompiledBrandTheme> = {}): CompiledBrandTheme {
    return { colors: {} as CompiledBrandTheme['colors'], fonts: {}, masters: {}, masterMap: {}, tokens: {}, logo: null, ...overrides }
  }

  it('compiled.canvas を base へ合成する', () => {
    const merged = mergeCompiledBrandTheme(undefined, compiledTheme({ canvas: { width: 1280, height: 960 } }))
    expect(merged.canvas).toEqual({ width: 1280, height: 960 })
  })

  it('base.canvas.safeArea は compiled.canvas に無いので保持される', () => {
    const merged = mergeCompiledBrandTheme({ canvas: { safeArea: { top: 40 } } }, compiledTheme({ canvas: { width: 1280, height: 960 } }))
    expect(merged.canvas).toEqual({ width: 1280, height: 960, safeArea: { top: 40 } })
  })

  it('compiled.canvas が無い（slideSize 未検出）場合は base.canvas をそのまま保持する', () => {
    const merged = mergeCompiledBrandTheme({ canvas: { width: 1280, height: 720 } }, compiledTheme())
    expect(merged.canvas).toEqual({ width: 1280, height: 720 })
  })

  it('型階層（baseFontSize / fontSizeRatios）を base.fonts へ合成し、base だけが持つ段は消さない（#316）', () => {
    const merged = mergeCompiledBrandTheme({ fonts: { code: 'Menlo', fontSizeRatios: { caption: 0.6, h1: 3.6 } } }, compiledTheme({ fonts: { baseFontSize: 24, fontSizeRatios: { h1: 2.222 } } }))
    expect(merged.fonts).toEqual({ code: 'Menlo', baseFontSize: 24, fontSizeRatios: { caption: 0.6, h1: 2.222 } })
  })

  it('型階層が取れなかった場合は base.fonts の型階層をそのまま保持する（#316）', () => {
    const merged = mergeCompiledBrandTheme({ fonts: { baseFontSize: 20, fontSizeRatios: { h1: 3.6 } } }, compiledTheme())
    expect(merged.fonts).toEqual({ baseFontSize: 20, fontSizeRatios: { h1: 3.6 } })
  })

  it('埋め込みフォント（#318）を base.fonts.sources へ追記し、既存の source は保持する', () => {
    const merged = mergeCompiledBrandTheme({ fonts: { sources: [{ family: 'Menlo', src: 'fonts/menlo.woff2' }] } }, compiledTheme({ fonts: { sources: [{ family: 'Corporate Sans', localName: 'Corporate Sans' }] } }))
    expect(merged.fonts?.sources).toEqual([
      { family: 'Menlo', src: 'fonts/menlo.woff2' },
      { family: 'Corporate Sans', localName: 'Corporate Sans' },
    ])
  })

  it('base に同じ family がある場合は base 側（明示的な指定）を優先し、上書きしない', () => {
    const merged = mergeCompiledBrandTheme({ fonts: { sources: [{ family: 'Corporate Sans', src: 'fonts/corporate.woff2' }] } }, compiledTheme({ fonts: { sources: [{ family: 'Corporate Sans', localName: 'Corporate Sans' }] } }))
    expect(merged.fonts?.sources).toEqual([{ family: 'Corporate Sans', src: 'fonts/corporate.woff2' }])
  })
})
