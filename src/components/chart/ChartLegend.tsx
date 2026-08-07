import styles from './Chart.module.css'

export type LegendEntry = {
  label: string
  /** CSS の色指定（seriesColor が返す var(--theme-series-N)） */
  color: string
}

/** 系列（円は内訳項目）と色の対応を示す凡例 */
export function ChartLegend({ entries }: { entries: LegendEntry[] }) {
  if (entries.length === 0) return null

  return (
    <div className={styles.legend} data-testid="chart-legend">
      {entries.map((entry, index) => (
        <span key={index} className={styles.legendItem}>
          <span className={styles.legendSwatch} style={{ background: entry.color }} />
          {entry.label}
        </span>
      ))}
    </div>
  )
}
