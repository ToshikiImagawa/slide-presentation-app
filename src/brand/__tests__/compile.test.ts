import { describe, expect, it } from 'vitest'
import { getContrastRatio } from '../../applyTheme'
import { compile } from '../compile'
import type { BrandOverrides, BrandProfile, MappedColorKey } from '../types'

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
  })

  describe('フォント', () => {
    it('抽出できた書体名を採用する', () => {
      const { theme, report } = compile(profile(), {})
      expect(theme.fonts.heading).toBe('Trebuchet MS')
      expect(theme.fonts.body).toBe('Calibri')
      expect(report.fields['fonts.heading']?.status).toBe('ok')
    })

    it('人の上書きを優先する', () => {
      const { theme } = compile(profile(), { fontOverrides: { heading: 'Custom Sans' } })
      expect(theme.fonts.heading).toBe('Custom Sans')
    })

    it('抽出できなければ fallback として報告する', () => {
      const p = profile({ fonts: { major: { latin: null, ea: null, cs: null, jpan: null }, minor: { latin: null, ea: null, cs: null, jpan: null } } })
      const { theme, report } = compile(p, {})
      expect(theme.fonts.heading).toBeUndefined()
      expect(report.fields['fonts.heading']?.status).toBe('fallback')
    })
  })
})
