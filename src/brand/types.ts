import type { FontFamilySpec, FontSource, MasterAnchor, MasterDefinition, SafeArea } from '../data'

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

/** ブランドマーク候補内の1個の形状（#346 のヒューリスティクス出力）。Rust `brand::MarkShape` と同じ形。
 * `isCircle` は `rule` + `borderRadius` への変換（円は辺の半分、正方形は0）の判断材料になる */
export interface MarkShape {
  xEmu: number
  yEmu: number
  widthEmu: number
  heightEmu: number
  colorHex: string
  isCircle: boolean
}

/** ブランドマーク候補（#346 のヒューリスティクス出力）。Rust `brand::MarkCandidate` と同じ形。
 * 同一サイズの単色小図形が複数近接して並んでいるまとまりを1候補とする。`BandCandidate` と同じく
 * 採否は人が確認ダイアログで決める前提の**候補**。採用すると `shapes` の各要素が `rule` + `borderRadius`
 * の装飾に変換される */
export interface MarkCandidate {
  shapes: MarkShape[]
}

/** 書体の決定根拠（#316）。Rust `brand::text_props::FontOrigin` と同じ値。
 * `fontScheme` は Office 既定値のままである可能性があり（作者が触っていない）、`defRPr` は
 * テンプレート作者がプレースホルダ / slideMaster に明示した実測値であることを表す */
export type BrandFontOrigin = 'none' | 'fontScheme' | 'defRPr'

/** プレースホルダ1件の既定文字プロパティ（継承解決済み。Rust `brand::PlaceholderTextProps` と同じ形。#316）。
 * 継承の解決順は OOXML 準拠で、プレースホルダの `a:defRPr` → slideMaster の `p:txStyles` → theme の
 * `a:fontScheme`（Rust 側で解決済み） */
export interface PlaceholderTextProps {
  latin: string | null
  ea: string | null
  cs: string | null
  /** 文字サイズ（pt）。型階層（表紙タイトル / 章タイトル / 本文）の抽出元 */
  sizePt: number | null
  bold: boolean | null
  colorHex: string | null
  fontOrigin: BrandFontOrigin
}

/** プレースホルダ種別の分類（#316）。Rust `brand::text_props::PlaceholderKind` と同じ値。
 * `p:ph@type` の OOXML 分類規則（`ST_PlaceholderType`・属性省略時は "body"）は抽出層（Rust）に置き、
 * フロントは分類済みのこの値だけを見る（同じ分類表を 2 言語で持たない） */
export type BrandPlaceholderKind = 'title' | 'body' | 'other'

/** 固定テキスト/ページ番号候補（#318 のヒューリスティクス出力）。Rust `brand::TextCandidate` と同じ形。
 * `BandCandidate` と同じく採否は人が確認ダイアログで決める前提の**候補**。矩形は EMU で、
 * `anchor`/`offset` への変換（`bandToDecoration` と同じ EMU→px 換算）は `compile()` の責務。
 * `content` に `{index}` が含まれる場合、`a:fld type="slidenum"` を含んでいたことを示す（Rust 側で置換済み） */
export interface TextCandidate {
  content: string
  xEmu: number
  yEmu: number
  widthEmu: number
  heightEmu: number
  sizePt: number | null
  colorHex: string | null
}

/** 埋め込みフォント（#318 のヒューリスティクス出力 + #321 の実体解決）。Rust `brand::opc::EmbeddedFont` と同じ形。
 * `payload` は非圧縮 EOT を剥がし sfnt マジックを検証済みの実体（#321 段階1）。圧縮（MicroType Express）・
 * 壊れたヘッダ・sfnt 不一致・参照未解決のいずれでも `null`（書体名のみへ退避） */
export interface EmbeddedFont {
  typeface: string
  hasRegular: boolean
  hasBold: boolean
  payload: MediaAsset | null
}

