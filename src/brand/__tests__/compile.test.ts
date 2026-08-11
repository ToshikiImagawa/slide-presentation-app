import { describe, expect, it } from 'vitest'
import { getContrastRatio } from '../../applyTheme'
import { compile, mergeCompiledBrandTheme } from '../compile'
import type { BrandOverrides, BrandProfile, CompiledBrandTheme, MappedColorKey } from '../types'

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
    mappedColors,
    fonts: { major: { latin: 'Trebuchet MS', ea: null, cs: null, jpan: null }, minor: { latin: 'Calibri', ea: null, cs: null, jpan: null } },
    masters: [],
    ...overrides,
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

  describe('レイアウト割り当て（#192）', () => {
    const withLayouts = () =>
      profile({
        masters: [
          {
            part: 'ppt/slideMasters/slideMaster1.xml',
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

    it('5枠に無い不正な値の割り当ては無視する', () => {
      const { theme } = compile(withLayouts(), { layoutAssignments: { '0:0': 'not-a-real-slot' as never } })
      expect(Object.keys(theme.masters)).toEqual(['brand'])
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
})
