import { asArray } from '../../data/loader'
import { seriesColor } from './chartScale'
import { KpiTrend } from './KpiTrend'
import type { KpiItemSpec } from './types'
import styles from './Chart.module.css'

type Props = {
  items: KpiItemSpec[]
}

/** 個数から密度（値の文字サイズの縮小段階）を決める。Table・Checklistのresolvedensityと同じ考え方で、
 * 実際にはみ出していないかは npm run reference-deck:inspect が実測で検出する */
function resolveDensity(count: number): 'normal' | 'dense' | 'compact' {
  if (count > 4) return 'compact'
  if (count > 2) return 'dense'
  return 'normal'
}

/**
 * type: "kpi" の指標を1〜5個横に並べる（#196）。単一KPI（items長さ1）もこの経路を通るので、
 * 個々の値・見出し・増減・推移線の描画は KpiTrend 1本に集約される（2系統に分裂させない）。
 * カード枠は要素が2個以上のときだけ CSS の :not(:only-child) で付き、単一KPIの見た目は変わらない。
 */
export function KpiRow({ items }: Props) {
  return (
    <div className={styles.kpiRow} data-testid="chart-kpi-row" data-density={resolveDensity(items.length)}>
      {items.map((item, index) => (
        <KpiTrend key={index} {...item} trend={asArray(item.trend).map(Number)} color={seriesColor(index, item.color)} />
      ))}
    </div>
  )
}
