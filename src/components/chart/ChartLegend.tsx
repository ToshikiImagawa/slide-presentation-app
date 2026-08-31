import type { CSSProperties } from 'react'
import styles from './Chart.module.css'

export type LegendEntry = {
  label: string
  /** CSS の色指定（seriesColor が返す var(--theme-series-N)） */
  color: string
}

/**
 * 系列（円は内訳項目）と色の対応を示す凡例。
 * 項目ごとの出現演出は global.css の `.stagger-item`（Timeline/FeatureTileGrid 等と同じ汎用ユーティリティ）
 * を再利用する（#416。Chart.module.css 側に演出を複製しない）。
 */
export function ChartLegend({ entries }: { entries: LegendEntry[] }) {
  if (entries.length === 0) return null

  return (
    <div className={styles.legend} data-testid="chart-legend">
      {entries.map((entry, index) => (
        <span key={index} className={`${styles.legendItem} stagger-item`} style={{ '--stagger-index': index } as CSSProperties}>
          <span className={styles.legendSwatch} style={{ background: entry.color }} />
          {entry.label}
        </span>
      ))}
    </div>
  )
}
