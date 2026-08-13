import { createElement } from 'react'
import type { CanvasData, ColorPalette, FontDefinition, FontFamilySpec, FontSource, SafeArea, SlideContent, SlideData, ThemeData } from './data'
import { buildMasterCss, getMasterWarnings } from './masters'
import { hasComponent, registerComponent, unregisterOwner } from './components/ComponentRegistry'
import { FallbackImage } from './components/FallbackImage'
// getChartSpecIssues/ChartSpec は chart/index.ts 経由だと Chart.tsx → chartScale.ts → applyTheme.ts の循環importになるため、
// 依存を持たない validateChart.ts / types.ts から直接importする
import { asArray, getChartSpecIssues } from './components/chart/validateChart'
import type { ChartSpec } from './components/chart/types'
import type { DiagramProps } from './components/diagram/Diagram'
import { computeGridDimensions } from './components/structureDiagram/gridLayout'
import { clampAxisIndex } from './components/structureDiagram/packAxis'
import type { StructureNode } from './components/structureDiagram/types'
import type { ClassDiagramSpec } from './components/structureDiagram/ClassDiagram'
import type { FlowchartSpec } from './components/processDiagram/Flowchart'
import type { SwimlaneLane, SwimlaneSpec } from './components/processDiagram/Swimlane'
import type { GanttSpec, GanttTask } from './components/processDiagram/Gantt'
// computeGanttColCount/computeSwimlaneColCount は Gantt.tsx/Swimlane.tsx が Diagram（→DiagramCard等→
// resolveColorTokenをapplyTheme.tsから値import）を値importしているため、ここから値importすると循環importになる。
// 上記2ファイルからのimportが型のみ（消去される）なのに対し、値は依存を持たない columnCount.ts から取る
import { computeGanttColCount, computeSwimlaneColCount } from './components/processDiagram/columnCount'

/** 6桁hex（#rrggbb）を [r, g, b] へ分解する（hexToRgb・relativeLuminance・brand/compile.ts の mix 計算が共有する） */
export function hexToRgbTuple(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

function hexToRgb(hex: string): string {
  return hexToRgbTuple(hex).join(', ')
}

/** [r, g, b] を6桁hex（#rrggbb）に変換する（hexToRgbTuple の逆変換。brand/compile.ts の mix 計算も共有する） */
export function rgbTupleToHex([r, g, b]: [number, number, number]): string {
  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)))
  return `#${[r, g, b].map((v) => clamp(v).toString(16).padStart(2, '0')).join('')}`
}

/** sRGB の [r, g, b]（0-255）を [h, s, l]（h: 0-360度, s/l: 0-1）へ変換する */
function rgbToHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const rn = r / 255
  const gn = g / 255
  const bn = b / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const d = max - min
  if (d === 0) return [0, 0, l]

  const s = d / (1 - Math.abs(2 * l - 1))
  let h: number
  if (max === rn) h = ((gn - bn) / d) % 6
  else if (max === gn) h = (bn - rn) / d + 2
  else h = (rn - gn) / d + 4
  h *= 60
  return [h < 0 ? h + 360 : h, s, l]
}

/** [h, s, l]（h: 0-360度, s/l: 0-1）を [r, g, b]（0-255）へ変換する（rgbToHsl の逆変換） */
function hslToRgb([h, s, l]: [number, number, number]): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = l - c / 2
  const [r1, g1, b1] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x]
  return [(r1 + m) * 255, (g1 + m) * 255, (b1 + m) * 255]
}

/** hex の色相のみを degrees 度回転させる（彩度・明度は保持。系列色のフォールバック導出で使う） */
function hueRotate(hex: string, degrees: number): string {
  const [h, s, l] = rgbToHsl(hexToRgbTuple(hex))
  return rgbTupleToHex(hslToRgb([(h + degrees) % 360, s, l]))
}

/**
 * 系列色（series1〜series6）を primary/accent から決定的に導出する（#186）。
 * series1=primary・series2=accent をそのまま採用し、series3〜6 は primary の色相を
 * 120°/180°/240°/300° 回転させ、テーマを書かないデッキでも6項目まで視覚的に区別できるようにする。
 * ただし accent が primary と同色のテーマ（グローバルCSSの既定値どうしがこれに当たる）では
 * series2 も色相回転で作る（同色だと系列を区別できず、6項目を見分けるという前提が崩れる・#204）。
 */
function deriveSeriesColor(index: 1 | 2 | 3 | 4 | 5 | 6, primaryHex: string, accentHex: string): string {
  if (index === 1) return primaryHex
  if (index === 2 && accentHex !== primaryHex) return accentHex
  return hueRotate(primaryHex, (index - 1) * 60)
}

/**
 * colors で明示されていない series1〜series6 のみ、primary/accent から導出して適用する（#186）。
 * 明示値は colors から、未指定の primary/accent は既に適用済みの CSS 変数（既定値含む）から解決する。
 * どちらかが色として解釈できない場合（テスト環境等で未初期化のとき）は導出せずスキップする。
 */
function applyDerivedSeriesColors(root: HTMLElement, colors?: ColorPalette): void {
  const computed = getComputedStyle(root)
  const primaryHex = normalizeHex(colors?.primary ?? computed.getPropertyValue('--theme-primary'))
  const accentHex = normalizeHex(colors?.accent ?? computed.getPropertyValue('--theme-accent'))
  if (!primaryHex || !accentHex) return

  for (const index of [1, 2, 3, 4, 5, 6] as const) {
    const key = SERIES_COLOR_KEYS[index - 1]
    if (colors?.[key]) continue
    setColorVar(root, THEME_COLOR_TOKENS[key], deriveSeriesColor(index, primaryHex, accentHex))
  }
}

/**
 * 任意の CSS 色表記（3桁/6桁hex・rgb()/rgba()・色名等）を 6桁hex に正規化する。
 * ブラウザの CSS パーサーに解釈を委譲するため、色名（"teal" 等）を含めて正しく解釈できる。
 * 解釈できない値は null を返す（呼び出し元は `-rgb` 変数の設定をスキップする＝NaN 事故を防ぐ）。
 */
export function normalizeHex(value: string): string | null {
  const probe = document.createElement('div')
  document.body.appendChild(probe)
  probe.style.color = value
  const applied = probe.style.color !== ''
  const computed = applied ? getComputedStyle(probe).color : ''
  document.body.removeChild(probe)

  const match = computed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/)
  if (!match) return null
  const [, r, g, b] = match
  return `#${[r, g, b].map((c) => Number(c).toString(16).padStart(2, '0')).join('')}`
}

/**
 * テーマカラーキー → CSS 変数の単一写像テーブル。
 * 外部 theme-colors.json（12キー）と slides.json の `theme.colors`（ColorPalette）の両方がこの表を参照する。
 * `accent` は `--theme-accent` として `primary` から分離する（両方を独立した色として指定・反映できるようにする）。
 * `text` は ColorPalette の後方互換キー（`textBody` と同じ CSS 変数を指す）。
 */
