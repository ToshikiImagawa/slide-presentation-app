import { AxisFrame } from './AxisFrame'
import { formatValue, ratioOf, type AxisScale } from './chartScale'
import type { ResolvedSeries } from './types'
import styles from './Chart.module.css'

/** これより上端に近い値ラベルは棒の内側へ回す（プロット外にはみ出して切れるのを防ぐ） */
const VALUE_INSIDE_THRESHOLD = 0.92

type Props = {
  categories: string[]
  series: ResolvedSeries[]
  scale: AxisScale
  unit?: string
  axis: boolean
  valueLabels: boolean
}

/** 縦棒グラフ。系列を項目ごとに横並びにし、基準線（0）から値の位置まで棒を伸ばす */
export function BarChart({ categories, series, scale, unit, axis, valueLabels }: Props) {
  return (
    <AxisFrame scale={scale} categories={categories} unit={unit} axis={axis}>
      <div className={styles.bars}>
        {categories.map((_, categoryIndex) => (
          <div key={categoryIndex} className={styles.barGroup}>
            {series.map((entry, seriesIndex) => {
              const value = entry.values[categoryIndex]
              if (!Number.isFinite(value)) return <div key={seriesIndex} className={styles.barSlot} />

              const ratio = ratioOf(value, scale)
              const from = Math.min(ratio, scale.zeroRatio)
              const to = Math.max(ratio, scale.zeroRatio)
              return (
                <div key={seriesIndex} className={styles.barSlot}>
                  <div className={styles.bar} data-negative={value < 0} style={{ bottom: `${from * 100}%`, height: `${(to - from) * 100}%`, background: entry.color }} />
                  {valueLabels && (
                    <span className={`${styles.value} ${styles.valueAbove}`} data-inside={to > VALUE_INSIDE_THRESHOLD} style={{ bottom: `${to * 100}%` }}>
                      {formatValue(value, unit)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </AxisFrame>
  )
}
