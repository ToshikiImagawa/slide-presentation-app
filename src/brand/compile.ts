import { getContrastRatio, hexToRgbTuple, THEME_COLOR_TOKENS, WCAG_AA_THRESHOLD } from '../applyTheme'
import { SLIDE_WIDTH, SLIDE_HEIGHT } from '../hooks/useReveal'
import type { MasterDecoration, ThemeData } from '../data'
import { MAPPED_COLOR_KEYS, type BandCandidate, type BrandImportReport, type BrandOverrides, type BrandProfile, type CompiledBrandTheme, type MappedColorKey, type MediaAsset } from './types'

/** 並置比較ダイアログが合成した master を割り当てる先。既存のレイアウト種別（`SlideData.layout`）をすべて対象にする */
const BRAND_MASTER_KEY = 'brand'
const LAYOUT_KINDS = ['center', 'content', 'two-column', 'bleed']

/** 抽出できなかったキーの既定色（Office の標準テーマに近い無難な値） */
const FALLBACK_COLORS: Record<MappedColorKey, string> = {
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

/** WCAG 収束の対象にする文字色/背景色の組（本文相当の主要な組み合わせのみ。装飾用の accent 系は対象外） */
const TEXT_ON_BACKGROUND: ReadonlyArray<readonly [MappedColorKey, MappedColorKey]> = [
  ['tx1', 'bg1'],
  ['tx2', 'bg2'],
]

/** 12 キーのうち、SlidePreview の見た目差分がひと目で分かるよう `brand` master の CSS 変数へ写す最小限の対応。
 * 全キーを写さないのは、`--theme-*` の全トークンへ意味を割り当てるだけの根拠が抽出結果には無いため。
 * CSS 変数名自体は `THEME_COLOR_TOKENS`（`applyTheme.ts`）を単一真実源として引く（変数名の二重管理を避ける） */
const KEY_TO_CSS_VAR: Partial<Record<MappedColorKey, string>> = {
  bg1: THEME_COLOR_TOKENS.background,
  tx1: THEME_COLOR_TOKENS.textBody,
  bg2: THEME_COLOR_TOKENS.backgroundAlt,
  tx2: THEME_COLOR_TOKENS.textMuted,
  accent1: THEME_COLOR_TOKENS.primary,
  accent2: THEME_COLOR_TOKENS.accent,
}

/**
 * `BrandProfile`（抽出結果）と `BrandOverrides`（人の上書き）から `ThemeData` へ合成可能な `CompiledBrandTheme` を作る純関数。
 * WCAG コントラスト比は後段チェックではなく収束条件として内包し、AA（4.5:1）未達の文字色/背景色の組は
 * 満たすまで黒/白へ mix する（#168）。生成 CSS 文字列は作らない。
 */
export function compile(profile: BrandProfile, overrides: BrandOverrides): { theme: CompiledBrandTheme; report: BrandImportReport } {
  const report: BrandImportReport = { fields: {} }
  const colors = resolveColors(profile, overrides, report)
  convergeContrast(colors, report)

  const fonts = resolveFonts(profile, overrides, report)
  const logo = resolveLogo(profile, overrides)
  report.fields.logo = { status: logo ? 'ok' : 'missing', detail: logo ? undefined : 'ロゴ候補が無いか、人が未選択' }

  const decorations = buildDecorations(profile, overrides, logo, report)
  const masters = { [BRAND_MASTER_KEY]: { decorations } }
  const masterMap = Object.fromEntries(LAYOUT_KINDS.map((layout) => [layout, BRAND_MASTER_KEY]))
  const tokens = { [BRAND_MASTER_KEY]: buildTokens(colors) }

  return { theme: { colors, fonts, masters, masterMap, tokens, logo }, report }
}

function resolveColors(profile: BrandProfile, overrides: BrandOverrides, report: BrandImportReport): Record<MappedColorKey, string> {
  const colors = {} as Record<MappedColorKey, string>
  for (const key of MAPPED_COLOR_KEYS) {
    const override = overrides.colorHex?.[key]
    const extracted = profile.mappedColors[key]
    if (override) {
      colors[key] = override
      report.fields[`colors.${key}`] = { status: 'ok', detail: '人が上書き' }
    } else if (extracted) {
      colors[key] = extracted
      report.fields[`colors.${key}`] = { status: 'ok' }
    } else {
      colors[key] = FALLBACK_COLORS[key]
      report.fields[`colors.${key}`] = { status: 'fallback', detail: 'テンプレートから抽出できず既定値を使用' }
    }
  }
  return colors
}

/** AA 未達の文字色/背景色の組を、閾値を満たすまで黒 or 白へ mix して上書きする（収束条件として内包する） */
function convergeContrast(colors: Record<MappedColorKey, string>, report: BrandImportReport): void {
  for (const [textKey, bgKey] of TEXT_ON_BACKGROUND) {
    const ratio = getContrastRatio(colors[textKey], colors[bgKey])
    if (ratio !== null && ratio >= WCAG_AA_THRESHOLD) continue
    const before = colors[textKey]
    colors[textKey] = adjustForContrast(colors[textKey], colors[bgKey])
    if (colors[textKey] !== before) {
      report.fields[`colors.${textKey}`] = { status: 'derived', detail: `WCAG AA（${WCAG_AA_THRESHOLD}:1）を満たすよう調整` }
    }
  }
}

/** `textHex` を黒または白へ mix し、`bgHex` に対して閾値を満たす最小の mix 係数を二分探索で決める（決定的） */
function adjustForContrast(textHex: string, bgHex: string, threshold = WCAG_AA_THRESHOLD): string {
  const candidates = (['#000000', '#ffffff'] as const).map((target) => binarySearchMix(textHex, target, bgHex, threshold)).filter((c): c is string => c !== null)
  if (candidates.length > 0) {
    // 両方向とも到達可能なら、元の色に近い（mix 量が小さい＝原色を保つ）方を選ぶ
    return candidates.reduce((best, c) => (colorDistance(c, textHex) < colorDistance(best, textHex) ? c : best))
  }
  // 背景が極端で黒/白どちらの方向でも閾値に届かない場合は、より良い方（フル黒 or フル白）に倒す
  const blackRatio = getContrastRatio('#000000', bgHex) ?? 0
  const whiteRatio = getContrastRatio('#ffffff', bgHex) ?? 0
  return blackRatio >= whiteRatio ? '#000000' : '#ffffff'
}

/** 二分探索の反復回数。8bit（256階調）の mix 係数を区別できれば十分なため log2(256)=8 回で収束させる */
const MIX_SEARCH_ITERATIONS = 8

/** `mixToward(textHex, target, hi)` が閾値を満たす最小の `hi` を求める。フル mix でも届かない方向は `null` */
function binarySearchMix(textHex: string, target: '#000000' | '#ffffff', bgHex: string, threshold: number): string | null {
  const atFull = getContrastRatio(mixToward(textHex, target, 1), bgHex)
  if (atFull === null || atFull < threshold) return null
  let lo = 0
  let hi = 1
  for (let i = 0; i < MIX_SEARCH_ITERATIONS; i++) {
    const mid = (lo + hi) / 2
    const ratio = getContrastRatio(mixToward(textHex, target, mid), bgHex)
    if (ratio !== null && ratio >= threshold) {
      hi = mid
    } else {
      lo = mid
    }
  }
  return mixToward(textHex, target, hi)
}

/** sRGB のチャンネルごとの線形補間（gamma 補正はしない簡易 mix。厳密な線形色空間より原色の見た目を保ちやすい） */
function mixToward(hex: string, target: string, t: number): string {
  const a = hexToRgbTuple(hex)
  const b = hexToRgbTuple(target)
  const mix = (from: number, to: number) => Math.round(from * (1 - t) + to * t)
  return rgbTupleToHex([mix(a[0], b[0]), mix(a[1], b[1]), mix(a[2], b[2])])
}

function colorDistance(a: string, b: string): number {
  const [ar, ag, ab] = hexToRgbTuple(a)
  const [br, bg, bb] = hexToRgbTuple(b)
  return Math.sqrt((ar - br) ** 2 + (ag - bg) ** 2 + (ab - bb) ** 2)
}

function rgbTupleToHex([r, g, b]: [number, number, number]): string {
  const clamp = (v: number) => Math.min(255, Math.max(0, v))
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`
}

function resolveFonts(profile: BrandProfile, overrides: BrandOverrides, report: BrandImportReport): { heading?: string; body?: string } {
  const heading = overrides.fontOverrides?.heading ?? profile.fonts.major.latin ?? profile.fonts.major.jpan ?? undefined
  const body = overrides.fontOverrides?.body ?? profile.fonts.minor.latin ?? profile.fonts.minor.jpan ?? undefined
  report.fields['fonts.heading'] = { status: heading ? 'ok' : 'fallback', detail: heading ? undefined : 'テンプレートから見出し書体を抽出できず既定フォントを使用' }
  report.fields['fonts.body'] = { status: body ? 'ok' : 'fallback', detail: body ? undefined : 'テンプレートから本文書体を抽出できず既定フォントを使用' }
  return { heading, body }
}

/** `manualLogo` は明示指定（`null` も「ロゴなし」という明示選択として優先する）。未指定時のみ候補選択にフォールバックする */
function resolveLogo(profile: BrandProfile, overrides: BrandOverrides): MediaAsset | null {
  if (overrides.manualLogo !== undefined) return overrides.manualLogo
  if (overrides.selectedLogoIndex == null) return null
  return profile.logoCandidates[overrides.selectedLogoIndex]?.image ?? null
}

/** EMU をスライド全体のサイズから 1280x720 の描画基準（`SLIDE_WIDTH`/`SLIDE_HEIGHT`）へ換算する */
function emuToPx(emu: number, slideEmu: number, canvasPx: number): number {
  if (slideEmu <= 0) return canvasPx
  return Math.round((emu / slideEmu) * canvasPx)
}

function buildDecorations(profile: BrandProfile, overrides: BrandOverrides, logo: MediaAsset | null, report: BrandImportReport): MasterDecoration[] {
  const decorations: MasterDecoration[] = []
  if (logo) {
    const selected = overrides.selectedLogoIndex != null ? profile.logoCandidates[overrides.selectedLogoIndex] : undefined
    const size = selected && profile.slideSize ? { widthEmu: selected.widthEmu, heightEmu: selected.heightEmu } : undefined
    decorations.push({
      type: 'logo',
      anchor: 'bottom-right',
      src: mediaAssetToDataUrl(logo),
      width: size && profile.slideSize ? emuToPx(size.widthEmu, profile.slideSize.widthEmu, SLIDE_WIDTH) : undefined,
      height: size && profile.slideSize ? emuToPx(size.heightEmu, profile.slideSize.heightEmu, SLIDE_HEIGHT) : undefined,
    })
  }

  const selectedBands = (overrides.selectedBandIndices ?? []).map((i) => profile.bandCandidates[i]).filter((b): b is BandCandidate => b !== undefined)
  report.fields.bands = {
    status: selectedBands.length > 0 ? 'ok' : profile.bandCandidates.length > 0 ? 'missing' : 'missing',
    detail: selectedBands.length > 0 ? undefined : profile.bandCandidates.length > 0 ? '帯候補は検出済みだが人が未選択' : '帯候補が検出されなかった',
  }
  for (const band of selectedBands) {
    decorations.push(bandToDecoration(band, profile.slideSize))
  }
  return decorations
}

function bandToDecoration(band: BandCandidate, slideSize: BrandProfile['slideSize']): MasterDecoration {
  const thickness = slideSize ? emuToPx(band.thicknessEmu, band.orientation === 'horizontal' ? slideSize.heightEmu : slideSize.widthEmu, band.orientation === 'horizontal' ? SLIDE_HEIGHT : SLIDE_WIDTH) : undefined
  return { type: 'band', anchor: band.anchor, orientation: band.orientation, color: band.colorHex, thickness }
}

/** `MediaAsset` を `<img src>` に直接渡せる data URL へ変換する（サムネイル・ロゴ候補の表示で共有する） */
export function mediaAssetToDataUrl(asset: MediaAsset): string {
  return `data:${asset.contentType};base64,${asset.base64}`
}

/** 12 キーのうち意味づけできる分だけ、`brand` master に scope した CSS 変数トークンへ写す（生成 CSS 文字列ではなく値のみ） */
function buildTokens(colors: Record<MappedColorKey, string>): Record<string, string> {
  const tokens: Record<string, string> = {}
  for (const [key, cssVar] of Object.entries(KEY_TO_CSS_VAR)) {
    const value = colors[key as MappedColorKey]
    if (value) tokens[cssVar.replace(/^--/, '')] = value
  }
  return tokens
}

/**
 * `compile` の出力を既存の `ThemeData` へ合成する。既存の masters/masterMap/tokens/fonts は保持したまま、
 * `brand` master とその割り当てだけ追加/上書きする（他の master を消さない）。
 * ライブプレビュー（`BrandConfirmDialog`）とコミット（`SlideEditor`）の両方がこの 1 関数を通ることで、
 * 「プレビューでは反映されるが確定後の見た目が違う」という食い違いを防ぐ。
 * `theme.colors`（ColorPalette）には書き込まない: 12 キーは `compiled.colors` 側で別に保持し、
 * 生成 CSS ではなく masters/decorations 経由で見た目に反映する（Epic #173 の方針）
 */
export function mergeCompiledBrandTheme(base: ThemeData | undefined, compiled: CompiledBrandTheme): ThemeData {
  return {
    ...base,
    fonts: { ...base?.fonts, ...(compiled.fonts.heading ? { heading: compiled.fonts.heading } : {}), ...(compiled.fonts.body ? { body: compiled.fonts.body } : {}) },
    masters: { ...base?.masters, ...compiled.masters },
    masterMap: { ...base?.masterMap, ...compiled.masterMap },
    tokens: { ...base?.tokens, ...compiled.tokens },
  }
}
