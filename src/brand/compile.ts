import { getContrastRatio, hexToRgbTuple, mergeRecord, normalizeHex, relativeLuminance, rgbTupleToHex, THEME_COLOR_TOKENS, WCAG_AA_THRESHOLD } from '../applyTheme'
import { SLIDE_WIDTH, SLIDE_HEIGHT } from '../hooks/useReveal'
import { slugify } from '../slugify'
import type { FontFamilySpec, MasterDecoration, MasterDefinition, ThemeData } from '../data'
import {
  LAYOUT_ASSIGNMENT_SLOTS,
  MAPPED_COLOR_KEYS,
  type BandCandidate,
  type BrandColorScheme,
  type BrandFieldStatus,
  type BrandFontFace,
  type BrandFontOrigin,
  type BrandImportReport,
  type BrandOverrides,
  type BrandProfile,
  type CompiledBrandTheme,
  type LayoutAssignmentSlot,
  type MappedColorKey,
  type BrandPlaceholderKind,
  type MediaAsset,
  type PlaceholderProfile,
  type PlaceholderTextProps,
} from './types'

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

/** 12 キーすべてを `brand` master の CSS 変数へ写す対応（#186）。
 * bg1/tx1/bg2/tx2・accent1/accent2・hlink/folHlink は意味が明確なため対応する CSS 変数へ直接写し、
 * accent3〜accent6（OOXML 上は用途が固定されない予備の強調色）は意味づけの根拠が薄いため
 * 系列色（series3〜series6）へ機械的に割り当てる（series1/series2 は primary/accent 自体が
 * 導出元になるため、ここでは直接の対応先を持たない）。
 * CSS 変数名自体は `THEME_COLOR_TOKENS`（`applyTheme.ts`）を単一真実源として引く（変数名の二重管理を避ける） */
const KEY_TO_CSS_VAR: Partial<Record<MappedColorKey, string>> = {
  bg1: THEME_COLOR_TOKENS.background,
  tx1: THEME_COLOR_TOKENS.textBody,
  bg2: THEME_COLOR_TOKENS.backgroundAlt,
  tx2: THEME_COLOR_TOKENS.textMuted,
  accent1: THEME_COLOR_TOKENS.primary,
  accent2: THEME_COLOR_TOKENS.accent,
  accent3: THEME_COLOR_TOKENS.series3,
  accent4: THEME_COLOR_TOKENS.series4,
  accent5: THEME_COLOR_TOKENS.series5,
  accent6: THEME_COLOR_TOKENS.series6,
  hlink: THEME_COLOR_TOKENS.link,
  folHlink: THEME_COLOR_TOKENS.linkVisited,
}

/** `KEY_TO_CSS_VAR` で系列色へ機械的に割り当てたキー（意味づけの根拠が薄い）。report で `derived` として報告する */
const MECHANICALLY_ASSIGNED_KEYS: ReadonlySet<MappedColorKey> = new Set(['accent3', 'accent4', 'accent5', 'accent6'])

/**
 * `BrandProfile`（抽出結果）と `BrandOverrides`（人の上書き）から `ThemeData` へ合成可能な `CompiledBrandTheme` を作る純関数。
 * WCAG コントラスト比は後段チェックではなく収束条件として内包し、AA（4.5:1）未達の文字色/背景色の組は
 * 満たすまで黒/白へ mix する（#168）。生成 CSS 文字列は作らない。
 */