/** slideLayout の1プレースホルダ（Rust `brand::PlaceholderProfile` と同じ形） */
export interface PlaceholderProfile {
  phType: string | null
  idx: number | null
  kind: BrandPlaceholderKind
  /** `a:defRPr` 由来の既定文字プロパティ（#316）。書体は `fonts`（fontScheme）より優先する */
  text: PlaceholderTextProps
  /** `a:off`/`a:ext`（EMU）由来の矩形（#317）。layout 側に無ければ所属 slideMaster の同じプレースホルダ
   * から継承済み（Rust 側で解決）。`off`/`ext` のどちらかが欠けている場合は4フィールドすべて `null` */
  xEmu: number | null
  yEmu: number | null
  cxEmu: number | null
  cyEmu: number | null
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
  /** この master 自身の clrMap を通して確定した12キー（#300）。ライト用/ダーク用が別々の master に
   * 定義されているテンプレートで、どの master を基準にするか選ぶための情報 */
  mappedColors: Record<MappedColorKey, string | null>
  slideLayouts: SlideLayoutProfile[]
}

/** masterMap の割り当て可能な7枠（#185/#192 で5枠固定・#262 で反転面/締めの2枠を追加）。`<layout>` または
 * `<layout>/<variant>` の2形式のみで、`variant` はフロントの `content.variant` に実在する値に限る。
 * `resolveMaster`（`src/masters.ts`）は `masterMap["<layout>/<variant>"]` を汎用的に解決できるため、
 * 枠を追加するのに解決ロジック側の変更は不要（配列に追記するだけで済む）。
 * #197 で center に quote/message/message-inverse/closing の4 variant が加わったが、quote/message は
 * デッキ既定の背景で表示するため専用枠を持たず、既定の `center` 枠にフォールバックする。
 * message-inverse/closing は全面塗り（`theme.masters[].background`）を要するため専用枠が必要（#262） */
export const LAYOUT_ASSIGNMENT_SLOTS = ['center', 'center/section', 'center/message-inverse', 'center/closing', 'content', 'two-column', 'bleed'] as const

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
  /** 検出した固定テキスト/ページ番号候補（#318） */
  textCandidates: TextCandidate[]
  /** 検出したブランドマーク候補（#346） */
  markCandidates: MarkCandidate[]
  /** `p:embeddedFontLst` に列挙された埋め込みフォント（#318） */
  embeddedFonts: EmbeddedFont[]
  /** clrMap 適用後の 12 キー。値が取れなかったキーは `null`（`compile` がフォールバックする） */
  mappedColors: Record<MappedColorKey, string | null>
  fonts: BrandFontScheme
  /** 全 slideMaster と配下の slideLayout の列挙（#192）。1 枚目は上記の単数フィールド（`slideMasterPart`/
   * `mappedColors` 等）と同じ内容。取り込み確認ダイアログのレイアウト種別割り当てに使う */
  masters: MasterProfile[]
}

/** ライト/ダークの明示指定（#300）。`auto` はテンプレートの clrMap をそのまま採用する（既定）。
 * 曖昧なケース（theme 単体パッケージ等、slideMaster が無く clrMap の実データが無いテンプレート）で
 * 白背景+黒文字に決め打ちされるのを人が上書きできるようにする */
export type BrandColorScheme = 'auto' | 'light' | 'dark'