export const THEME_COLOR_TOKENS: Record<string, string> = {
  primary: '--theme-primary',
  accent: '--theme-accent',
  background: '--theme-background',
  backgroundAlt: '--theme-background-alt',
  backgroundGrid: '--theme-background-grid',
  text: '--theme-text-body',
  textHeading: '--theme-text-heading',
  textBody: '--theme-text-body',
  textSubtitle: '--theme-text-subtitle',
  textMuted: '--theme-text-muted',
  border: '--theme-border',
  borderLight: '--theme-border-light',
  codeText: '--theme-code-text',
  success: '--theme-success',
  warning: '--theme-warning',
  danger: '--theme-danger',
  neutral: '--theme-neutral',
  link: '--theme-link',
  linkVisited: '--theme-link-visited',
  series1: '--theme-series-1',
  series2: '--theme-series-2',
  series3: '--theme-series-3',
  series4: '--theme-series-4',
  series5: '--theme-series-5',
  series6: '--theme-series-6',
}

/** カラーパレットキー名（primary/series1等）からCSS変数名を解決する。未知のキー・未指定時はprimaryにフォールバックする（#201） */
export function resolveColorToken(key?: string): string {
  return (key && THEME_COLOR_TOKENS[key]) || THEME_COLOR_TOKENS.primary
}

/** THEME_COLOR_TOKENS のうち、文字色として使われるキー（帯・線等の装飾色は対象外）。背景色に対するコントラスト比の算出対象を絞るのに使う */
export const TEXT_COLOR_KEYS: readonly string[] = ['text', 'textHeading', 'textBody', 'textSubtitle', 'textMuted', 'codeText']

/** THEME_COLOR_TOKENS のうち、系列色として巡回に使われるキー（series1〜series6）。
 * applyDerivedSeriesColors の導出ループと chart/chartScale.ts の系列色巡回（SERIES_KEYS）が共有する単一の真実源（#186/#204/#240） */
export const SERIES_COLOR_KEYS: readonly string[] = ['series1', 'series2', 'series3', 'series4', 'series5', 'series6']

/** ColorPalette のキー → tokens 側の表記（CSS 変数名から先頭の `--` を除いたもの）。tokens を引く箇所で共有する */
function varNameOf(key: string): string {
  return THEME_COLOR_TOKENS[key].replace(/^--/, '')
}

/** CSS 変数へ色を適用する。`-rgb` companion は normalizeHex で解釈できた場合のみ設定する */
function setColorVar(root: HTMLElement, cssVar: string, value: string): void {
  root.style.setProperty(cssVar, value)
  const hex = normalizeHex(value)
  if (hex) {
    root.style.setProperty(`${cssVar}-rgb`, hexToRgb(hex))
  }
}

/**
 * meta.themeColors（12キーのフラット色定義 JSON）を取得する。path 省略時はデフォルトの `/theme-colors.json` を読む。
 * 存在しないのはカスタムテーマ未使用の正常系なので ok は false にしない
 * （開発サーバー等の SPA フォールバックで 200 + HTML が返り JSON パースに失敗するケースも同様に扱う）。
 * path 指定時は取得・パースに失敗すると ok: false を返す（呼び出し元でユーザーへの通知に使う）。
 */
export async function fetchColorPalette(path?: string): Promise<{ palette?: Record<string, string>; ok: boolean }> {
  const isDefaultPath = path === undefined
  let res: Response
  try {
    res = await fetch(path ?? '/theme-colors.json')
  } catch {
    return { ok: isDefaultPath }
  }
  if (!res.ok) return { ok: isDefaultPath }

  try {
    return { palette: await res.json(), ok: true }
  } catch {
    return { ok: isDefaultPath }
  }
}

/**
 * テーマカラー定義（JSON）を取得して CSS 変数へ適用する。
 * @returns 適用に成功したか（path 未指定でファイルが存在しない場合も true）
 */
export async function applyTheme(path?: string): Promise<boolean> {
  const { palette, ok } = await fetchColorPalette(path)
  if (palette) {
    const root = document.documentElement
    for (const [key, value] of Object.entries(palette)) {
      const cssVar = THEME_COLOR_TOKENS[key]
      if (cssVar) {
        setColorVar(root, cssVar, value)
      }
    }
  }
  return ok
}

/** JSON 内の image/voice/theme/font 参照を判定する接頭辞（src/localSlideLoader.ts の ASSET_PATH_PREFIXES・scripts/export-slides.mjs の extractAssetPaths と同じ規則） */
const ASSET_PATH_PREFIXES = ['image/', 'voice/', 'theme/', 'font/']

/** https の絶対 URL かどうか（相対パス・ローカル同梱パスはここで書き換えず document.baseURI 基準の既存解決に委ねる。
 * src/localSlideLoader.ts の isRemoteUrl と同じ https 限定の規則。#40: リモート取得は https スキームのみに限定する） */
function isAbsoluteHttpUrl(path: string): boolean {
  return /^https:\/\//i.test(path)
}

/** ThemeData 内のアセット参照パスを、取得元 URL を基準にした絶対 URL へ書き換える（純粋関数）。
 * ローカル .spkg 同梱時の resolveLocalAssetPaths（baseDir 基準）と対称に、配布元 URL 基準で解決する（#210）。
 * これがないと、リモート配布されたテーマ内のロゴ・フォント相対参照が document 基準で解決され 404 になる。 */
export function resolveRemoteAssetPaths<T>(value: T, themeUrl: string): T {
  if (typeof value === 'string') {
    const normalized = value.replace(/^\//, '')
    if (ASSET_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix))) {
      return new URL(normalized, themeUrl).href as unknown as T
    }
    return value
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveRemoteAssetPaths(item, themeUrl)) as unknown as T
  }
  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {}
    for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
      result[key] = resolveRemoteAssetPaths(v, themeUrl)
    }
    return result as T
  }
  return value
}

/** meta.brandTheme のオフライン再適用用キャッシュ名（#210）。内容不変を前提に、直近成功分を1件だけ保持する */
const BRAND_THEME_CACHE_NAME = 'sdd-brand-theme-cache-v1'

/** Cache Storage から path をキーに取得する。API 未対応環境（jsdom・古い WebView 等）や読み取り失敗時は undefined */
async function readCachedThemeData(path: string): Promise<ThemeData | undefined> {
  if (typeof caches === 'undefined') return undefined
  try {
    const cached = await (await caches.open(BRAND_THEME_CACHE_NAME)).match(path)
    if (!cached) return undefined
    return (await cached.json()) as ThemeData
  } catch {
    return undefined
  }
}

