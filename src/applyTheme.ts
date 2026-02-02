import type { FontSource, ThemeData } from './data'

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r}, ${g}, ${b}`
}

const keyToCssVar: Record<string, string> = {
  primary: '--theme-primary',
  background: '--theme-background',
  backgroundAlt: '--theme-background-alt',
  backgroundGrid: '--theme-background-grid',
  textHeading: '--theme-text-heading',
  textBody: '--theme-text-body',
  textSubtitle: '--theme-text-subtitle',
  textMuted: '--theme-text-muted',
  border: '--theme-border',
  borderLight: '--theme-border-light',
  codeText: '--theme-code-text',
  success: '--theme-success',
}

export async function applyTheme(path?: string) {
  let theme: Record<string, string>
  try {
    const res = await fetch(path ?? '/theme-colors.json')
    if (!res.ok) return
    theme = await res.json()
  } catch {
    return
  }
  const root = document.documentElement
  for (const [key, value] of Object.entries(theme)) {
    const cssVar = keyToCssVar[key]
    if (cssVar) {
      root.style.setProperty(cssVar, value)
      root.style.setProperty(`${cssVar}-rgb`, hexToRgb(value))
    }
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

/** フォントソースを動的にロードする */
export function loadFontSources(sources: FontSource[]): void {
  for (const source of sources) {
    if (source.src) {
      loadLocalFont(source.family, source.src)
    } else if (source.url) {
      loadExternalFont(source.url)
    }
  }
}

function loadLocalFont(family: string, src: string): void {
  const styleId = `sdd-font-face-${family.replace(/\s+/g, '-').toLowerCase()}`
  if (document.getElementById(styleId)) return
  const style = document.createElement('style')
  style.id = styleId
  style.textContent = `@font-face { font-family: '${family}'; src: url('${src}'); }`
  document.head.appendChild(style)
}

function loadExternalFont(url: string): void {
  const existing = document.querySelector(`link[href="${url}"]`)
  if (existing) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = url
  document.head.appendChild(link)
}

/** ThemeDataからCSS変数を適用する */
const themeColorToCssVar: Record<string, string> = {
  primary: '--theme-primary',
  accent: '--theme-primary',
  background: '--theme-background',
  text: '--theme-text-body',
}

const themeFontToCssVar: Record<string, string> = {
  heading: '--theme-font-heading',
  body: '--theme-font-body',
  code: '--theme-font-code',
}

export function applyThemeData(themeData: ThemeData): void {
  const root = document.documentElement

  if (themeData.colors) {
    for (const [key, value] of Object.entries(themeData.colors)) {
      if (!value) continue
      const cssVar = themeColorToCssVar[key]
      if (cssVar) {
        root.style.setProperty(cssVar, value)
        if (/^#[0-9a-fA-F]{6}$/.test(value)) {
          root.style.setProperty(`${cssVar}-rgb`, hexToRgb(value))
        }
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
    const styleId = 'sdd-custom-theme-css'
    let styleEl = document.getElementById(styleId) as HTMLStyleElement | null
    if (!styleEl) {
      styleEl = document.createElement('style')
      styleEl.id = styleId
      document.head.appendChild(styleEl)
    }
    styleEl.textContent = themeData.customCSS
  }
}