export function compile(profile: BrandProfile, overrides: BrandOverrides): { theme: CompiledBrandTheme; report: BrandImportReport } {
  const report: BrandImportReport = { fields: {} }
  const colors = resolveColors(profile, overrides, report)
  convergeContrast(colors, report)

  // 書体・型階層は割り当て済みレイアウトのプレースホルダ（`a:defRPr`）を抽出元にするため、
  // 割り当ての解決を先に行う（#316）
  const assignedLayouts = resolveAssignedLayouts(profile, overrides)
  const fonts = resolveFonts(profile, overrides, assignedLayouts, report)
  const logo = resolveLogo(profile, overrides)
  report.fields.logo = { status: logo ? 'ok' : 'missing', detail: logo ? undefined : 'ロゴ候補が無いか、人が未選択' }

  // キャンバス幅は SLIDE_WIDTH（1280）に固定し、高さだけ slideSize の実比率から算出する（#188）。
  // 4:3 等の非16:9テンプレートでも、装飾の EMU→px 換算基準（canvasHeight）が実際の比率と一致するようにする
  const canvasHeight = profile.slideSize ? Math.round((SLIDE_WIDTH * profile.slideSize.heightEmu) / profile.slideSize.widthEmu) : SLIDE_HEIGHT
  const canvas = profile.slideSize ? { width: SLIDE_WIDTH, height: canvasHeight } : undefined

  const decorations = buildDecorations(profile, overrides, logo, canvasHeight, report)
  const masters = { [BRAND_MASTER_KEY]: { decorations }, ...buildLayoutMasters(assignedLayouts) }
  const masterMap = { ...Object.fromEntries(LAYOUT_KINDS.map((layout) => [layout, BRAND_MASTER_KEY])), ...buildLayoutMasterMap(assignedLayouts) }
  const tokens = { [BRAND_MASTER_KEY]: buildTokens(colors), ...buildLayoutTokens(assignedLayouts, colors) }

  return { theme: { colors, fonts, masters, masterMap, tokens, logo, canvas }, report }
}

/** `resolveAssignedLayouts` が解決した1件。`key` は `overrides.layoutAssignments` のキー（`"<masterIndex>:<layoutIndex>"`）
 * をそのまま持ち、masterKey 生成（`layoutMasterKey`）に使う */
interface AssignedLayout {
  key: string
  slot: LayoutAssignmentSlot
  name: string | null
  /** その slideLayout（PPTX/Google スライド側）が持つ背景色。抽出できなければ null（#235） */
  backgroundColorHex: string | null
  /** その slideLayout のプレースホルダ構成。書体・型階層の抽出元（#316） */
  placeholders: PlaceholderProfile[]
}

/** `overrides.layoutAssignments` のうち、①`LAYOUT_ASSIGNMENT_SLOTS` に実在する枠を指し、②実在する layout
 * （`profile.masters[i].slideLayouts[j]`）を指す、有効なエントリだけを解決する。
 * 手編集や旧バージョンの永続化ファイルに残った不正な値は静かに無視する（描画を止めない） */
function resolveAssignedLayouts(profile: BrandProfile, overrides: BrandOverrides): AssignedLayout[] {
  return Object.entries(overrides.layoutAssignments ?? {})
    .map(([key, slot]): AssignedLayout | undefined => {
      if (!LAYOUT_ASSIGNMENT_SLOTS.includes(slot)) return undefined
      const [masterIndex, layoutIndex] = key.split(':').map(Number)
      const layout = profile.masters[masterIndex]?.slideLayouts[layoutIndex]
      return layout ? { key, slot, name: layout.name, backgroundColorHex: layout.backgroundColorHex, placeholders: layout.placeholders } : undefined
    })
    .filter((entry): entry is AssignedLayout => entry !== undefined)
}

/**
 * 割り当て済みの slideLayout ごとに `brand-<slug>` という masterKey で `ThemeData.masters` エントリを追加する
 * （#192 の masterKey 命名契約）。独自の装飾は持たせず `extends: 'brand'`（主 master の装飾を継承）に留める:
 * ロゴ・帯のヒューリスティクスは主 slideMaster のみで行う設計（#168）を変えないため、これらのエントリは
 * 「どの layout が割り当てられているか」という構造だけを表す。
 * 抽出済みの `backgroundColorHex`（#192）があれば `fill` 背景として配線する（#235）。
 * `theme.tokens` は masterKey が `brand` のスコープにしか積まれず（`buildTokens`）、layout 別の masterKey
 * には継承されない（CSS セレクタが `data-master` の完全一致のため）。したがって背景色が `colors.bg1` と
 * 同一でも、この `fill` がその layout の背景色を反映する唯一の経路であり、重複にはならない
 * （「テーマ背景色と実質同じなら省く」判定は意図的に見送った）
 */