/** Cache Storage へ path をキーに保存する。書き込み失敗（API 未対応・容量制限等）は取得自体の成功を妨げないため無視する */
async function writeCachedThemeData(path: string, themeData: ThemeData): Promise<void> {
  if (typeof caches === 'undefined') return
  try {
    await (await caches.open(BRAND_THEME_CACHE_NAME)).put(path, new Response(JSON.stringify(themeData)))
  } catch {
    // キャッシュ書き込み失敗は無視する
  }
}

/**
 * 外部 JSON から ThemeData 全体（meta.brandTheme の参照先）を取得する。theme-colors.json（12キーのみ）とは異なり、
 * fonts/masters/masterMap/tokens/customCSS を含む ThemeData 構造をそのまま返す。
 *
 * https URL の場合、内部のアセット参照を取得元 URL 基準の絶対 URL へ書き換え（#210）、成功結果を Cache Storage
 * に保存する。取得に失敗した場合（オフライン・404 等）は直近の成功分をキャッシュから返し、無ければ undefined
 * にする（テーマは装飾であり、失敗させてスライド自体を開けなくしない・既存カスケードの方針を踏襲）。
 */
export async function fetchThemeData(path: string): Promise<ThemeData | undefined> {
  const isRemote = isAbsoluteHttpUrl(path)
  const fallback = () => (isRemote ? readCachedThemeData(path) : undefined)

  try {
    const res = await fetch(path)
    if (!res.ok) return fallback()

    const themeData = (await res.json()) as ThemeData
    if (!isRemote) return themeData

    const resolved = resolveRemoteAssetPaths(themeData, path)
    await writeCachedThemeData(path, resolved)
    return resolved
  } catch {
    return fallback()
  }
}

/** オブジェクト2つをキー単位でマージする（後勝ち）。両方未指定なら undefined */
export function mergeRecord<T>(a?: Record<string, T>, b?: Record<string, T>): Record<string, T> | undefined {
  if (!a && !b) return undefined
  return { ...a, ...b }
}

/** masterKey 単位、かつその内側の CSS 変数キー単位でマージする（tokens 用） */
function mergeTokens(a?: Record<string, Record<string, string>>, b?: Record<string, Record<string, string>>): Record<string, Record<string, string>> | undefined {
  if (!a && !b) return undefined
  const result: Record<string, Record<string, string>> = {}
  for (const key of new Set([...Object.keys(a ?? {}), ...Object.keys(b ?? {})])) {
    result[key] = { ...a?.[key], ...b?.[key] }
  }
  return result
}

/** sources は連結（重複登録は loadFontSources 側の styleId 判定でスキップされる）、
 * fontSizeRatios はキー単位でマージ（tokens と同様、片方だけが持つ段を消さない）、他のキーは後勝ち */
function mergeFonts(a?: FontDefinition, b?: FontDefinition): FontDefinition | undefined {
  if (!a && !b) return undefined
  const sources = [...(a?.sources ?? []), ...(b?.sources ?? [])]
  const fontSizeRatios = mergeRecord(a?.fontSizeRatios, b?.fontSizeRatios)
  return { ...a, ...b, ...(sources.length > 0 ? { sources } : {}), ...(fontSizeRatios ? { fontSizeRatios } : {}) }
}

/** canvas は width/height をキー単位、safeArea をさらにその内側のキー単位でマージする（theme 側が優先） */
function mergeCanvas(brand?: CanvasData, theme?: CanvasData): CanvasData | undefined {
  if (!brand && !theme) return undefined
  const safeArea: SafeArea | undefined = brand?.safeArea || theme?.safeArea ? { ...brand?.safeArea, ...theme?.safeArea } : undefined
  return { width: theme?.width ?? brand?.width, height: theme?.height ?? brand?.height, ...(safeArea ? { safeArea } : {}) }
}

/**
 * brand（組織/ブランドテーマ・下地）と theme（デッキ固有・上書き）を合成する（純粋関数）。
 * colors/fonts/masters/masterMap/tokens/canvas はキー単位でマージし、同名キーは theme 側が優先する。
 * customCSS は brand→theme の順で連結する（CSS の後方優先規則により theme 側の指定が効く）。
 * SlideRenderer（本編・PDF・発表者ビュー・編集プレビューの4経路）が masters/masterMap を直接参照するため、
 * CSS 変数適用（applyThemeData）だけでなく描画に渡す theme 自体をこの関数で合成する必要がある。
 */
export function mergeThemeData(brand?: ThemeData, theme?: ThemeData): ThemeData | undefined {
  if (!brand && !theme) return undefined
  return {
    colors: mergeRecord<string | undefined>(brand?.colors, theme?.colors),
    fonts: mergeFonts(brand?.fonts, theme?.fonts),
    icons: mergeRecord(brand?.icons, theme?.icons),
    customCSS: [brand?.customCSS, theme?.customCSS].filter(Boolean).join('\n') || undefined,
    masters: mergeRecord(brand?.masters, theme?.masters),
    masterMap: mergeRecord(brand?.masterMap, theme?.masterMap),
    tokens: mergeTokens(brand?.tokens, theme?.tokens),
    canvas: mergeCanvas(brand?.canvas, theme?.canvas),
  }
}

/** フォントサイズ比率（body1 = 1.0 基準）の既定値。キーは theme.fonts.fontSizeRatios と共通で、
 * `--theme-font-size-<キー>` として CSS 変数化される。既定にないキーを追加すると型階層に段を増やせる（#187） */
const DEFAULT_FONT_SIZE_RATIOS: Record<string, number> = {
  h1: 3.6,
  h2: 2.4,
  h3: 1.2,
  h4: 1.0,
  subtitle1: 1.4,
  body1: 1.0,
  body2: 0.8,
}

/** CSS 変数名のプレフィックス（`--theme-font-size-base` 自身もこれに含まれる） */
const FONT_SIZE_CSS_VAR_PREFIX = '--theme-font-size-'

function fontSizeCssVar(key: string): string {
  return `${FONT_SIZE_CSS_VAR_PREFIX}${key}`
}

/** baseFontSize から各フォントサイズ CSS 変数を設定する。ratios を渡すと既定比率を上書き・追加できる（#187） */
export function applyBaseFontSize(root: HTMLElement, baseFontSize: number, ratios?: Record<string, number>): void {
  const merged = { ...DEFAULT_FONT_SIZE_RATIOS, ...ratios }
  root.style.setProperty('--theme-font-size-base', `${baseFontSize}px`)
  for (const [key, ratio] of Object.entries(merged)) {
    root.style.setProperty(fontSizeCssVar(key), `${baseFontSize * ratio}px`)
  }
}

/** `applyBaseFontSize` が設定した CSS 変数をすべて消す。fontSizeRatios は既定にない段が動的に
 * 追加される可能性があるため、固定のキー一覧ではなくプレフィックス一致で走査する（#187） */
