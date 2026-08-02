/** プレゼンテーション全体のデータ */
export interface PresentationData {
  meta: PresentationMeta
  theme?: ThemeData
  slides: SlideData[]
}

/** プレゼンテーションのメタ情報 */
export interface PresentationMeta {
  title: string
  description?: string
  author?: string
  logo?: LogoConfig
  themeColors?: string
}

/** ロゴ設定 */
export interface LogoConfig {
  src: string
  width?: number
  height?: number
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
  // メインウィンドウ → 発表者ビュー（本編に適用中のテーマ・ロゴを伝搬する）
  | { type: 'themeChanged'; payload: { themeColors?: string; theme?: ThemeData; logo?: LogoConfig } }
  // 双方向
  | { type: 'presenterViewReady' }
  | { type: 'presenterViewClosed' }

/** テーマデータ */
export interface ThemeData {
  colors?: ColorPalette
  fonts?: FontDefinition
  customCSS?: string
  /** マスター定義（masterKey → 装飾セット）。SlideFrame の master-layer-back/front に描画される */
  masters?: Record<string, MasterDefinition>
  /** レイアウト種別（SlideData.layout の値）→ masterKey の対応表。未指定のレイアウトは装飾なし（現行と完全同一のDOM） */
  masterMap?: Record<string, string>
  /** masterKey ごとの CSS 変数トークン。buildMasterCss が section[data-master="key"] スコープで出力する */
  tokens?: Record<string, Record<string, string>>
}

/** マスター装飾のアンカー位置（9方向） */
export type MasterAnchor = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'middle-center' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right'

/** 装飾を適用するスライドの絞り込み条件（ページ番号をタイトルスライドに出さない等の用途） */
export type MasterDecorationOnly = 'first' | 'last' | 'not-first' | 'all'

/** 描画レイヤー（SlideFrame の .master-layer-back / .master-layer-front に対応） */
export type MasterDecorationLayer = 'back' | 'front'

interface MasterDecorationBase {
  anchor: MasterAnchor
  offset?: { x?: number; y?: number }
  only?: MasterDecorationOnly
  layer?: MasterDecorationLayer
}

/** ロゴ装飾 */
export interface LogoMasterDecoration extends MasterDecorationBase {
  type: 'logo'
  src: string
  width?: number
  height?: number
}

/** 帯装飾（既定で辺いっぱいに伸びる） */
export interface BandMasterDecoration extends MasterDecorationBase {
  type: 'band'
  color?: string
  thickness?: number
  orientation?: 'horizontal' | 'vertical'
}

/** 線装飾（長さを指定できる帯より短い区切り線） */
export interface RuleMasterDecoration extends MasterDecorationBase {
  type: 'rule'
  color?: string
  thickness?: number
  length?: number
  orientation?: 'horizontal' | 'vertical'
}

/** テキスト装飾（フッター・ページ番号等）。content 内の {index}/{total} は MasterRenderContext で展開される */
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

/** マスター定義。extends で他の master の decorations を継承できる（resolveMaster が循環を検出する） */
export interface MasterDefinition {
  extends?: string
  decorations?: MasterDecoration[]
}

/** マスター装飾の描画に必要な文脈（ページ番号のテンプレート展開・only の位置判定に使う） */
export interface MasterRenderContext {
  index: number
  total: number
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
}

/** フォント定義 */
export interface FontDefinition {
  heading?: string
  body?: string
  code?: string
  /** 基本フォントサイズ（px）。デフォルト 20px。全サイズをこの値を基準に比率で算出 */
  baseFontSize?: number
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
