import { AxisFrame } from './AxisFrame'
import { barSpan, formatValue, VALUE_INSIDE_THRESHOLD_HORIZONTAL, type AxisChartProps } from './chartScale'
import styles from './Chart.module.css'

/** これを超える項目数では行の余白と文字を詰める（横棒は各項目が1行を占めるため間引きができない） */
const DENSE_ROW_THRESHOLD = 10

type Props = AxisChartProps

/** 横棒グラフ。項目名を左に揃えて並べるため、項目名が長い比較（施策名・部署名等）でも読める */
export function HBarChart({ categories, series, scale, unit, axis, valueLabels }: Props) {
  return (
    <AxisFrame orientation="horizontal" scale={scale} categories={categories} unit={unit} axis={axis} dense={categories.length > DENSE_ROW_THRESHOLD}>
      <div className={styles.hbarRows}>
        {categories.map((_, categoryIndex) => (
          <div key={categoryIndex} className={styles.hbarRow}>
            {series.map((entry, seriesIndex) => {
              const value = entry.values[categoryIndex]
              if (!Number.isFinite(value)) return <div key={seriesIndex} className={styles.hbarSlot} />

              const { from, to } = barSpan(value, scale)
              return (
                <div key={seriesIndex} className={styles.hbarSlot}>
                  <div className={styles.hbarBar} data-negative={value < 0} style={{ left: `${from * 100}%`, width: `${(to - from) * 100}%`, background: entry.color }} />
                  {valueLabels && (
                    <span className={`${styles.value} ${styles.valueAfter}`} data-inside={to > VALUE_INSIDE_THRESHOLD_HORIZONTAL} style={{ left: `${to * 100}%` }}>
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
