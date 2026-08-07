import type { MasterAnchor, MasterDefinition } from '../data'

/** `p:clrMap` 適用後の 12 キー（Rust `brand::MappedColors` と同じ並び・camelCase）。 */
export const MAPPED_COLOR_KEYS = ['bg1', 'tx1', 'bg2', 'tx2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink'] as const

export type MappedColorKey = (typeof MAPPED_COLOR_KEYS)[number]

/** base64 画像バイト列（サムネイル・ロゴ候補）。Rust `brand::MediaAsset` と同じ形 */
export interface MediaAsset {
  contentType: string
  base64: string
}

/** スライドサイズ（EMU）。Rust `brand::opc::SlideSize` と同じ形 */
export interface SlideSize {
  widthEmu: number
  heightEmu: number
}

/** ロゴ候補（#168 のヒューリスティクス出力）。採否は人が確認ダイアログで決める */
export interface LogoCandidate {
  nameHint: string | null
  image: MediaAsset
  widthEmu: number
  heightEmu: number
  xEmu: number
  yEmu: number
}

/** 帯候補（#168 のヒューリスティクス出力）。`anchor`/`orientation` は `MasterDecoration` の語彙と一致する */
export interface BandCandidate {
  orientation: 'horizontal' | 'vertical'
  anchor: MasterAnchor
  colorHex: string
  thicknessEmu: number
}

/** slideLayout の1プレースホルダ（Rust `brand::PlaceholderProfile` と同じ形） */
export interface PlaceholderProfile {
  phType: string | null
  idx: number | null
}

/** slideLayout から抽出した内容（#192）。Rust `brand::SlideLayoutProfile` と同じ形。
 * ロゴ・帯のヒューリスティクスは slideMaster 側のみで行うため、ここに含まれるのは名前・種別・プレースホルダ構成・背景のみ */
export interface SlideLayoutProfile {
  part: string
  name: string | null
  layoutType: string | null
  placeholders: PlaceholderProfile[]
  backgroundColorHex: string | null
}

/** slideMaster 1枚から抽出した内容（#192）。Rust `brand::MasterProfile` と同じ形 */
export interface MasterProfile {
  part: string
  slideLayouts: SlideLayoutProfile[]
}

/** #185/#192 契約で固定された masterMap の割り当て可能な5枠。`<layout>` または `<layout>/<variant>` の
 * 2形式のみで、`variant` はフロントの `content.variant` に実在する値（現状 'section' のみ）に限る */
export const LAYOUT_ASSIGNMENT_SLOTS = ['center', 'center/section', 'content', 'two-column', 'bleed'] as const

export type LayoutAssignmentSlot = (typeof LAYOUT_ASSIGNMENT_SLOTS)[number]

/** `a:fontScheme` の書体 1 組。Rust `brand::theme_xml::FontFace` と同じ形 */
export interface BrandFontFace {
  latin: string | null
  ea: string | null
  cs: string | null
  jpan: string | null
}

export interface BrandFontScheme {
  major: BrandFontFace
  minor: BrandFontFace
}

/** Rust から渡される抽出結果（#167 決定的抽出 + #168 ヒューリスティクス候補）。JSON はすべて camelCase */
export interface BrandProfile {
  name: string | null
  themePart: string
  slideMasterPart: string | null
  /** テンプレートファイル本体の sha256（hex）。上書きの永続化キーに使う */
  templateHash: string
  slideSize: SlideSize | null
  thumbnail: MediaAsset | null
  logoCandidates: LogoCandidate[]
  bandCandidates: BandCandidate[]
  /** clrMap 適用後の 12 キー。値が取れなかったキーは `null`（`compile` がフォールバックする） */
  mappedColors: Record<MappedColorKey, string | null>
  fonts: BrandFontScheme
  /** 全 slideMaster と配下の slideLayout の列挙（#192）。1 枚目は上記の単数フィールド（`slideMasterPart`/
   * `mappedColors` 等）と同じ内容。取り込み確認ダイアログのレイアウト種別割り当てに使う */
  masters: MasterProfile[]
}

/** 並置比較ダイアログで人が加える上書き。`BrandProfile` と合わせて `brand-overrides.json`（テンプレハッシュキー）に保存する */
export interface BrandOverrides {
  /** 12 キーのうち人が上書きした値のみ持つ（未上書きのキーは省略） */
  colorHex?: Partial<Record<MappedColorKey, string>>
  /** `logoCandidates` から選んだ候補の index。ロゴなしを選んだ場合は `null` */
  selectedLogoIndex?: number | null
  /** 候補に無い画像を人が直接指定した場合。指定時は `selectedLogoIndex` より優先する */
  manualLogo?: MediaAsset | null
  /** `bandCandidates` から装飾として採用する index の一覧（既定は空＝何も自動適用しない） */
  selectedBandIndices?: number[]
  fontOverrides?: { heading?: string; body?: string }
  /** 抽出した slideLayout を5枠（`LAYOUT_ASSIGNMENT_SLOTS`）へ割り当てた結果（#192）。
   * key は `"<masterIndex>:<layoutIndex>"`（`BrandProfile.masters` の添字）。未割当のレイアウトは省略する */
  layoutAssignments?: Record<string, LayoutAssignmentSlot>
}

/** `compile` の出力。生成 CSS 文字列は含めない（Epic #173 の方針）。フォント/masters/decorations は
 * `ThemeData` へそのまま合成でき、`colors` は theme/<slug>.json 相当の 12 キーをそのまま保持する */
export interface CompiledBrandTheme {
  colors: Record<MappedColorKey, string>
  fonts: { heading?: string; body?: string }
  masters: Record<string, MasterDefinition>
  masterMap: Record<string, string>
  tokens: Record<string, Record<string, string>>
  logo: MediaAsset | null
  /** `profile.slideSize` から生成したキャンバスサイズ（#188）。`slideSize` が無い場合は undefined（既定の 1280x720 のまま） */
  canvas?: { width: number; height: number }
}

export type BrandFieldStatus = 'ok' | 'derived' | 'fallback' | 'missing'

/** 項目単位の取り込み結果（#168 の受け入れ基準）。key は "colors.bg1" 等のドット区切り */
export interface BrandImportReport {
  fields: Record<string, { status: BrandFieldStatus; detail?: string }>
}