function buildLayoutMasters(assignedLayouts: AssignedLayout[]): Record<string, MasterDefinition> {
  return Object.fromEntries(
    assignedLayouts.map(({ key, name, backgroundColorHex }) => [layoutMasterKey(key, name), { extends: BRAND_MASTER_KEY, ...(backgroundColorHex ? { background: { type: 'fill' as const, color: backgroundColorHex } } : {}) }]),
  )
}

function buildLayoutMasterMap(assignedLayouts: AssignedLayout[]): Record<string, string> {
  return Object.fromEntries(assignedLayouts.map(({ key, slot, name }) => [slot, layoutMasterKey(key, name)]))
}

/**
 * `fill` 背景を持つ layout 別 masterKey（`buildLayoutMasters`）に、その背景色に対して WCAG AA を
 * 満たす文字色（tx1/tx2 相当）を積む（#262）。`getMasterBackgroundContrastWarnings`（`applyTheme.ts`）は
 * masterKey ごとの `theme.tokens` しか見ず extends 元（`brand`）へフォールバックしない設計のため、
 * ここで明示的に上書きトークンを持たせないと「文字色が見つからず検証されない」まま素通りしてしまう
 * （検証エラーではなく検証漏れ）。`colors.tx1`/`colors.tx2` は主背景（bg1/bg2）向けに収束済みだが、
 * layout 個別の背景色は bg1/bg2 と異なりうるため、layout ごとに再収束する。
 * `center/message-inverse`/`center/closing`（#262 で追加した2枠）だけでなく、`fill` 背景を持つ
 * すべての割り当て（既存5枠を含む）に同じ規則を適用する: 同じ根本原因（layout 固有の背景色に対する
 * 文字色の未検証）を1箇所で塞ぐ方が、枠ごとに特別扱いするより設計として単純で取りこぼしがない */
function buildLayoutTokens(assignedLayouts: AssignedLayout[], colors: Record<MappedColorKey, string>): Record<string, Record<string, string>> {
  const bodyVar = KEY_TO_CSS_VAR.tx1!.replace(/^--/, '')
  const mutedVar = KEY_TO_CSS_VAR.tx2!.replace(/^--/, '')
  return Object.fromEntries(
    assignedLayouts
      .filter(({ backgroundColorHex }) => backgroundColorHex !== null)
      .map(({ key, name, backgroundColorHex }) => [layoutMasterKey(key, name), { [bodyVar]: convergedTextColor(colors.tx1, backgroundColorHex!), [mutedVar]: convergedTextColor(colors.tx2, backgroundColorHex!) }]),
  )
}

/** `brand-<slug>-<masterIndex>-<layoutIndex>` 形式（`/` を含まない）。index を含めるのは、
 * 同名の layout が複数あってもスラッグの衝突で masterKey が重複しないようにするため */
function layoutMasterKey(key: string, name: string | null): string {
  return `brand-${slugify(name ?? '', 'layout')}-${key.replace(':', '-')}`
}

/** ライト/ダーク反転で入れ替える bg/tx の組（#300）。全12キーのうち、背景と対になる本文色だけが対象 */
const BG_TX_SWAP_PAIRS: ReadonlyArray<readonly [MappedColorKey, MappedColorKey]> = [
  ['bg1', 'tx1'],
  ['bg2', 'tx2'],
]

/**
 * `overrides.selectedMasterIndex` が指すmasterの12キーを基準にする（#300）。複数slideMaster
 * （ライト用/ダーク用が別々に定義されているテンプレート）では、常に1枚目基準の `profile.mappedColors` では
 * 他masterの配色を選べないため、`profile.masters[i].mappedColors` を明示的に選べるようにする。
 * 指す先が存在しない（範囲外・masters が空）場合は `profile.mappedColors` にフォールバックする
 */
function selectBaseMappedColors(profile: BrandProfile, overrides: BrandOverrides): Record<MappedColorKey, string | null> {
  if (overrides.selectedMasterIndex == null) return profile.mappedColors
  return profile.masters[overrides.selectedMasterIndex]?.mappedColors ?? profile.mappedColors
}

