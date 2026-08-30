import type { CSSProperties } from 'react'
import { AxisFrame } from './AxisFrame'
import { barSpan, formatValue, VALUE_INSIDE_THRESHOLD_VERTICAL, type AxisChartProps } from './chartScale'
import styles from './Chart.module.css'

type Props = AxisChartProps

/** 縦棒グラフ。系列を項目ごとに横並びにし、基準線（0）から値の位置まで棒を伸ばす */
export function BarChart({ categories, series, scale, unit, axis, valueLabels }: Props) {
  return (
    <AxisFrame orientation="vertical" scale={scale} categories={categories} unit={unit} axis={axis}>
      <div className={styles.bars}>
        {categories.map((_, categoryIndex) => (
          <div key={categoryIndex} className={styles.barGroup}>
            {series.map((entry, seriesIndex) => {
              const value = entry.values[categoryIndex]
              if (!Number.isFinite(value)) return <div key={seriesIndex} className={styles.barSlot} />

              const { from, to } = barSpan(value, scale)
              return (
                <div key={seriesIndex} className={styles.barSlot}>
                  <div className={styles.bar} data-negative={value < 0} style={{ bottom: `${from * 100}%`, height: `${(to - from) * 100}%`, background: entry.color, '--stagger-index': categoryIndex } as CSSProperties} />
                  {valueLabels && (
                    <span className={`${styles.value} ${styles.valueAbove}`} data-inside={to > VALUE_INSIDE_THRESHOLD_VERTICAL} style={{ bottom: `${to * 100}%` }}>
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
