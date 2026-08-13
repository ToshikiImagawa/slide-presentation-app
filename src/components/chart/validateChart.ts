import { asArray } from '../../data/loader'
import { resolveKpiItems } from './kpiItems'
import type { ChartSpec, ChartType } from './types'

// Chart.tsx の描画準備（resolveSeries/resolveCategories）・getChartColorTokenIssues（applyTheme.ts）・
// diagram/Diagram.tsx が共有する単一の真実源は data/loader.ts（#240）。ここでは re-export だけにとどめる
export { asArray }

const CHART_TYPES: ChartType[] = ['bar', 'line', 'pie', 'hbar', 'kpi']

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
    // 単一KPI（items未指定）もitems[0]として同じ形で検証する（resolveKpiItemsが単一の真実源・#196）
    const items = resolveKpiItems(spec)
    const invalidIndex = items.findIndex((item) => {
      const hasValue = item.value !== undefined && item.value !== null && item.value !== ''
      const hasTrend = asArray(item.trend).length > 0
      return !(hasValue || hasTrend)
    })
    if (invalidIndex === -1) return []
    const where = items.length > 1 ? `items[${invalidIndex}]の` : ''
    return [`type: "kpi" ですが${where}value と trend のいずれも指定されていません`]
  }

  return asArray(spec.series).length === 0 || countCategories(spec) === 0 ? ['categories と series の少なくとも一方が空のため描画できません'] : []
}