/**
 * `overrides.colorScheme`（ライト/ダークの明示指定。#300）が現在の極性と食い違う場合だけ、bg1⇄tx1・bg2⇄tx2 を
 * 入れ替える。極性は bg1 と tx1 の相対輝度の大小で判定する（背景が文字より明るい＝ライト）。
 * slideMaster を持たない theme 単体パッケージ（`ClrMap::default()` で常に bg1=lt1 に決め打ちされる曖昧なケース）
 * でも、bg1/tx1 の実値は lt1/dk1 そのもの（変換なし）なので、この入れ替えだけで正しく反転できる
 */
function applyColorSchemeOverride(mapped: Record<MappedColorKey, string | null>, scheme: BrandColorScheme | undefined): Record<MappedColorKey, string | null> {
  if (!scheme || scheme === 'auto') return mapped
  const bg1 = mapped.bg1 && normalizeHex(mapped.bg1)
  const tx1 = mapped.tx1 && normalizeHex(mapped.tx1)
  if (!bg1 || !tx1) return mapped
  const isCurrentlyLight = relativeLuminance(bg1) >= relativeLuminance(tx1)
  if (isCurrentlyLight === (scheme === 'light')) return mapped
  const swapped = { ...mapped }
  for (const [bgKey, txKey] of BG_TX_SWAP_PAIRS) {
    swapped[bgKey] = mapped[txKey]
    swapped[txKey] = mapped[bgKey]
  }
  return swapped
}

