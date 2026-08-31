/** プレゼンテーション全体のデータ */
export interface PresentationData {
  meta: PresentationMeta
  theme?: ThemeData
  slides: SlideData[]
  /**
   * meta.brandTheme の解決済み ThemeData（実行時専用・スキーマ外）。
   * ローカル .spkg パッケージ読み込み時（localSlideLoader.ts）に baseDir 基準でアセット参照を解決した上で設定される。
   * 未設定（Web/ビルド同梱経由）の場合は meta.brandTheme のパスから呼び出し側が fetchThemeData で取得する。
   */
  resolvedBrandTheme?: ThemeData
}

/** プレゼンテーションのメタ情報 */
export interface PresentationMeta {
  title: string
  description?: string
  author?: string
  logo?: LogoConfig
  /** Confidential等の透かし文言。描画は内部的に TextMasterDecoration へ合成される（#394） */
  confidential?: ConfidentialConfig
  themeColors?: string
  /** 組織/ブランドテーマ（外部 ThemeData への参照パスまたは URL）。4段カスケードの下地として適用される */
  brandTheme?: string
}

/** ロゴ設定。描画は内部的に LogoMasterDecoration へ合成される（#350）。anchor/offset/only 未指定時は
 * 現行と同一の位置（bottom-left・offset { x: 30, y: -20 } 相当）になる */
export interface LogoConfig {
  src: string
  width?: number
  height?: number
  /** 省略時 'bottom-left'（現行の position: absolute; bottom: 20px; left: 30px; と同じ位置） */
  anchor?: MasterAnchor
  /** 省略時 { x: 30, y: -20 }（bottom アンカーは offset.y が負方向で辺から離れる） */
  offset?: { x?: number; y?: number }
  /** 本文領域全体を使うコンポーネント（hierarchyDiagram/flow等）と重なるスライドをロゴから除外する等に使う */
  only?: MasterDecorationOnly
}

/** Confidential等の透かし設定。描画は内部的に TextMasterDecoration へ合成される（#394）。
 * meta.logo（LogoConfig）と対称な語彙にしているが、anchor/offset の既定値は意図的に異なる（bottom-left
 * ではなく top-right）。meta.logo の既定位置が bottom-left のため、confidential も同じ既定にすると
 * 両方指定した場合に常に重なってしまうため、confidential だけ既定を右上に置いている。opacity/rotate/anchor
 * を指定すれば斜め・半透明の典型的な透かし表現にできる */
export interface ConfidentialConfig {
  text: string
  fontSize?: number
  color?: string
  /** 省略時 'top-right'（meta.logo の既定位置 bottom-left と重ならないようにするため） */
  anchor?: MasterAnchor
  /** 省略時 { x: -30, y: 20 }（top-right 用。他の anchor を使う場合は明示すること） */
  offset?: { x?: number; y?: number }
  /** 本文領域全体を使うコンポーネント（hierarchyDiagram/flow等）と重なるスライドを除外する等に使う */
  only?: MasterDecorationOnly
  /** 不透明度（0〜1）。省略時は 1（透かしにする場合は 0.1〜0.2 程度を指定する） */
  opacity?: number
  /** 回転角（deg・時計回り）。省略時は 0（斜めの透かしにする場合は -30 等を指定する） */
  rotate?: number
}

/** 個別スライドのデータ */
export interface SlideData {
  id: string
  layout: string
  content: SlideContent
  meta?: SlideMeta
}

/** スライドのコンテンツ */
export interface SlideContent {
  title?: string
  /** タイトルの文字サイズ(px)を明示指定する（center レイアウトの表紙・章扉のみ有効）。省略時はコンテンツの
   * 長さに応じて自動的に縮小する（はみ出さない範囲で最大サイズを保つ。useAutoFitHeadingFontSize） */
  titleFontSize?: number
  subtitle?: string
  body?: string
  items?: ContentItem[]
  component?: ComponentReference
  [key: string]: unknown
}

/** リスト等のコンテンツ項目 */
export interface ContentItem {
  text: string
  emphasis?: boolean
  fragment?: boolean
  fragmentIndex?: number
  items?: ContentItem[]
}

/** カスタムコンポーネントへの参照 */
export interface ComponentReference {
  name: string
  props?: Record<string, unknown>
  style?: Record<string, string | number>
}

/** slides[].meta.logo（このスライドだけの上書き・#393）。meta.logo（PresentationMeta.logo）をフィールド単位で
 * 部分上書きする。個別スライド指定が優先する（meta.backgroundColor/backgroundImage と同型の優先順位）。
 * 未指定のフィールドは meta.logo の値を継承する。hidden: true を指定するとこのスライドだけロゴを非表示にする */
