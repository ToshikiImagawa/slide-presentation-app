import { createElement } from 'react'
import type { CanvasData, ColorPalette, FontDefinition, FontSource, SafeArea, SlideData, ThemeData } from './data'
import { buildMasterCss, getMasterWarnings } from './masters'
import { hasComponent, registerComponent, unregisterOwner } from './components/ComponentRegistry'
import { FallbackImage } from './components/FallbackImage'

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
    const key = `series${index}` as const
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

/**
 * 外部 JSON から ThemeData 全体（meta.brandTheme の参照先）を取得する。theme-colors.json（12キーのみ）とは異なり、
 * fonts/masters/masterMap/tokens/customCSS を含む ThemeData 構造をそのまま返す。取得・パースに失敗した場合は undefined
 */
export async function fetchThemeData(path: string): Promise<ThemeData | undefined> {
  try {
    const res = await fetch(path)
    if (!res.ok) return undefined
    return (await res.json()) as ThemeData
  } catch {
    return undefined
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

/** sources は連結（重複登録は loadFontSources 側の styleId 判定でスキップされる）、他のキーは後勝ち */
function mergeFonts(a?: FontDefinition, b?: FontDefinition): FontDefinition | undefined {
  if (!a && !b) return undefined
  const sources = [...(a?.sources ?? []), ...(b?.sources ?? [])]
  return { ...a, ...b, ...(sources.length > 0 ? { sources } : {}) }
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

/** フォントサイズ比率（body1 = 1.0 基準） */
const fontSizeRatios: Record<string, number> = {
  '--theme-font-size-h1': 3.6,
  '--theme-font-size-h2': 2.4,
  '--theme-font-size-h3': 1.2,
  '--theme-font-size-h4': 1.0,
  '--theme-font-size-subtitle1': 1.4,
  '--theme-font-size-body1': 1.0,
  '--theme-font-size-body2': 0.8,
}

/** baseFontSize から各フォントサイズ CSS 変数を設定する */
export function applyBaseFontSize(root: HTMLElement, baseFontSize: number): void {
  root.style.setProperty('--theme-font-size-base', `${baseFontSize}px`)
  for (const [cssVar, ratio] of Object.entries(fontSizeRatios)) {
    root.style.setProperty(cssVar, `${baseFontSize * ratio}px`)
  }
}

/** フォントソースが @font-face / <link> のどちらにも展開されない（読み込みが何も起きない）か */
function hasFontSourceContent(source: FontSource): boolean {
  return Boolean(source.src || source.url || source.localName)
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

const themeFontToCssVar: Record<string, string> = {
  heading: '--theme-font-heading',
  body: '--theme-font-body',
  code: '--theme-font-code',
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
    for (const [key, value] of Object.entries(themeData.fonts)) {
      if (!value || typeof value !== 'string') continue
      const cssVar = themeFontToCssVar[key]
      if (cssVar) {
        root.style.setProperty(cssVar, value)
      }
    }

    if (themeData.fonts.sources) {
      loadFontSources(themeData.fonts.sources)
    }

    if (themeData.fonts.baseFontSize != null) {
      applyBaseFontSize(root, themeData.fonts.baseFontSize)
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

/**
 * `theme.colors`（ColorPalette）を検査し、反映されない/意図せぬ結果になる設定を警告として返す。
 * 検証エラーではなく警告（描画は継続する）: 通常ロード経路のトースト通知と、
 * AI 生成の自動修正ループの `repairFeedback` の両方に載せて利用者・AI 双方に伝える。
 * slides を渡すと slides[].meta.master（スライド個別指定）の存在しない masterKey 参照も検出する（省略可）。
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

    for (const source of theme.fonts?.sources ?? []) {
      if (!hasFontSourceContent(source)) {
        warnings.push(`theme.fonts.sources（family: "${source.family}"）: src/url/localName のいずれも指定されていません`)
      }
    }

    for (const [name, src] of Object.entries(theme.icons ?? {})) {
      if (!src) {
        warnings.push(`theme.icons.${name}: srcが指定されていません`)
      }
    }
  }

  warnings.push(...getMasterWarnings(theme, slides))
  warnings.push(...getTileIconWarnings(slides))

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

/** THEME_COLOR_TOKENS が指す CSS 変数（重複除去）と、その `-rgb` companion */
const RESETTABLE_COLOR_VARS = [...new Set(Object.values(THEME_COLOR_TOKENS))].flatMap((cssVar) => [cssVar, `${cssVar}-rgb`])

/** applyTheme/applyThemeData が設定する CSS 変数の一覧（リセット対象） */
const RESETTABLE_CSS_VARS: string[] = [...RESETTABLE_COLOR_VARS, ...Object.values(themeFontToCssVar), '--theme-font-size-base', ...Object.keys(fontSizeRatios), ...Object.values(SAFE_AREA_CSS_VARS)]

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
