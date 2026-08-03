import type { FontSource, ThemeData } from './data'
import { buildMasterCss, getMasterWarnings } from './masters'

/** 6桁hex（#rrggbb）を [r, g, b] へ分解する（hexToRgb・relativeLuminance・brand/compile.ts の mix 計算が共有する） */
export function hexToRgbTuple(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)]
}

function hexToRgb(hex: string): string {
  return hexToRgbTuple(hex).join(', ')
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
 * テーマカラー定義（JSON）を取得して CSS 変数へ適用する。
 * path 省略時はデフォルトの `/theme-colors.json` を読む。存在しないのはカスタムテーマ未使用の正常系なので false は返さない
 * （開発サーバー等の SPA フォールバックで 200 + HTML が返り JSON パースに失敗するケースも同様に扱う）。
 * path 指定時は取得・パースに失敗すると false を返す（呼び出し元でユーザーへの通知に使う）。
 * @returns 適用に成功したか（path 未指定でファイルが存在しない場合も true）
 */
export async function applyTheme(path?: string): Promise<boolean> {
  const isDefaultPath = path === undefined
  let res: Response
  try {
    res = await fetch(path ?? '/theme-colors.json')
  } catch {
    return isDefaultPath
  }
  if (!res.ok) return isDefaultPath

  let theme: Record<string, string>
  try {
    theme = await res.json()
  } catch {
    return isDefaultPath
  }

  const root = document.documentElement
  for (const [key, value] of Object.entries(theme)) {
    const cssVar = THEME_COLOR_TOKENS[key]
    if (cssVar) {
      setColorVar(root, cssVar, value)
    }
  }
  return true
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
 */
export function getThemeWarnings(theme?: ThemeData): string[] {
  const warnings: string[] = []
  if (!theme) return warnings

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

  warnings.push(...getMasterWarnings(theme))

  return warnings
}

/** THEME_COLOR_TOKENS が指す CSS 変数（重複除去）と、その `-rgb` companion */
const RESETTABLE_COLOR_VARS = [...new Set(Object.values(THEME_COLOR_TOKENS))].flatMap((cssVar) => [cssVar, `${cssVar}-rgb`])

/** applyTheme/applyThemeData が設定する CSS 変数の一覧（リセット対象） */
const RESETTABLE_CSS_VARS: string[] = [...RESETTABLE_COLOR_VARS, ...Object.values(themeFontToCssVar), '--theme-font-size-base', ...Object.keys(fontSizeRatios)]

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
}

/**
 * プレゼンテーションのテーマを一括適用する（本編・発表者ビューの両エントリで共通の手順）。
 * 前のテーマの上書きが残らないよう、必ずリセットしてから themeColors → theme の順に適用する。
 * @returns テーマカラーの適用に成功したか（呼び出し元でユーザーへの通知に使う）
 */
export async function applyPresentationTheme(themeColors?: string, theme?: ThemeData): Promise<boolean> {
  resetThemeOverrides()
  const ok = await applyTheme(themeColors)
  if (theme) {
    applyThemeData(theme)
  }
  return ok
}