function removeFontSizeVars(root: HTMLElement): void {
  for (const prop of Array.from(root.style)) {
    if (prop.startsWith(FONT_SIZE_CSS_VAR_PREFIX)) {
      root.style.removeProperty(prop)
    }
  }
}

/** フォントソースが @font-face / <link> のどちらにも展開されない（読み込みが何も起きない）か */
function hasFontSourceContent(source: FontSource): boolean {
  return Boolean(source.src || source.url || source.localName)
}

/** 有効な CSS font-weight のキーワード（normal/bold/bolder/lighter）。数値は100刻みの100〜900のみ許可する（#187） */
const VALID_FONT_WEIGHT_KEYWORDS = new Set(['normal', 'bold', 'bolder', 'lighter'])

function isValidFontWeight(weight: string): boolean {
  return VALID_FONT_WEIGHT_KEYWORDS.has(weight) || /^[1-9]00$/.test(weight)
}

/** sources の中に、指定した書体名（latin/ea のいずれか）と weight が一致する @font-face 登録があるか */
function hasMatchingFontSource(sources: FontSource[], familyNames: (string | undefined)[], weight: string): boolean {
  return sources.some((source) => familyNames.includes(source.family) && (source.weight ?? 'normal') === weight)
}

/**
 * heading/body/code の weight 指定を検査する（#187）。
 * ①形式が不正な font-weight でないか、②sources が定義されている場合は、その weight を提供する
 * @font-face（同一 family + weight）が実際に登録されているか（無いと太字化されず期待通り表示されない）
 */
function getFontWeightWarnings(fonts?: FontDefinition): string[] {
  const warnings: string[] = []
  const sources = fonts?.sources ?? []
  for (const key of FONT_SLOT_KEYS) {
    const spec = fonts?.[key]
    if (!spec || typeof spec !== 'object' || !spec.weight) continue
    if (!isValidFontWeight(spec.weight)) {
      warnings.push(`theme.fonts.${key}.weight: "${spec.weight}" は有効な font-weight ではありません`)
    } else if (sources.length > 0 && !hasMatchingFontSource(sources, [spec.latin, spec.ea], spec.weight)) {
      warnings.push(`theme.fonts.${key}.weight: "${spec.weight}" に対応する書体が theme.fonts.sources に登録されていません`)
    }
  }
  return warnings
}

/** フォントソースを動的にロードする */
export function loadFontSources(sources: FontSource[]): void {
  for (const source of sources) {
    if (source.src || source.localName) {
      loadLocalFont(source)
    } else if (source.url) {
      loadExternalFont(source.url)
    }
  }
}

/** @font-face の重複登録判定キー（family + weight + style。太字/イタリック等の異なる字形は別ソースとして扱う） */
function fontFaceStyleId(family: string, weight: string, style: string): string {
  const slug = family.replace(/\s+/g, '-').toLowerCase()
  return `sdd-font-face-${slug}-${weight}-${style}`
}

function loadLocalFont(source: FontSource): void {
  const weight = source.weight ?? 'normal'
  const style = source.style ?? 'normal'
  const styleId = fontFaceStyleId(source.family, weight, style)
  if (document.getElementById(styleId)) return

  const srcList: string[] = []
  if (source.localName) srcList.push(`local('${source.localName}')`)
  if (source.src) srcList.push(`url('${source.src}')${source.format ? ` format('${source.format}')` : ''}`)

  const styleEl = document.createElement('style')
  styleEl.id = styleId
  styleEl.textContent = `@font-face { font-family: '${source.family}'; src: ${srcList.join(', ')}; font-weight: ${weight}; font-style: ${style}; }`
  document.head.appendChild(styleEl)
}

function loadExternalFont(url: string): void {
  const existing = document.querySelector(`link[href="${url}"]`)
  if (existing) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  link.dataset.sddDynamicFont = 'true'
  document.head.appendChild(link)
}

const FONT_SLOT_KEYS = ['heading', 'body', 'code'] as const
type FontSlotKey = (typeof FONT_SLOT_KEYS)[number]

/** heading/body/code ごとの font-family・font-weight CSS 変数（#187）。weight の既定値は
 * global.css の :root に定義し、theme.fonts.<slot> がオブジェクト形式で weight を持つ場合のみ上書きする。
 * AI 生成へ渡す意匠制約（`aiGenerate.ts` の `buildThemeConstraintsPrompt`）も現在の書体を読むためにこれを参照するので export する
 * （変数名を 2 箇所で持つと、改名時に生成プロンプトが黙って「(未設定)」になる） */
export const FONT_SLOT_CSS_VARS: Record<FontSlotKey, { family: string; weight: string }> = {
  heading: { family: '--theme-font-heading', weight: '--theme-font-weight-heading' },
  body: { family: '--theme-font-body', weight: '--theme-font-weight-body' },
  code: { family: '--theme-font-code', weight: '--theme-font-weight-code' },
}

/** theme.fonts.baseFontSize 省略時に使う既定値（global.css の --theme-font-size-base の既定と同じ）。
 * fontSizeRatios だけを指定したテーマでも型階層を適用できるようにする（#187） */
const DEFAULT_BASE_FONT_SIZE = 20

/** 書体指定（文字列 or FontFamilySpec）から CSS font-family 値を組み立てる。
 * 欧文（latin）→ 和文（ea）の順に並べることで、ラテン文字は latin 側、
 * latin にない文字（漢字・かな等）は ea 側が使われる（ブラウザの文字単位フォールバック・#187） */
function buildFontFamilyValue(spec: string | FontFamilySpec): string {
  if (typeof spec === 'string') return spec
  return [spec.latin, spec.ea].filter((name): name is string => Boolean(name)).join(', ')
}

/** セーフエリアの辺 → CSS 変数。global.css の `.master-body` が `padding: var(--theme-safe-*, 60px)` で参照する（#188） */
const SAFE_AREA_CSS_VARS: Record<keyof SafeArea, string> = {
  top: '--theme-safe-top',
  right: '--theme-safe-right',
  bottom: '--theme-safe-bottom',
  left: '--theme-safe-left',
}

/** セーフエリアの CSS 変数を適用する。未指定の辺は書き込まない（CSS 側の var() フォールバック 60px に委ねる） */
function applySafeArea(root: HTMLElement, safeArea: SafeArea): void {
  for (const [key, cssVar] of Object.entries(SAFE_AREA_CSS_VARS)) {
    const value = safeArea[key as keyof SafeArea]
    if (value != null) {
      root.style.setProperty(cssVar, `${value}px`)
    }
  }
}