/** 並置比較ダイアログで人が加える上書き。`BrandProfile` と合わせて `brand-overrides.json`（テンプレハッシュキー）に保存する */
export interface BrandOverrides {
  /** 12 キーのうち人が上書きした値のみ持つ（未上書きのキーは省略） */
  colorHex?: Partial<Record<MappedColorKey, string>>
  /** 複数 slideMaster を持つテンプレートで、どの master（`profile.masters` の添字）を配色の基準にするか（#300）。
   * 未指定時は `profile.mappedColors`（常に1枚目基準）を使う */
  selectedMasterIndex?: number | null
  /** ライト/ダークの明示指定（#300）。未指定時は `auto`（テンプレート通り） */
  colorScheme?: BrandColorScheme
  /** `logoCandidates` から選んだ候補の index。ロゴなしを選んだ場合は `null` */
  selectedLogoIndex?: number | null
  /** 候補に無い画像を人が直接指定した場合。指定時は `selectedLogoIndex` より優先する */
  manualLogo?: MediaAsset | null
  /** `bandCandidates` から装飾として採用する index の一覧（既定は空＝何も自動適用しない） */
  selectedBandIndices?: number[]
  /** `textCandidates` から装飾として採用する index の一覧（既定は空＝何も自動適用しない。#318） */
  selectedTextIndices?: number[]
  /** `markCandidates` から装飾として採用する index の一覧（既定は空＝何も自動適用しない。#346） */
  selectedMarkIndices?: number[]
  /** 採用したテキスト候補ごとの表示形式（#318）。key は `textCandidates` の添字（文字列化）。
   * `indexTotal` は `{index}` を `{index}/{total}` に展開する。未指定の候補は `{index}` のまま */
  textIndexFormats?: Record<string, 'index' | 'indexTotal'>
  /** 書体と型階層の上書き（#316 で和文・型階層を追加）。`heading`/`body` は欧文（latin）、
   * `headingEa`/`bodyEa` は和文（ea）。`baseFontSize` は px、`fontSizeRatios` はキー単位の比率上書き */
  fontOverrides?: {
    heading?: string
    body?: string
    headingEa?: string
    bodyEa?: string
    baseFontSize?: number
    fontSizeRatios?: Record<string, number>
  }
  /** 抽出した slideLayout を `LAYOUT_ASSIGNMENT_SLOTS` の枠へ割り当てた結果（#192）。
   * key は `"<masterIndex>:<layoutIndex>"`（`BrandProfile.masters` の添字）。未割当のレイアウトは省略する */
  layoutAssignments?: Record<string, LayoutAssignmentSlot>
  /** `canvas.safeArea`（#188/#317）の辺単位の上書き。未指定の辺は導出値（無ければ CSS 側の既定 60px）のまま */
  safeAreaOverrides?: Partial<SafeArea>
  /** 取り込んだ埋め込みフォント実体（`embeddedFonts[].payload`）の再配布ライセンス区分（#171/#321）。
   * key は `embeddedFonts` の添字（文字列化）。値が無い候補は区分未確定として扱い、`payload` があっても
   * `compile()` は `src` を書かない（人が確認ダイアログで明示的に区分を選ぶまで実体を同梱しない）。
   * `'prohibited'` を選んだ場合も同様に `src` を書かない（#171 の再配布禁止ゲート） */
  embeddedFontRedistribution?: Record<string, 'permitted' | 'internal-only' | 'prohibited'>
}

/** `compile` の出力。生成 CSS 文字列は含めない（Epic #173 の方針）。フォント/masters/decorations は
 * `ThemeData` へそのまま合成でき、`colors` は theme/<slug>.json 相当の 12 キーをそのまま保持する */
export interface CompiledBrandTheme {
  colors: Record<MappedColorKey, string>
  /** 抽出した latin/ea/major/minor を潰さずに写す（#187）。取得できなかったスロットは省略する。
   * `baseFontSize`/`fontSizeRatios` は slideLayout のプレースホルダの `a:defRPr@sz` から導出した
   * 型階層（#316）。段が取れなかった場合は省略する（既定の型階層のまま）。
   * `sources` は埋め込みフォントを登録したもの（#318/#321）。`BrandOverrides.embeddedFontRedistribution` で
   * 人が再配布ライセンス区分を明示的に選ぶまでは `local()` 参照のみ（`src` を書かない）。区分を選んだ後は
   * 実体（非圧縮 EOT のみ。#171 の再配布ゲート対象）を data URL の `src` として同梱する */
  fonts: { heading?: FontFamilySpec; body?: FontFamilySpec; baseFontSize?: number; fontSizeRatios?: Record<string, number>; sources?: FontSource[] }
  masters: Record<string, MasterDefinition>
  masterMap: Record<string, string>
  tokens: Record<string, Record<string, string>>
  logo: MediaAsset | null
  /** `profile.slideSize` から生成したキャンバスサイズ（#188）。`slideSize` が無い場合は undefined（既定の 1280x720 のまま）。
   * `safeArea` は `content` 枠のレイアウトの body プレースホルダ矩形から導出する（#317）。導出できない
   * （body プレースホルダが無い等）場合は省略し、CSS 側の既定（全辺60px）に委ねる */
  canvas?: { width: number; height: number; safeArea?: SafeArea }
}

export type BrandFieldStatus = 'ok' | 'derived' | 'fallback' | 'missing'

/** 項目単位の取り込み結果（#168 の受け入れ基準）。key は "colors.bg1" 等のドット区切り */
export interface BrandImportReport {
  fields: Record<string, { status: BrandFieldStatus; detail?: string }>
}