export interface SlideLogoOverride extends Partial<LogoConfig> {
  hidden?: boolean
}

/** slides[].meta.confidential（このスライドだけの上書き・#393）。meta.confidential
 * （PresentationMeta.confidential）を SlideLogoOverride と同じ規則で部分上書きする */
export interface SlideConfidentialOverride extends Partial<ConfidentialConfig> {
  hidden?: boolean
}

/** スライドのノート情報 */
export interface SlideNotes {
  /** スピーカーノート（発表者メモ・台本） */
  speakerNotes?: string
  /** 要点サマリー（箇条書き用の配列） */
  summary?: string[]
  /** 音声ファイルへの相対パス */
  voice?: string
}

/** 音声再生の状態 */
export type AudioPlaybackState = 'idle' | 'playing' | 'paused'

/** スライドのメタ情報 */
export interface SlideMeta {
  transition?: string
  notes?: string | SlideNotes
  backgroundImage?: string
  backgroundColor?: string
  /** このスライドに直接適用する masterKey。masterMap による layout/variant 解決より優先する（#185） */
  master?: string
  /** このスライドが属する章のタイトル。同じ値が連続するスライドを1つの章として扱い、章番号・開始ページは
   * 宣言順から導出する（buildSections・#191）。未指定のスライドは章に属さない（表紙・締め等） */
  section?: string
  /** meta.logo（プレゼンテーション全体設定）をこのスライドだけ上書きする（#393）。個別スライド指定が優先する
   * （meta.backgroundColor/backgroundImage と同型の優先順位）。未指定のスライドは現行と完全同一の見た目になる */
  logo?: SlideLogoOverride
  /** meta.confidential（プレゼンテーション全体設定）をこのスライドだけ上書きする（#393）。logo と同じ優先順位・
   * 部分上書き規則 */
  confidential?: SlideConfidentialOverride
}

/** slides[].meta.section の連続ブロックから導出した章（#191）。装飾テキストへの章番号・章タイトルの差し込みと、
 * 目次スライドの章番号・開始ページの自動整合に使う */
export interface SectionInfo {
  /** 章タイトル（meta.section の値） */
  title: string
  /** 宣言順の章番号（1始まり） */
  number: number
  /** 章の先頭スライドの index（0始まり） */
  startIndex: number
  /** 章に属するスライドの枚数 */
  slideCount: number
}

/** 発表者ビューに同期されるスライド状態 */
export interface PresenterSlideState {
  currentIndex: number
  currentSlide: SlideData
  previousSlide: SlideData | null
  nextSlide: SlideData | null
  totalSlides: number
}

/** 音声・スライドショーの制御状態 */
export interface PresenterControlState {
  isPlaying: boolean
  autoPlay: boolean
  autoSlideshow: boolean
  hasVoice: boolean
  /** 音声読み込みに失敗した場合 true */
  hasError: boolean
  scrollSpeed: number
}

/** 円形/バー型プログレス表示の状態（メイン画面・発表者ビュー間で共通） */
export interface PresenterProgressState {
  progress: number
  visible: boolean
  /** CSS アニメーション用 duration（秒）。none 時は undefined */
  animationDuration?: number
  /** true の場合、アニメーションを現在位置で一時停止する */
  paused?: boolean
}

/** BroadcastChannel で送受信するメッセージ（双方向） */
export type PresenterViewMessage =
  // メインウィンドウ → 発表者ビュー
  | { type: 'slideChanged'; payload: { currentIndex: number; slides: SlideData[] } }
  | { type: 'controlStateChanged'; payload: PresenterControlState }
  | { type: 'progressChanged'; payload: PresenterProgressState }
  // 発表者ビュー → メインウィンドウ
  | { type: 'navigate'; payload: { direction: 'prev' | 'next' } }
  | { type: 'audioToggle' }
  | { type: 'autoPlayToggle' }
  | { type: 'autoSlideshowToggle' }
  | { type: 'scrollSpeedChange'; payload: { speed: number } }
  // メインウィンドウ → 発表者ビュー（パッケージ切替に伴う同梱アドオンの変更を伝搬する）
  | { type: 'addonsChanged'; payload: { owner: string; scripts: string[] } }
  // メインウィンドウ → 発表者ビュー（本編に適用中のテーマ・ロゴ・Confidential透かしを伝搬する）
  | { type: 'themeChanged'; payload: { themeColors?: string; theme?: ThemeData; brand?: ThemeData; logo?: LogoConfig; confidential?: ConfidentialConfig } }
  // 双方向
  | { type: 'presenterViewReady' }
  | { type: 'presenterViewClosed' }