/** id の <style> 要素を作成（未存在時）または更新する（customCSS・master tokens CSS の注入で共通利用） */
function upsertStyleElement(id: string, css: string): void {
  let styleEl = document.getElementById(id) as HTMLStyleElement | null
  if (!styleEl) {
    styleEl = document.createElement('style')
    styleEl.id = id
    document.head.appendChild(styleEl)
  }
  styleEl.textContent = css
}

/** theme.icons による ComponentRegistry 登録の owner（resetThemeOverrides での一括解除に使う） */
const BRAND_ICON_OWNER = 'brand-theme-icons'

/** MUIアイコン（Icon:Description等）のAvatar内表示サイズに合わせる（registerDefaults.tsxのfontSize: 32と揃える） */
const THEME_ICON_SIZE = 32

/** theme.icons（アイコン名 → SVGアセットパス/外部URL）を ComponentRegistry に 'Icon:<name>' として登録する。
 * 読み込み失敗時のフォールバック表示は既存の FallbackImage（画像装飾・master image decoration と共通）に委ねる（#201） */
function registerThemeIcons(icons: Record<string, string>): void {
  for (const [name, src] of Object.entries(icons)) {
    if (!src) continue
    registerComponent(`Icon:${name}`, () => createElement(FallbackImage, { src, alt: name, width: THEME_ICON_SIZE, height: THEME_ICON_SIZE }), BRAND_ICON_OWNER)
  }
}

/** ThemeDataからCSS変数を適用する */
export function applyThemeData(themeData: ThemeData): void {
  const root = document.documentElement

  if (themeData.colors) {
    for (const [key, value] of Object.entries(themeData.colors)) {
      if (!value) continue
      const cssVar = THEME_COLOR_TOKENS[key]
      if (cssVar) {
        setColorVar(root, cssVar, value)
      }
    }
  }

  applyDerivedSeriesColors(root, themeData.colors)

  if (themeData.fonts) {
    for (const key of FONT_SLOT_KEYS) {
      const spec = themeData.fonts[key]
      if (!spec) continue
      const cssVars = FONT_SLOT_CSS_VARS[key]
      const familyValue = buildFontFamilyValue(spec)
      if (familyValue) {
        root.style.setProperty(cssVars.family, familyValue)
      }
      if (typeof spec === 'object' && spec.weight) {
        root.style.setProperty(cssVars.weight, spec.weight)
      }
    }

    if (themeData.fonts.sources) {
      loadFontSources(themeData.fonts.sources)
    }

    if (themeData.fonts.baseFontSize != null || themeData.fonts.fontSizeRatios) {
      applyBaseFontSize(root, themeData.fonts.baseFontSize ?? DEFAULT_BASE_FONT_SIZE, themeData.fonts.fontSizeRatios)
    }
  }

  if (themeData.canvas?.safeArea) {
    applySafeArea(root, themeData.canvas.safeArea)
  }

  if (themeData.icons) {
    registerThemeIcons(themeData.icons)
  }

  if (themeData.customCSS) {
    upsertStyleElement('sdd-custom-theme-css', themeData.customCSS)
  }

  const masterCss = buildMasterCss(themeData.tokens)
  if (masterCss) {
    upsertStyleElement('sdd-master-tokens-css', masterCss)
  }
}

/** コントラスト検証の対象にする背景色キー（THEME_COLOR_TOKENS/ColorPalette 側の語彙。#209） */
const BACKGROUND_COLOR_KEYS: readonly string[] = ['background', 'backgroundAlt']

/**
 * WCAG AA 未達を警告文へ整形する。ratio が null（色として解釈不可）または閾値以上なら null を返す
 * （呼び出し元は null をフィルタする）。getContrastRatio/WCAG_AA_THRESHOLD を単一の算出元とする（#168 と共有）。
 */
function contrastWarning(scope: string, textLabel: string, textColor: string, bgLabel: string, bgColor: string): string | null {
  const ratio = getContrastRatio(textColor, bgColor)
  if (ratio === null || ratio >= WCAG_AA_THRESHOLD) return null
  return `${scope}: ${textLabel}(${textColor}) と ${bgLabel}(${bgColor}) のコントラスト比が ${ratio.toFixed(2)}:1 で WCAG AA（${WCAG_AA_THRESHOLD}:1）未満です`
}

/**
 * keys の各要素について source から値を引き、明示されている（真値の）ものだけ `[key, value]` として残す。
 * lookupKey 省略時はキー自身をそのまま引く（theme.colors ＝ ColorPalette のキーそのもの）。
 * tokens の1スコープ分の生変数（キーが CSS 変数名）から引く場合は lookupKey で変換する。
 * theme.colors・theme.tokens・masters の全面塗り背景の3経路のコントラスト検証（#209）が抽出処理を共有する。
 *
 * `text` と `textBody` のように同じ CSS 変数を指すキーは1組に畳む（同じ文字色に対して警告が二重に出ないよう、
 * keys の並びで後に来る具体的なキーを残す）。
 */
function extractColorEntries(source: Record<string, string | undefined>, keys: readonly string[], lookupKey: (key: string) => string = (key) => key): Array<[string, string]> {
  const byVarName = new Map<string, [string, string]>()
  for (const key of keys) {
    const color = source[lookupKey(key)]
    if (color) byVarName.set(varNameOf(key), [key, color])
  }
  return [...byVarName.values()]
}

/** textEntries × bgEntries の全組み合わせを検証し、AA 未達の警告文を集める（theme.colors・tokens 両方が共有） */
function pairwiseContrastWarnings(scope: string, textEntries: Array<[string, string]>, bgEntries: Array<[string, string]>): string[] {
  const warnings: string[] = []
  for (const [textLabel, textColor] of textEntries) {
    for (const [bgLabel, bgColor] of bgEntries) {
      const warning = contrastWarning(scope, textLabel, textColor, bgLabel, bgColor)
      if (warning) warnings.push(warning)
    }
  }
  return warnings
}

/**
 * `theme.colors` 直書きのコントラスト検証（#209）。文字色キー×背景色キーの組のうち、
 * 両方が明示されている組だけを検証する（片方が未指定＝グローバルCSSの既定値に委ねる場合、
 * その既定値をここで複製すると二重管理になるため対象外とする）。
 */
function getColorPaletteContrastWarnings(colors: ColorPalette): string[] {
  const record = colors as Record<string, string | undefined>
  return pairwiseContrastWarnings('theme.colors', extractColorEntries(record, TEXT_COLOR_KEYS), extractColorEntries(record, BACKGROUND_COLOR_KEYS))
}

/**
 * `theme.tokens`（masterKey スコープの CSS 変数トークン。#190）のコントラスト検証（#209）。
 * 同一スコープ内で文字色/背景色の両方が上書きされている組だけを検証する。
 */
