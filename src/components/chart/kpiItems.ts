import { asArray } from '../../data/loader'
import type { ChartSpec, KpiItemSpec } from './types'

/**
 * type: "kpi" の指標配列を解決する（#196）。`items` が明示されていればそれを使い、
 * 無ければ ChartSpec 直下の単体フィールド（value/label/delta 等）を要素数1の配列として扱う。
 * 単一KPIとKPI行が同じ形（KpiItemSpec[]）を通るので、描画（KpiRow）・検証（getChartSpecIssues）の
 * どちらも2系統に分裂しない。各要素の unit は省略時に ChartSpec.unit を継承する。
 */
export function resolveKpiItems(spec: ChartSpec): KpiItemSpec[] {
  const items = asArray(spec.items)
  if (items.length > 0) return items.map((item) => ({ ...item, unit: item.unit ?? spec.unit }))

  return [
    {
      value: spec.value,
      label: spec.label,
      unit: spec.unit,
      delta: spec.delta,
      deltaDirection: spec.deltaDirection,
      deltaStatus: spec.deltaStatus,
      trend: spec.trend,
      color: spec.color,
    },
  ]
}