/** テーマデータ */
export interface ThemeData {
  colors?: ColorPalette
  fonts?: FontDefinition
  /** アイコン名 → SVGアセットパス（image/配下）または外部URL。ComponentRegistryに'Icon:<name>'として登録され、content.tiles[].iconから参照できる（ブランドテーマ提供アイコンの登録経路。#201） */
  icons?: Record<string, string>
  customCSS?: string
  /** マスター定義（masterKey → 装飾セット）。SlideFrame の master-layer-back/front に描画される */
  masters?: Record<string, MasterDefinition>
  /** レイアウト種別（SlideData.layout の値）→ masterKey の対応表。未指定のレイアウトは装飾なし（現行と完全同一のDOM） */
  masterMap?: Record<string, string>
  /** CSS 変数トークン（キーは `--` を除いた変数名）。スコープキーは masterKey（buildMasterCss が
   * section[data-master="key"] スコープで出力する）または "*"（全体スコープ = :root。#190 の意匠トークンを
   * マスターに紐付けずデッキ全体へ指定する用途）。両方に同じ変数があれば masterKey 側が勝つ。
   * `<系列色var>-shade-1`〜`-shade-3`（例: `theme-series-1-shade-2`。primary/accent/series1〜6 に同じ規則。
   * #323）は系列色の明示の濃淡ランプで、colors.ts の shadeStep が読む。未指定色は shadeSeries の
   * alpha 合成にフォールバックする。`theme-motion-speed`（"*" スコープ推奨・未指定時 1）はエントランス
   * 演出・周期モーションの duration/delay を割ってスケールする速度係数。値が大きいほど再生が速くなる（#417） */
  tokens?: Record<string, Record<string, string>>
  /** 章（slides[].meta.section から導出・#191）ごとに巡回させるアクセント色のカラートークン名の配列（#319）。
   * 章番号から色への巡回規則は resolveSectionAccent（applyTheme.ts）が単一の真実源。
   * 要素はカラートークン名（THEME_COLOR_TOKENS のキー。primary / series1〜series6 等）で、生の色（hex）は受けない
   * （テーマ追従を壊さないため）。上書きするのは章内の `--theme-primary` と `--theme-series-1`（および -rgb companion）
   * だけで、accent / series2〜series6 は変えない（系列色はデータ系列の識別に使うもので章とは直交する概念だから）。
   * 未指定・空配列なら章による色替えを行わない（現行と完全同一） */
  sectionAccents?: string[]
  /** キャンバスサイズ・セーフエリア（#188）。未指定時は現行と完全同一（1280x720 / 各辺60px） */
  canvas?: CanvasData
}

/** キャンバスの保護領域（px）。マスター装飾と本文が重ならないよう .master-body の余白として使う（#188）。
 * 未指定の辺は CSS 側の var() フォールバックで 60px（現行の .master-body padding と同一）になる */
export interface SafeArea {
  top?: number
  right?: number
  bottom?: number
  left?: number
}

/** キャンバス定義（スライドサイズ・セーフエリア）。useReveal の初期化・pdfExport の用紙比率・
 * SlidePreview/PresenterViewWindow の縮小表示の基準に使う（#188）。width/height 未指定時は
 * useReveal.SLIDE_WIDTH/SLIDE_HEIGHT（1280x720）にフォールバックする */
export interface CanvasData {
  width?: number
  height?: number
  safeArea?: SafeArea
}

/** マスター装飾のアンカー位置（9方向） */
export type MasterAnchor = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'middle-center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'

/** 装飾を適用するスライドの絞り込み条件（ページ番号をタイトルスライドに出さない等の用途）。
 * middle は最初と最後以外（表紙と締めを除く）、section-first / not-section-first は
 * meta.section から導出した章の先頭スライド（章扉）を基準にする（#191） */
export type MasterDecorationOnly = 'first' | 'last' | 'not-first' | 'all' | 'middle' | 'section-first' | 'not-section-first'

/** 描画レイヤー（SlideFrame の .master-layer-back / .master-layer-front に対応） */
export type MasterDecorationLayer = 'back' | 'front'

interface MasterDecorationBase {
  anchor: MasterAnchor
  offset?: { x?: number; y?: number }
  only?: MasterDecorationOnly
  layer?: MasterDecorationLayer
  /** 不透明度（0〜1）。省略時は 1。透かし（機密表記等）を薄く敷く用途（#189） */
  opacity?: number
  /** 回転角（deg・時計回り）。アンカー位置を保ったまま要素の中心を軸に回す。斜め帯・回転させた透かしに使う（#189） */
  rotate?: number
}