function getTokenContrastWarnings(tokens: Record<string, Record<string, string>>): string[] {
  const warnings: string[] = []
  for (const [scope, vars] of Object.entries(tokens)) {
    const textEntries = extractColorEntries(vars, TEXT_COLOR_KEYS, varNameOf)
    const bgEntries = extractColorEntries(vars, BACKGROUND_COLOR_KEYS, varNameOf)
    warnings.push(...pairwiseContrastWarnings(`theme.tokens.${scope}`, textEntries, bgEntries))
  }
  return warnings
}

/**
 * masterKey のスコープで有効になる文字色を、全文字色キーぶん解決する（#209）。tokens の上書き→theme.colors の順。
 * どちらにも無いキー（グローバルCSSの既定値に委ねる分）は返さない（既定値をここに複製すると二重管理になる）。
 * 全面塗り背景の上には本文だけでなく出典・補足（textMuted 等）も載るため、本文色だけでなく全キーを対象にする（#197）。
 */
function resolveEffectiveTextColors(theme: ThemeData, masterKey: string): Array<[string, string]> {
  const scoped = theme.tokens?.[masterKey] ?? {}
  const colors = (theme.colors ?? {}) as Record<string, string | undefined>
  const resolved = Object.fromEntries(TEXT_COLOR_KEYS.map((key) => [key, scoped[varNameOf(key)] ?? colors[key]]))
  return extractColorEntries(resolved, TEXT_COLOR_KEYS)
}

/**
 * マスターの全面塗り背景（`background.type` が `fill`/`gradient`）と文字色のコントラスト検証（#209）。
 * `grid`/`image`/`plain` は下地色が不定または画像なので対象外（fill/gradient のみ塗り色が確定する）。
 */
function getMasterBackgroundContrastWarnings(theme: ThemeData): string[] {
  const warnings: string[] = []
  for (const [masterKey, master] of Object.entries(theme.masters ?? {})) {
    const background = master.background
    if (!background || (background.type !== 'fill' && background.type !== 'gradient')) continue

    const bgEntries: Array<[string, string]> =
      background.type === 'fill'
        ? [['color', background.color]]
        : [
            ['from', background.from],
            ['to', background.to],
          ]
    warnings.push(...pairwiseContrastWarnings(`theme.masters.${masterKey}.background`, resolveEffectiveTextColors(theme, masterKey), bgEntries))
  }
  return warnings
}

/**
 * `theme.colors`（ColorPalette）を検査し、反映されない/意図せぬ結果になる設定を警告として返す。
 * 検証エラーではなく警告（描画は継続する）: 通常ロード経路のトースト通知と、
 * AI 生成の自動修正ループの `repairFeedback` の両方に載せて利用者・AI 双方に伝える。
 * slides を渡すと slides[].meta.master（スライド個別指定）の存在しない masterKey 参照も検出する（省略可）。
 * コントラスト検証（WCAG AA・#168 の閾値/算出関数を再利用）は theme.colors 直書き・tokens（masterKey
 * スコープ）・masters の全面塗り背景の3経路すべてに適用する（#209。取り込み時収束は brand/compile.ts が別途担う）。
 */
export function getThemeWarnings(theme?: ThemeData, slides?: SlideData[]): string[] {
  const warnings: string[] = []

  if (theme) {
    for (const [key, value] of Object.entries(theme.colors ?? {})) {
      if (!value) continue
      if (!THEME_COLOR_TOKENS[key]) {
        warnings.push(`theme.colors.${key}: 不明なキーです（無視されます）`)
      } else if (normalizeHex(value) === null) {
        warnings.push(`theme.colors.${key}: "${value}" は有効な色として解釈できません`)
      }
    }

    if (theme.colors) {
      warnings.push(...getColorPaletteContrastWarnings(theme.colors))
    }
    if (theme.tokens) {
      warnings.push(...getTokenContrastWarnings(theme.tokens))
    }
    warnings.push(...getMasterBackgroundContrastWarnings(theme))

    for (const source of theme.fonts?.sources ?? []) {
      if (!hasFontSourceContent(source)) {
        warnings.push(`theme.fonts.sources（family: "${source.family}"）: src/url/localName のいずれも指定されていません`)
      }
    }

    warnings.push(...getFontWeightWarnings(theme.fonts))

    for (const [name, src] of Object.entries(theme.icons ?? {})) {
      if (!src) {
        warnings.push(`theme.icons.${name}: srcが指定されていません`)
      }
    }
  }

  warnings.push(...getMasterWarnings(theme, slides))
  warnings.push(...getTileIconWarnings(slides))
  warnings.push(...getDiagramWarnings(slides))
  warnings.push(...getChartWarnings(slides))

  return warnings
}

/** ComponentReference の name が一致する場合、その props を取り出す（Chart/Diagram 等の component 検証が共有する・#232） */
function componentPropsFromRef<T>(ref: unknown, name: string): T | undefined {
  const component = ref as { name?: unknown; props?: Record<string, unknown> } | undefined
  return component?.name === name ? ((component.props ?? {}) as T) : undefined
}

/** スライド1件から、name が一致する component 参照の props を集める（content/left/right の3箇所・#241/#232） */
function collectComponentProps<T>(content: SlideContent, name: string): Array<{ path: string; props: T }> {
  const specs: Array<{ path: string; props: T }> = []
  const root = componentPropsFromRef<T>(content.component, name)
  if (root) specs.push({ path: 'content.component.props', props: root })

  for (const side of ['left', 'right'] as const) {
    const column = componentPropsFromRef<T>((content[side] as Record<string, unknown> | undefined)?.component, name)
    if (column) specs.push({ path: `content.${side}.component.props`, props: column })
  }

  return specs
}

/** スライド1件から検証すべき図解プリミティブのspecを集める（content.<shortcutKey> の短縮記法・component 参照は
 * content/left/right の3箇所。既存のcollectChartSpecs（#241）と同じ形を、row/col/startCol の範囲外検査（#279）が
 * 必要とする7種の短縮記法向けに一般化したもの） */
function collectDiagramSpecs<T>(content: SlideContent, shortcutKey: string, componentName: string): Array<{ path: string; spec: T }> {
  const specs: Array<{ path: string; spec: T }> = []
  const shortcut = (content as Record<string, unknown>)[shortcutKey]
  if (shortcut && typeof shortcut === 'object') {
    specs.push({ path: `content.${shortcutKey}`, spec: shortcut as T })
  }

  specs.push(...collectComponentProps<T>(content, componentName).map(({ path, props }) => ({ path, spec: props })))

  return specs
}

/** スライド1件から検証すべき ChartSpec を集める（content.chart の短縮記法・component 参照は content/left/right の3箇所・#241） */
function collectChartSpecs(content: SlideContent): Array<{ path: string; spec: ChartSpec }> {
  return collectDiagramSpecs<ChartSpec>(content, 'chart', 'Chart')
}

