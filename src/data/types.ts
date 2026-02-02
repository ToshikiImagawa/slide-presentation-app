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

/** BroadcastChannel で送受信するメッセージ（双方向） */
export type PresenterViewMessage =
  // メインウィンドウ → 発表者ビュー
  | { type: 'slideChanged'; payload: { currentIndex: number; slides: SlideData[] } }
  | { type: 'controlStateChanged'; payload: PresenterControlState }
  | { type: 'progressChanged'; payload: { progress: number; visible: boolean; animationDuration?: number } }
  // 発表者ビュー → メインウィンドウ
  | { type: 'navigate'; payload: { direction: 'prev' | 'next' } }
  | { type: 'audioToggle' }
  | { type: 'autoPlayToggle' }
  | { type: 'autoSlideshowToggle' }
  | { type: 'scrollSpeedChange'; payload: { speed: number } }
  // 双方向
  | { type: 'presenterViewReady' }
  | { type: 'presenterViewClosed' }

/** テーマデータ */
export interface ThemeData {
  colors?: ColorPalette
  fonts?: FontDefinition
  customCSS?: string
}

/** カラーパレット */
export interface ColorPalette {
  primary?: string
  accent?: string
  background?: string
  text?: string
  [key: string]: string | undefined
}

/** フォントソース定義 */
export interface FontSource {
  family: string
  /** ローカルフォントファイルパス（@font-face で登録） */
  src?: string
  /** 外部フォント URL（<link> タグで読み込み） */
  url?: string
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