/** 線形グラデーション（マスター背景と帯装飾で共通）。angle は CSS の linear-gradient と同じ deg（省略時 180 = 上→下） */
export interface MasterGradient {
  from: string
  to: string
  angle?: number
}

/** ロゴ装飾 */
export interface LogoMasterDecoration extends MasterDecorationBase {
  type: 'logo'
  src: string
  width?: number
  height?: number
}

/** 帯装飾（既定で辺いっぱいに伸びる）。gradient を指定すると color の代わりにグラデーションで塗る。
 * 斜め帯は装飾共通の rotate で表現する（shape 装飾を増やさず 6 種を維持する・#189） */
export interface BandMasterDecoration extends MasterDecorationBase {
  type: 'band'
  color?: string
  gradient?: MasterGradient
  thickness?: number
  orientation?: 'horizontal' | 'vertical'
}

/** 線装飾（長さを指定できる帯より短い区切り線）。borderRadius を足すと小さな図形（円・正方形）も表現できる。
 * length と thickness を同値にし borderRadius をその半分にすると円、省略または 0 なら正方形になる。
 * 「線」という名前と実体が乖離するが、小図形専用の shape 装飾を新設せず 6 種固定を維持するために
 * rule を流用する設計判断（#345。#189 の 6 種固定を崩さない） */
export interface RuleMasterDecoration extends MasterDecorationBase {
  type: 'rule'
  color?: string
  thickness?: number
  length?: number
  orientation?: 'horizontal' | 'vertical'
  /** 角丸の半径（px）。省略時は角丸なし。負値は 0 にクランプされ getMasterWarnings が警告する */
  borderRadius?: number
}

/** テキスト装飾（フッター・ページ番号・章見出し等）。content 内の {index}/{total} と
 * {sectionNumber}/{sectionTitle}/{sectionIndex}/{sectionTotal} は MasterRenderContext で展開される
 * （renderMasterText。`{sectionNumber:02}` のように `:0N` を付けるとN桁ゼロ詰め・#191） */
export interface TextMasterDecoration extends MasterDecorationBase {
  type: 'text'
  content: string
  fontSize?: number
  color?: string
}

/** 画像装飾 */
export interface ImageMasterDecoration extends MasterDecorationBase {
  type: 'image'
  src: string
  width?: number
  height?: number
}

/** アドオン等が ComponentRegistry に登録したコンポーネントへの装飾参照 */
export interface ComponentMasterDecoration extends MasterDecorationBase {
  type: 'component'
  name: string
  props?: Record<string, unknown>
}

/** マスター装飾（DSL膨張の歯止めとして6種に固定） */
export type MasterDecoration = LogoMasterDecoration | BandMasterDecoration | RuleMasterDecoration | TextMasterDecoration | ImageMasterDecoration | ComponentMasterDecoration

/** マスター背景の共通プロパティ */
interface MasterBackgroundBase {
  /** 不透明度（0〜1）。省略時は 1。薄めるとデッキ既定の背景（body の格子）が透けて見える */
  opacity?: number
  /** grid/gradient の背景に付く控えめな周期的アニメーション（他の種別では無視）。省略時は true 相当（動く）。
   * false を明示するとこのマスターだけ動きを止める（静止画としての一貫性を優先したい場合の opt-out） */
  motion?: boolean
}

/** 無地背景。テーマ背景色で塗り、デッキ既定の格子を隠す */
export interface PlainMasterBackground extends MasterBackgroundBase {
  type: 'plain'
}

/** 格子背景（デッキ既定の背景と同じ意匠。size で密度を変える）。
 * 格子線の色はマスタースコープの tokens（`theme-background-grid`）で変えられる */
export interface GridMasterBackground extends MasterBackgroundBase {
  type: 'grid'
  /** 格子の下地色。省略時は var(--theme-background) */
  color?: string
  /** 格子の間隔（px）。省略時はデッキ既定の格子と同じ間隔（--theme-background-grid-size） */
  size?: number
}

/** 全面塗り背景（章扉の反転面等） */
export interface FillMasterBackground extends MasterBackgroundBase {
  type: 'fill'
  color: string
}

/** グラデーション背景 */
export interface GradientMasterBackground extends MasterBackgroundBase, MasterGradient {
  type: 'gradient'
}

/** 画像背景（キャンバス全面に敷く。スライド個別の meta.backgroundImage と違いマスター単位で効く） */
export interface ImageMasterBackground extends MasterBackgroundBase {
  type: 'image'
  src: string
  /** 画像のフィット方法。省略時は cover */
  fit?: 'cover' | 'contain'
}