/**
 * row/col/startCol の生値とクランプ後の添字（getAxisSlot が実際に使う添字）を比較し、差があれば warnings に積む（#279）。
 * クランプ規則自体は packAxis.ts の clampAxisIndex（getAxisSlot と単一の真実源）に委ね、ここでは複製しない。
 * 差が無ければ何もしない（呼び出し元4箇所の同型の null チェックを集約する）。
 */
function pushRangeWarning(warnings: string[], path: string, raw: number, count: number): void {
  const clamped = clampAxisIndex(count, raw)
  if (clamped === raw) return
  warnings.push(`${path}: 指定値 ${raw} は範囲外または非整数のため、描画時は ${clamped} に丸められます`)
}

/**
 * StructureNode[] の row/col が範囲外・非整数でないかを検査する（ClassDiagram・Flowchart が computeGridLayout
 * を共有するため、行数・列数の導出（computeGridDimensions）も含めて共有する・#279）。
 * 未指定ノード（id無し）は描画時にフィルタされ getAxisSlot を通らないため、同じフィルタを適用してから検査する。
 */
function getGridRangeWarnings(basePath: string, nodes: StructureNode[]): string[] {
  const list = nodes.filter((node) => node.id)
  const { rowCount, colCount } = computeGridDimensions(list)
  const warnings: string[] = []
  list.forEach((node, i) => {
    if (typeof node.row === 'number') pushRangeWarning(warnings, `${basePath}[${i}].row`, node.row, rowCount)
    if (typeof node.col === 'number') pushRangeWarning(warnings, `${basePath}[${i}].col`, node.col, colCount)
  })
  return warnings
}

/** SwimlaneSpec の lanes[].nodes[].col が範囲外・非整数でないかを検査する（#279）。
 * 列数（computeSwimlaneColCount）はフェーズ見出し数・各レーンのノード数から決まり、col の生値には依存しない
 * ため、明示指定が列数を超える（上限超え）ケースもここで検出できる。 */
function getSwimlaneRangeWarnings(basePath: string, phases: string[] | undefined, lanes: SwimlaneLane[] | undefined): string[] {
  const phaseList = asArray(phases)
  const laneList = asArray(lanes)
  const colCount = computeSwimlaneColCount(phaseList, laneList)
  const warnings: string[] = []
  laneList.forEach((lane, laneIndex) => {
    asArray(lane.nodes)
      .filter((node) => node.id)
      .forEach((node, nodeIndex) => {
        if (typeof node.col !== 'number') return
        pushRangeWarning(warnings, `${basePath}.lanes[${laneIndex}].nodes[${nodeIndex}].col`, node.col, colCount)
      })
  })
  return warnings
}

/** GanttSpec の tasks[].startCol が範囲外・非整数でないかを検査する（#279。colCountの導出だけでは防げないstartCol
 * の負値・非整数は computeGanttColCount 側では捉えられないため、getAxisSlot 相当のクランプ比較で検出する） */
function getGanttRangeWarnings(basePath: string, axis: string[] | undefined, tasks: GanttTask[] | undefined): string[] {
  const axisList = asArray(axis)
  const taskList = asArray(tasks).filter((task) => typeof task.startCol === 'number')
  const colCount = computeGanttColCount(axisList, taskList)
  const warnings: string[] = []
  taskList.forEach((task, i) => {
    pushRangeWarning(warnings, `${basePath}.tasks[${i}].startCol`, task.startCol, colCount)
  })
  return warnings
}

/** ChartSpec の色トークン参照が未知でないか検査する（#241）。seriesColor 経由だと未知トークンが `primary` へ黙って
 * フォールバックし判定できないため、THEME_COLOR_TOKENS を直接照合する。
 * kpi 行（items[]）の color/deltaStatus と、単体 kpi の deltaStatus（KpiItemSpec 交差型でトップレベルにある）も対象にする（#290）。 */
function getChartColorTokenIssues(spec: ChartSpec): string[] {
  const items = asArray(spec.items)
  const colors: unknown[] = [spec.color, spec.deltaStatus, ...asArray(spec.series).map((entry) => entry?.color), ...items.map((item) => item?.color), ...items.map((item) => item?.deltaStatus)]
  return colors.filter((color): color is string => typeof color === 'string' && !THEME_COLOR_TOKENS[color]).map((color) => `未知の色トークン名です: "${color}"`)
}

/**
 * content.chart の短縮記法・component: { name: "Chart" } の両方について、指定ミスを検出する（#241）。
 * `type` の綴りミスや `series`/`categories` 未指定は白紙描画（Chart.tsx が console.warn + null を返す）になり
 * 原因が伝わらないため、getChartSpecIssues（Chart.tsx と共有する単一の真実源）と色トークン照合をここに集約する。
 */
function getChartWarnings(slides?: SlideData[]): string[] {
  const warnings: string[] = []
  for (const [index, slide] of (slides ?? []).entries()) {
    for (const { path, spec } of collectChartSpecs(slide.content)) {
      for (const issue of [...getChartSpecIssues(spec), ...getChartColorTokenIssues(spec)]) {
        warnings.push(`slides[${index}].${path}: ${issue}`)
      }
    }
  }
  return warnings
}

/** content.tiles[].icon が ComponentRegistry（デフォルト・アドオン・ブランドテーマ提供のいずれも）に未登録の場合を検出する（#201） */
function getTileIconWarnings(slides?: SlideData[]): string[] {
  const warnings: string[] = []
  for (const [index, slide] of (slides ?? []).entries()) {
    const tiles = slide.content?.tiles
    if (!Array.isArray(tiles)) continue
    tiles.forEach((tile, i) => {
      const icon = (tile as { icon?: unknown })?.icon
      if (typeof icon === 'string' && !hasComponent(`Icon:${icon}`)) {
        warnings.push(`slides[${index}].content.tiles[${i}].icon: 未登録のアイコン名 "${icon}" です`)
      }
    })
  }
  return warnings
}

/**
 * content.component（two-column の left/right を含む）が Diagram を指す場合、connectors[].from/to が
 * nodes[].id に存在するかを検査する（#232）。描画時のスキップ（Diagram.tsx。デッキを落とさないための現状維持）
 * とは別に、利用者・AI 自動修正ループ向けの報告はこの経路に一本化する（先例: getTileIconWarnings #201）。
 *
 * row/col/startCol の範囲外・非整数の検出（#279）もここに集約する。対象は getAxisSlot（#276）で実際に
 * クランプされる4種（classDiagram/flowchart は computeGridLayout・swimlane は col・gantt は startCol）。
 * hierarchyDiagram/serverDiagram/orgChart は StructureNode 型上は row/col を持つが、実装（ツリー・ゾーン配置）
 * がそれらを読まず getAxisSlot を通らないため対象外（types.ts のコメントの通り「UMLクラス図・フローチャートで
 * のみ使用」）。
 */