function resolveColors(profile: BrandProfile, overrides: BrandOverrides, report: BrandImportReport): Record<MappedColorKey, string> {
  const extractedColors = applyColorSchemeOverride(selectBaseMappedColors(profile, overrides), overrides.colorScheme)
  const colors = {} as Record<MappedColorKey, string>
  for (const key of MAPPED_COLOR_KEYS) {
    const override = overrides.colorHex?.[key]
    const extracted = extractedColors[key]
    const mechanical = MECHANICALLY_ASSIGNED_KEYS.has(key)
    if (override) {
      colors[key] = override
      report.fields[`colors.${key}`] = mechanical ? { status: 'derived', detail: `人が上書き / 系列色（${KEY_TO_CSS_VAR[key]}）へ機械的に割り当て` } : { status: 'ok', detail: '人が上書き' }
    } else if (extracted) {
      colors[key] = extracted
      report.fields[`colors.${key}`] = mechanical ? { status: 'derived', detail: `系列色（${KEY_TO_CSS_VAR[key]}）へ機械的に割り当て` } : { status: 'ok' }
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
    const before = colors[textKey]
    colors[textKey] = convergedTextColor(colors[textKey], colors[bgKey])
    if (colors[textKey] !== before) {
      report.fields[`colors.${textKey}`] = { status: 'derived', detail: `WCAG AA（${WCAG_AA_THRESHOLD}:1）を満たすよう調整` }
    }
  }
}

/** 既に閾値を満たす組はそのまま返す（`adjustForContrast` は常に mix 計算を行うため、満たしている場合の不要な色ブレを避ける）。
 * `convergeContrast`（tx1/bg1・tx2/bg2 の主背景向け）と `buildLayoutTokens`（layout 個別の背景色向け）が共有する */
function convergedTextColor(textHex: string, bgHex: string, threshold = WCAG_AA_THRESHOLD): string {
  const ratio = getContrastRatio(textHex, bgHex)
  return ratio !== null && ratio >= threshold ? textHex : adjustForContrast(textHex, bgHex, threshold)
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

/** 枠 → 型階層の段（`fontSizeRatios` のキー）の対応（#316）。その枠のタイトルプレースホルダの実サイズを
 * どの段として採るかを表し、`null` は段として採らない枠。**全枠を網羅する型**にしているのは、枠を追加した
 * ときに「その枠は型階層のどの段か」を型が書かせるため（無言で新枠が無視されるのを防ぐ）。
 * 抽出元を slideLayout のプレースホルダに限るのは、slideMaster の `p:txStyles` が Office 既定値のまま
 * ＝全段同一サイズで手がかりにならない場合があるため */
const SLOT_TO_FONT_SIZE_STEP: Record<LayoutAssignmentSlot, string | null> = {
  center: 'h1', // 表紙タイトル
  'center/section': 'h2', // 章タイトル
  'center/message-inverse': null,
  'center/closing': null,
  content: 'h3', // 本文スライドの見出し
  'two-column': null,
  bleed: null,
}

/** 基準サイズ（比率 1.0 = 本文）を採る枠。本文系の枠だけを見るのは、center 系の body プレースホルダが
 * サブタイトルであって本文の段ではないため（別の段のサイズを基準にすると型階層全体が狂う） */
const BASE_SIZE_SLOTS: ReadonlyArray<LayoutAssignmentSlot> = ['content', 'two-column', 'bleed']

/** `preferred` を先頭に、残りの枠を `LAYOUT_ASSIGNMENT_SLOTS` の順で並べた探索順を作る。
 * 枠を追加しても自動的に末尾に含まれるため、探索対象から無言で漏れない */
function slotSearchOrder(preferred: ReadonlyArray<LayoutAssignmentSlot>): LayoutAssignmentSlot[] {
  return [...preferred, ...LAYOUT_ASSIGNMENT_SLOTS.filter((slot) => !preferred.includes(slot))]
}

/** 見出し書体を探す枠の優先順。表紙 → 章の順に見るのは、作者が最も明示的に書体を設定する場所だから
 * （UI の表示順に依存させないため `LAYOUT_ASSIGNMENT_SLOTS` をそのまま流用しない） */
const HEADING_FONT_SLOTS = slotSearchOrder(['center', 'center/section'])

/** 本文書体を探す枠の優先順。本文系の枠を先に見る。サイズ（`BASE_SIZE_SLOTS`）と違い書体は他の枠へ
 * フォールバックしてよい: サブタイトルも本文と同じ minorFont 系列の書体で、段が違っても書体名としては妥当 */
const BODY_FONT_SLOTS = slotSearchOrder(BASE_SIZE_SLOTS)

/** EMU/インチ（OOXML の長さ単位）と 1 インチあたりの pt */
const EMU_PER_INCH = 914_400
const PT_PER_INCH = 72
/** `slideSize` が無いテンプレートで仮定するスライド幅（EMU）。96dpi で 1280px 幅に相当し、
 * 16:9 既定の PPTX（12192000 EMU）と同じ換算になる */
const FALLBACK_SLIDE_WIDTH_EMU = (SLIDE_WIDTH / 96) * EMU_PER_INCH

/** 割り当て済みレイアウトを枠で引ける形にする（同じ枠に複数の割り当てがある場合は先着を優先する） */
function indexBySlot(assignedLayouts: AssignedLayout[]): Map<LayoutAssignmentSlot, AssignedLayout> {
  const bySlot = new Map<LayoutAssignmentSlot, AssignedLayout>()
  for (const layout of assignedLayouts) {
    if (!bySlot.has(layout.slot)) bySlot.set(layout.slot, layout)
  }
  return bySlot
}

/** 枠の優先順で走査し、種別が一致する最初のプレースホルダの既定文字プロパティを返す。
 * 同じ枠に同種が複数ある場合は XML の記述順で先頭を採る（走査順が固定なので決定的） */
function findPlaceholderText(bySlot: Map<LayoutAssignmentSlot, AssignedLayout>, slots: ReadonlyArray<LayoutAssignmentSlot>, kind: BrandPlaceholderKind): PlaceholderTextProps | undefined {
  for (const slot of slots) {
    const text = bySlot.get(slot)?.placeholders.find((placeholder) => placeholder.kind === kind)?.text
    if (text) return text
  }
  return undefined
}

/** 書体スロットの解決に必要な値だけを持つ形（プレースホルダの解決済み値と、その代わりに使う fontScheme を
 * 同じ形で扱うための最小の型） */
type ResolvedFont = Pick<PlaceholderTextProps, 'latin' | 'ea' | 'bold' | 'fontOrigin'>

/** `a:fontScheme` の書体組を `ResolvedFont` の形に直す。和文は script 固有の jpan（Japanese script
 * override）があれば ea より優先する（PowerPoint 自体の書体解決順に合わせる） */
function fontSchemeAsResolved(scheme: BrandFontFace): ResolvedFont {
  const ea = scheme.jpan ?? scheme.ea
  return { latin: scheme.latin, ea, bold: null, fontOrigin: scheme.latin || ea ? 'fontScheme' : 'none' }
}

/**
 * 書体スロット 1 つ（見出し / 本文）を決める（#187 / #316）。
 * 継承順（プレースホルダの `a:defRPr` → slideMaster の `p:txStyles` → theme の `a:fontScheme`）は
 * Rust 側（`brand::text_props::resolve`）が解決済みなので、ここでは優先順位を再実装しない。
 * 割り当て済みレイアウトに該当プレースホルダが無いときだけ、生の `fontScheme` を代わりに使う。
 * latin/ea は潰さず両方写し、人の上書き（確認ダイアログ）はそれぞれで最優先にする。
 */
function resolveFontSlot(scheme: BrandFontFace, placeholder: PlaceholderTextProps | undefined, override: { latin?: string; ea?: string }): { spec?: FontFamilySpec; origin: BrandFontOrigin } {
  const resolved: ResolvedFont = placeholder ?? fontSchemeAsResolved(scheme)
  const latin = override.latin ?? resolved.latin ?? undefined
  const ea = override.ea ?? resolved.ea ?? undefined
  // 太字は実測値がある場合のみ写す（無い場合はスロット既定のウェイトに委ねる）
  const weight = resolved.bold == null ? undefined : resolved.bold ? '700' : '400'
  if (!latin && !ea) return { origin: 'none' }
  return { spec: { ...(latin ? { latin } : {}), ...(ea ? { ea } : {}), ...(weight ? { weight } : {}) }, origin: resolved.fontOrigin }
}

/** 書体の決定根拠を report の 1 項目に落とす。`defRPr` 由来は「テーマの宣言ではなく実測値から決めた」ため
 * `derived` として報告する（#316 の受け入れ基準） */
function fontFieldReport(spec: FontFamilySpec | undefined, origin: BrandFontOrigin, overridden: boolean, label: string): { status: BrandFieldStatus; detail?: string } {
  if (!spec) return { status: 'fallback', detail: `テンプレートから${label}書体を抽出できず既定フォントを使用` }
  if (overridden) return { status: 'ok', detail: '人が上書き' }
  return origin === 'defRPr' ? { status: 'derived', detail: 'プレースホルダ / slideMaster の defRPr 由来（fontScheme より優先）' } : { status: 'ok', detail: 'テーマの fontScheme 由来' }
}

function resolveFonts(profile: BrandProfile, overrides: BrandOverrides, assignedLayouts: AssignedLayout[], report: BrandImportReport): CompiledBrandTheme['fonts'] {
  const fontOverrides = overrides.fontOverrides
  const bySlot = indexBySlot(assignedLayouts)
  const heading = resolveFontSlot(profile.fonts.major, findPlaceholderText(bySlot, HEADING_FONT_SLOTS, 'title'), { latin: fontOverrides?.heading, ea: fontOverrides?.headingEa })
  const body = resolveFontSlot(profile.fonts.minor, findPlaceholderText(bySlot, BODY_FONT_SLOTS, 'body'), { latin: fontOverrides?.body, ea: fontOverrides?.bodyEa })
  report.fields['fonts.heading'] = fontFieldReport(heading.spec, heading.origin, Boolean(fontOverrides?.heading || fontOverrides?.headingEa), '見出し')
  report.fields['fonts.body'] = fontFieldReport(body.spec, body.origin, Boolean(fontOverrides?.body || fontOverrides?.bodyEa), '本文')
  return {
    ...(heading.spec ? { heading: heading.spec } : {}),
    ...(body.spec ? { body: body.spec } : {}),
    ...resolveFontHierarchy(profile, overrides, bySlot, report),
  }
}

/** OOXML の pt を描画基準の px へ換算する。pt を EMU（1pt = 1/72 インチ）へ直し、EMU→px の換算は
 * 装飾と同じ `emuToPx`（キャンバス幅 `SLIDE_WIDTH` 基準）に委ねる。`slideSize` が無い・不正な
 * テンプレートは 96dpi 相当のスライド幅を仮定する（16:9 既定の PPTX と同じ 1pt ≒ 1.333px になる） */
function ptToPx(pt: number, slideSize: BrandProfile['slideSize']): number {
  const widthEmu = slideSize && slideSize.widthEmu > 0 ? slideSize.widthEmu : FALLBACK_SLIDE_WIDTH_EMU
  return emuToPx((pt * EMU_PER_INCH) / PT_PER_INCH, widthEmu, SLIDE_WIDTH)
}

/**
 * 型階層（`baseFontSize` と `fontSizeRatios`。#187 の受け皿）を、割り当て済みレイアウトのプレースホルダの
 * 実サイズ（`a:defRPr@sz`）から導出する（#316）。基準（1.0）は本文枠の body プレースホルダのサイズで、
 * これが取れないと比率を出せないため段は空になる。比率は無次元なので pt のまま計算し、`baseFontSize` だけ
 * px へ換算する（pt をそのまま px として使うと 1/1.33 に縮む）
 */
function resolveFontHierarchy(profile: BrandProfile, overrides: BrandOverrides, bySlot: Map<LayoutAssignmentSlot, AssignedLayout>, report: BrandImportReport): { baseFontSize?: number; fontSizeRatios?: Record<string, number> } {
  const basePt = findPlaceholderText(bySlot, BASE_SIZE_SLOTS, 'body')?.sizePt
  const extractedRatios: Record<string, number> = {}
  if (basePt != null && basePt > 0) {
    for (const [slot, step] of Object.entries(SLOT_TO_FONT_SIZE_STEP)) {
      const sizePt = step ? findPlaceholderText(bySlot, [slot as LayoutAssignmentSlot], 'title')?.sizePt : undefined
      // 比率は 3 桁で丸めて JSON を安定させる（同じ入力から必ず同じ値になる）
      if (step && sizePt != null && sizePt > 0) extractedRatios[step] = Math.round((sizePt / basePt) * 1000) / 1000
    }
  }

  const overriddenBase = overrides.fontOverrides?.baseFontSize
  const extractedBase = basePt != null && basePt > 0 ? ptToPx(basePt, profile.slideSize) : undefined
  const baseFontSize = overriddenBase ?? extractedBase
  const merged = { ...extractedRatios, ...overrides.fontOverrides?.fontSizeRatios }
  const ratioKeys = Object.keys(merged)
  const fontSizeRatios = ratioKeys.length > 0 ? merged : undefined

  if (baseFontSize == null) {
    report.fields['fonts.baseFontSize'] = { status: 'missing', detail: '本文プレースホルダ（defRPr）の文字サイズを抽出できず既定サイズを使用' }
  } else if (overriddenBase != null) {
    report.fields['fonts.baseFontSize'] = { status: 'ok', detail: '人が上書き' }
  } else {
    report.fields['fonts.baseFontSize'] = { status: 'derived', detail: `本文プレースホルダの ${basePt}pt から px へ換算` }
  }
  report.fields['fonts.fontSizeRatios'] = fontSizeRatios
    ? { status: 'derived', detail: `slideLayout のプレースホルダから ${ratioKeys.join(' / ')} を導出` }
    : { status: 'missing', detail: '型階層の段（タイトルの文字サイズ）を抽出できなかった' }

  return { ...(baseFontSize != null ? { baseFontSize } : {}), ...(fontSizeRatios ? { fontSizeRatios } : {}) }
}

/** `manualLogo` は明示指定（`null` も「ロゴなし」という明示選択として優先する）。未指定時のみ候補選択にフォールバックする */
function resolveLogo(profile: BrandProfile, overrides: BrandOverrides): MediaAsset | null {
  if (overrides.manualLogo !== undefined) return overrides.manualLogo
  if (overrides.selectedLogoIndex == null) return null
  return profile.logoCandidates[overrides.selectedLogoIndex]?.image ?? null
}

/** EMU をスライド全体のサイズから描画基準（幅は `SLIDE_WIDTH` 固定、高さは呼び出し元が渡す canvasHeight）へ換算する */
function emuToPx(emu: number, slideEmu: number, canvasPx: number): number {
  if (slideEmu <= 0) return canvasPx
  return Math.round((emu / slideEmu) * canvasPx)
}

function buildDecorations(profile: BrandProfile, overrides: BrandOverrides, logo: MediaAsset | null, canvasHeight: number, report: BrandImportReport): MasterDecoration[] {
  const decorations: MasterDecoration[] = []
  if (logo) {
    const selected = overrides.selectedLogoIndex != null ? profile.logoCandidates[overrides.selectedLogoIndex] : undefined
    const size = selected && profile.slideSize ? { widthEmu: selected.widthEmu, heightEmu: selected.heightEmu } : undefined
    decorations.push({
      type: 'logo',
      anchor: 'bottom-right',
      src: mediaAssetToDataUrl(logo),
      width: size && profile.slideSize ? emuToPx(size.widthEmu, profile.slideSize.widthEmu, SLIDE_WIDTH) : undefined,
      height: size && profile.slideSize ? emuToPx(size.heightEmu, profile.slideSize.heightEmu, canvasHeight) : undefined,
    })
  }

  const selectedBands = (overrides.selectedBandIndices ?? []).map((i) => profile.bandCandidates[i]).filter((b): b is BandCandidate => b !== undefined)
  report.fields.bands = {
    status: selectedBands.length > 0 ? 'ok' : profile.bandCandidates.length > 0 ? 'missing' : 'missing',
    detail: selectedBands.length > 0 ? undefined : profile.bandCandidates.length > 0 ? '帯候補は検出済みだが人が未選択' : '帯候補が検出されなかった',
  }
  for (const band of selectedBands) {
    decorations.push(bandToDecoration(band, profile.slideSize, canvasHeight))
  }
  return decorations
}

function bandToDecoration(band: BandCandidate, slideSize: BrandProfile['slideSize'], canvasHeight: number): MasterDecoration {
  const thickness = slideSize ? emuToPx(band.thicknessEmu, band.orientation === 'horizontal' ? slideSize.heightEmu : slideSize.widthEmu, band.orientation === 'horizontal' ? canvasHeight : SLIDE_WIDTH) : undefined
  return { type: 'band', anchor: band.anchor, orientation: band.orientation, color: band.colorHex, thickness }
}

/** `MediaAsset` を `<img src>` に直接渡せる data URL へ変換する（サムネイル・ロゴ候補の表示で共有する） */
export function mediaAssetToDataUrl(asset: MediaAsset): string {
  return `data:${asset.contentType};base64,${asset.base64}`
}

/** 12 キーすべてを `brand` master に scope した CSS 変数トークンへ写す（生成 CSS 文字列ではなく値のみ） */
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
    fonts: {
      ...base?.fonts,
      ...(compiled.fonts.heading ? { heading: compiled.fonts.heading } : {}),
      ...(compiled.fonts.body ? { body: compiled.fonts.body } : {}),
      ...(compiled.fonts.baseFontSize != null ? { baseFontSize: compiled.fonts.baseFontSize } : {}),
      // 型階層はキー単位でマージする（既存テーマが持つ段を消さない）。合成規則は `mergeThemeData` と
      // 同じ `mergeRecord` を使い、ブランド取り込み経路だけ規則がずれないようにする
      ...(compiled.fonts.fontSizeRatios ? { fontSizeRatios: mergeRecord(base?.fonts?.fontSizeRatios, compiled.fonts.fontSizeRatios) } : {}),
    },
    masters: { ...base?.masters, ...compiled.masters },
    masterMap: { ...base?.masterMap, ...compiled.masterMap },
    tokens: { ...base?.tokens, ...compiled.tokens },
    ...(compiled.canvas ? { canvas: { ...base?.canvas, ...compiled.canvas } } : {}),
  }
}
