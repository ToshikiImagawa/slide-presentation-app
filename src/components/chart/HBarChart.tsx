import { formatValue, ratioOf, type AxisScale } from './chartScale'
import type { ResolvedSeries } from './types'
import styles from './Chart.module.css'

/** これを超える項目数では行の余白と文字を詰める（横棒は各項目が1行を占めるため間引きができない） */
const DENSE_ROW_THRESHOLD = 10

/** これより右端に近い値ラベルは棒の内側へ回す（プロット外にはみ出して切れるのを防ぐ） */
const VALUE_INSIDE_THRESHOLD = 0.88

type Props = {
  categories: string[]
  series: ResolvedSeries[]
  scale: AxisScale
  unit?: string
  axis: boolean
  valueLabels: boolean
}

/** 横棒グラフ。項目名を左に揃えて並べるため、項目名が長い比較（施策名・部署名等）でも読める */
export function HBarChart({ categories, series, scale, unit, axis, valueLabels }: Props) {
  return (
    <div className={styles.hbarGrid} data-dense={categories.length > DENSE_ROW_THRESHOLD} data-testid="chart-hbar">
      <div className={styles.hbarLabels}>
        {categories.map((category, index) => (
          <span key={index} className={styles.hbarLabel}>
            {category}
          </span>
        ))}
      </div>

      <div className={styles.plot} data-testid="chart-plot">
        {axis && scale.ticks.map((tick, index) => <div key={index} className={styles.gridlineVertical} style={{ left: `${ratioOf(tick, scale) * 100}%` }} />)}
        <div className={styles.hbarRows}>
          {categories.map((_, categoryIndex) => (
            <div key={categoryIndex} className={styles.hbarRow}>
              {series.map((entry, seriesIndex) => {
                const value = entry.values[categoryIndex]
                if (!Number.isFinite(value)) return <div key={seriesIndex} className={styles.hbarSlot} />

                const ratio = ratioOf(value, scale)
                const from = Math.min(ratio, scale.zeroRatio)
                const to = Math.max(ratio, scale.zeroRatio)
                return (
                  <div key={seriesIndex} className={styles.hbarSlot}>
                    <div className={styles.hbarBar} data-negative={value < 0} style={{ left: `${from * 100}%`, width: `${(to - from) * 100}%`, background: entry.color }} />
                    {valueLabels && (
                      <span className={`${styles.value} ${styles.valueAfter}`} data-inside={to > VALUE_INSIDE_THRESHOLD} style={{ left: `${to * 100}%` }}>
                        {formatValue(value, unit)}
                      </span>
                    )}
                  </div>
                )
              })}
            </div>
          ))}
        </div>
      </div>

      {axis && (
        <div className={styles.hbarAxis}>
          {scale.ticks.map((tick, index) => (
            <span key={index}>{formatValue(tick, unit)}</span>
          ))}
        </div>
      )}
    </div>
  )
}