function getDiagramWarnings(slides?: SlideData[]): string[] {
  const warnings: string[] = []
  for (const [index, slide] of (slides ?? []).entries()) {
    for (const { path, props } of collectComponentProps<DiagramProps>(slide.content, 'Diagram')) {
      const nodeIds = new Set(
        asArray(props.nodes)
          .map((node) => node.id)
          .filter((id): id is string => typeof id === 'string'),
      )
      asArray(props.connectors).forEach((connector, i) => {
        for (const role of ['from', 'to'] as const) {
          const id: unknown = connector[role]
          if (typeof id === 'string' && !nodeIds.has(id)) {
            warnings.push(`slides[${index}].${path}.connectors[${i}].${role}: 存在しないノード id "${id}" を参照しています`)
          }
        }
      })
    }

    for (const { path, spec } of collectDiagramSpecs<ClassDiagramSpec>(slide.content, 'classDiagram', 'ClassDiagram')) {
      warnings.push(...getGridRangeWarnings(`slides[${index}].${path}.classes`, asArray(spec.classes)))
    }
    for (const { path, spec } of collectDiagramSpecs<FlowchartSpec>(slide.content, 'flowchart', 'Flowchart')) {
      warnings.push(...getGridRangeWarnings(`slides[${index}].${path}.nodes`, asArray(spec.nodes)))
    }
    for (const { path, spec } of collectDiagramSpecs<SwimlaneSpec>(slide.content, 'swimlane', 'Swimlane')) {
      warnings.push(...getSwimlaneRangeWarnings(`slides[${index}].${path}`, spec.phases, spec.lanes))
    }
    for (const { path, spec } of collectDiagramSpecs<GanttSpec>(slide.content, 'gantt', 'Gantt')) {
      warnings.push(...getGanttRangeWarnings(`slides[${index}].${path}`, spec.axis, spec.tasks))
    }
  }
  return warnings
}

/** THEME_COLOR_TOKENS が指す CSS 変数（重複除去）と、その `-rgb` companion */
const RESETTABLE_COLOR_VARS = [...new Set(Object.values(THEME_COLOR_TOKENS))].flatMap((cssVar) => [cssVar, `${cssVar}-rgb`])

/** applyTheme/applyThemeData が設定する CSS 変数の一覧（リセット対象）。fontSizeRatios は既定にない
 * 段が動的に追加される可能性があるため対象外とし、removeFontSizeVars でプレフィックス一致により別途消す */
const RESETTABLE_CSS_VARS: string[] = [...RESETTABLE_COLOR_VARS, ...Object.values(FONT_SLOT_CSS_VARS).flatMap((v) => [v.family, v.weight]), ...Object.values(SAFE_AREA_CSS_VARS)]

/** sRGB の 0-255 値を WCAG の相対輝度換算用に線形化する */
function linearizeChannel(value: number): number {
  const c = value / 255
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
}

/** 6桁hex（#rrggbb）の相対輝度（WCAG 2.x の算出式） */
function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgbTuple(hex)
  return 0.2126 * linearizeChannel(r) + 0.7152 * linearizeChannel(g) + 0.0722 * linearizeChannel(b)
}

/** WCAG AA（通常テキスト）のコントラスト比閾値。#166 の差分ダイアログ・#168 のブランド取り込みが共有する */
export const WCAG_AA_THRESHOLD = 4.5

/**
 * 2色間の WCAG コントラスト比（1〜21）を算出する。
 * どちらかが未指定、または色として解釈できない場合は null を返す（呼び出し元は「—」等で表示する）。
 */
export function getContrastRatio(colorA?: string, colorB?: string): number | null {
  if (!colorA || !colorB) return null
  const hexA = normalizeHex(colorA)
  const hexB = normalizeHex(colorB)
  if (!hexA || !hexB) return null
  const lA = relativeLuminance(hexA)
  const lB = relativeLuminance(hexB)
  const lighter = Math.max(lA, lB)
  const darker = Math.min(lA, lB)
  return (lighter + 0.05) / (darker + 0.05)
}

/**
 * 前のプレゼンテーションで適用したテーマの上書きをすべて解除する。
 * applyTheme/applyThemeData は「指定されたプロパティだけを上書きする」実装のため、
 * 新しいプレゼンテーションに切り替える前に必ず呼ぶ（呼ばないと前のテーマが残ってしまう）。
 */
export function resetThemeOverrides(): void {
  const root = document.documentElement
  for (const cssVar of RESETTABLE_CSS_VARS) {
    root.style.removeProperty(cssVar)
  }
  removeFontSizeVars(root)
  document.getElementById('sdd-custom-theme-css')?.remove()
  document.getElementById('sdd-master-tokens-css')?.remove()
  document.querySelectorAll('style[id^="sdd-font-face-"]').forEach((el) => el.remove())
  document.querySelectorAll('link[data-sdd-dynamic-font="true"]').forEach((el) => el.remove())
  unregisterOwner(BRAND_ICON_OWNER)
}

/**
 * プレゼンテーションのテーマを一括適用する（本編・発表者ビュー・編集モードの各エントリで共通の手順）。
 * 前のテーマの上書きが残らないよう必ずリセットしてから、reset → brand（組織/ブランドの下地） →
 * themeColors（12キー） → theme（デッキ固有の上書き）の4段カスケードで合成・適用する。
 * customCSS/masters/masterMap/tokens は丸ごと置換の性質を持つため、mergeThemeData で
 * 事前に1つの ThemeData へ合成した上で一度だけ applyThemeData する（2回適用すると先の層が消えてしまう）。
 * @returns テーマカラー（themeColors）の取得に成功したか（呼び出し元でユーザーへの通知に使う）
 */
export async function applyPresentationTheme(themeColors?: string, theme?: ThemeData, brand?: ThemeData): Promise<boolean> {
  resetThemeOverrides()

  let themeColorsPalette: ColorPalette | undefined
  let ok = true
  if (themeColors) {
    const result = await fetchColorPalette(themeColors)
    themeColorsPalette = result.palette
    ok = result.ok
  }

  // brand → themeColors → theme の順で1層ずつ合成する（各層が後勝ちで前層を上書きする）
  const layers: (ThemeData | undefined)[] = [brand, themeColorsPalette ? { colors: themeColorsPalette } : undefined, theme]
  const merged = layers.reduce<ThemeData | undefined>((acc, layer) => mergeThemeData(acc, layer), undefined)
  // テーマを一切宣言しないデッキでも空の ThemeData で通す。系列色（--theme-series-1〜6・#186）は
  // グローバルCSSに既定値を持たず applyThemeData の導出だけが供給源なので、ここを飛ばすと
  // resetThemeOverrides で消えたまま未定義になり、チャートの系列色（#204）が描画されない
  applyThemeData(merged ?? {})
  return ok
}
