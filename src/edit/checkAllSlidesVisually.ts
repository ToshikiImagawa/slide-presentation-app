import { flushSync } from 'react-dom'
import type { ConfidentialConfig, LogoConfig, SectionInfo, SlideData, ThemeData } from '../data'
import { mergeThemeData } from '../applyTheme'
import { resolveLocalAssetPaths } from '../localSlideLoader'
import { buildSections } from '../sections'
import { getVisualCheckWarnings, waitForImagesToSettle, waitForLayoutToSettle } from '../visualChecks'
import { parseSlides } from './slidesSerialize'

/** オフスクリーンで1スライドずつ描画するのに必要な、実測対象デッキの導出結果 */
export interface CheckableDeck {
  slides: SlideData[]
  logo?: LogoConfig
  confidential?: ConfidentialConfig
  theme?: ThemeData
  sections: SectionInfo[]
}

/**
 * slides.json テキストから、ライブプレビュー（SlideEditor.tsx の previewData/effectiveTheme/sections）と
 * 同じ規則でオフスクリーン描画に必要な情報を導出する。JSON 構文/構造エラーがあれば null（実行不可）。
 */
export function deriveCheckableDeck(text: string, baseDir: string, brandTheme: ThemeData | undefined): CheckableDeck | null {
  const { data, errors } = parseSlides(text)
  if (errors.length > 0) return null
  const resolved = baseDir ? resolveLocalAssetPaths(data, baseDir) : data
  const slides = resolved.slides ?? []
  return {
    slides,
    logo: resolved.meta?.logo,
    confidential: resolved.meta?.confidential,
    theme: mergeThemeData(brandTheme, resolved.theme),
    sections: buildSections(slides),
  }
}

/** 1スライド分の VisualCheck 結果（警告が無いスライドは呼び出し側で除外する） */
export interface SlideVisualCheckResult {
  index: number
  slideId: string
  warnings: string[]
}

/**
 * 全スライドを1枚ずつオフスクリーンに描画し、警告があるスライドだけを集めて返す。
 * `setCheckIndex` はオフスクリーンJSXが描く対象indexを切り替えるReact state setter（呼び出し側が
 * 対応するdeckを既にコミット済みであること）。`getSection` は直近のコミット後に呼び出し、
 * オフスクリーンコンテナから描画済みの `section.slide-container` を取り直す。
 * `flushSync` で同期コミットしてから直後にDOMを読むため、`useEffect` ベースの状態機械を持たない。
 */
export async function checkAllSlidesVisually(slides: SlideData[], setCheckIndex: (index: number) => void, getSection: () => HTMLElement | null): Promise<SlideVisualCheckResult[]> {
  const results: SlideVisualCheckResult[] = []
  for (let i = 0; i < slides.length; i++) {
    flushSync(() => setCheckIndex(i))
    const section = getSection()
    if (!section) continue
    await Promise.all([waitForImagesToSettle(section), waitForLayoutToSettle(section)])
    const warnings = getVisualCheckWarnings(section)
    if (warnings.length > 0) results.push({ index: i, slideId: slides[i].id, warnings })
  }
  return results
}

/** VisualCheck の警告を、既存の検証エラー要約（aiGenerate.ts の summarizeValidationErrors）と同型の
 * `- ` 行に整形し、AI への repairFeedback としてそのまま渡せる文字列にする */
export function summarizeVisualCheckWarnings(results: SlideVisualCheckResult[]): string {
  const lines = results.flatMap((r) => r.warnings.map((w) => `- slides[${r.index}]（id: ${r.slideId}）: ${w}`))
  return ['以下は実際の画面表示で検出された見た目の問題です（スキーマ検証とは別種）。内容の調整で解消してください。', ...lines].join('\n')
}
