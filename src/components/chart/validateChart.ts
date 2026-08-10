import type { ChartSpec, ChartType } from './types'

const CHART_TYPES: ChartType[] = ['bar', 'line', 'pie', 'hbar', 'kpi']

/** JSON 由来の値は配列でない可能性があるため、判定前に配列だけを通す（不正なデッキで判定自体を落とさない）。
 * Chart.tsx の描画準備（resolveSeries/resolveCategories）と getChartColorTokenIssues（applyTheme.ts）が共有する */
export function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : []
}

function countCategories(spec: ChartSpec): number {
  const declared = asArray(spec.categories).length
  const seriesMax = asArray(spec.series).reduce((max, entry) => Math.max(max, asArray(entry?.values).length), 0)
  return Math.max(declared, seriesMax)
}

/**
 * ChartSpec の構造的な不整合を検出する（色トークンの綴りミスは対象外。getChartWarnings（applyTheme.ts）が
 * THEME_COLOR_TOKENS を直接見て別途検出する。ここで色解決を挟むと未知トークンが `primary` へ黙って
 * フォールバックし判定できなくなるため）。
 *
 * `Chart()` の描画抑止条件（`console.warn` + `return null`）と `getChartWarnings` が同じ判定を共有する
 * 単一の真実源（#241）。
 */
export function getChartSpecIssues(spec: ChartSpec): string[] {
  const type = spec.type ?? 'bar'
  if (!CHART_TYPES.includes(type)) {
    return [`未知のチャート種別です: "${type}"（${CHART_TYPES.join(' / ')} のいずれかを指定してください）`]
  }

  if (type === 'kpi') {
    const hasValue = spec.value !== undefined && spec.value !== null && spec.value !== ''
    const hasTrend = asArray(spec.trend).length > 0
    return hasValue || hasTrend ? [] : ['type: "kpi" ですが value と trend のいずれも指定されていません']
  }

  return asArray(spec.series).length === 0 || countCategories(spec) === 0 ? ['categories と series の少なくとも一方が空のため描画できません'] : []
}