/** マスター背景意匠（#189）。装飾と同じくDSL膨張の歯止めとして5種に固定 */
export type MasterBackground = PlainMasterBackground | GridMasterBackground | FillMasterBackground | GradientMasterBackground | ImageMasterBackground

/** マスター定義。extends で他の master の decorations / background を継承できる（resolveMaster が循環を検出する） */
export interface MasterDefinition {
  extends?: string
  /** 背景意匠。省略時は背景要素を描かず、デッキ既定の背景（body の格子）がそのまま見える（現行と完全同一・#189）。
   * extends 先が背景を持つ場合は、自身に background を書いた方が勝つ */
  background?: MasterBackground
  decorations?: MasterDecoration[]
}

/** マスター装飾の描画に必要な文脈（ページ番号・章情報のテンプレート展開・only の位置判定に使う） */
export interface MasterRenderContext {
  index: number
  total: number
  /** このスライドが属する章。meta.section 未指定のスライド、および章を持たないデッキでは undefined（#191） */
  section?: SectionInfo
  /** デッキ全体の章一覧（buildSections で導出済み）。目次（content.toc）の章からの自動導出に使う（#195）。
   * SlideRenderer 経由の描画でのみ設定される */
  sections?: SectionInfo[]
}

/** カラーパレット（キーは THEME_COLOR_TOKENS と一致。外部 theme-colors.json と同じ項目を指定できる） */
export interface ColorPalette {
  primary?: string
  accent?: string
  background?: string
  backgroundAlt?: string
  backgroundGrid?: string
  text?: string
  textHeading?: string
  textBody?: string
  textSubtitle?: string
  textMuted?: string
  border?: string
  borderLight?: string
  codeText?: string
  success?: string
  warning?: string
  danger?: string
  neutral?: string
  link?: string
  linkVisited?: string
  /** 系列色（図表・構成図の項目分け用。#186）。未指定でも primary/accent から決定的に導出される */
  series1?: string
  series2?: string
  series3?: string
  series4?: string
  series5?: string
  series6?: string
  [key: string]: string | undefined
}

/** フォントソース定義 */
export interface FontSource {
  family: string
  /** ローカルフォントファイルパス（@font-face で登録） */
  src?: string
  /** 外部フォント URL（<link> タグで読み込み） */
  url?: string
  /** font-weight（例: '400', '700', 'normal', 'bold'）。省略時は 'normal' */
  weight?: string
  /** font-style（例: 'normal', 'italic'）。省略時は 'normal' */
  style?: string
  /** src 指定時のフォント形式ヒント（例: 'woff2', 'truetype'）。省略時は format() を付与しない */
  format?: string
  /** ローカルインストール済みフォント名（@font-face の local() ソースとして追加） */
  localName?: string
  /** 再配布ライセンス区分。省略時は 'permitted' 相当。'prohibited' は .spkg 書き出し時に src が自動除外される（#171） */
  redistribution?: 'permitted' | 'internal-only' | 'prohibited'
}

/** 書体スロット（heading/body/code）の詳細指定。和欧混植・ウェイト指定用（#187） */
export interface FontFamilySpec {
  /** 欧文（ラテン文字）用の書体名 */
  latin?: string
  /** 和文（東アジア文字）用の書体名。CSS の font-family では latin の後に置かれ、
   * latin でカバーされない文字（漢字・かな等）にブラウザの文字単位フォールバックで使われる */
  ea?: string
  /** font-weight（例: '400', '700', 'normal', 'bold'）。省略時は既定ウェイト（heading: 700 / body・code: 400） */
  weight?: string
}

/** フォント定義 */
export interface FontDefinition {
  /** 文字列指定は単一書体名（後方互換）。オブジェクト指定で和欧混植・ウェイトを個別に持てる（#187） */
  heading?: string | FontFamilySpec
  body?: string | FontFamilySpec
  code?: string | FontFamilySpec
  /** 基本フォントサイズ（px）。デフォルト 20px。全サイズをこの値を基準に比率で算出 */
  baseFontSize?: number
  /** 型階層の比率テーブル（キー → base比率）の上書き。未指定のキーは既定比率を使い、
   * 既定にないキーを追加すると型階層に段を追加できる（#187） */
  fontSizeRatios?: Record<string, number>
  /** フォントソースの配列 */
  sources?: FontSource[]
}

/** バリデーションエラー */
export interface ValidationError {
  path: string
  message: string
  expected: string
  actual: string
}
