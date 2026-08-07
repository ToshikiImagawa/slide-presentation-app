import { formatValue, round2 } from './chartScale'
import styles from './Chart.module.css'

/** 推移線を描く縦方向の使用範囲（上下に余白を残し、最大値・最小値の点が切れないようにする） */
const TREND_PADDING = 0.12

type Props = {
  value?: string | number
  label?: string
  delta?: string
  unit?: string
  trend: number[]
  /** CSS の色指定（seriesColor が返す var(--theme-series-N)） */
  color: string
}

/** 推移線のY位置（0=下端, 1=上端）。実績の変化が読めるよう 0 基準ではなくデータ範囲に合わせる */
function ratios(values: number[]): number[] {
  const min = Math.min(...values)
  const span = Math.max(...values) - min || 1
  return values.map((value) => TREND_PADDING + ((value - min) / span) * (1 - TREND_PADDING * 2))
}

/** 大数値＋推移（KPI）。主役は数値なので、推移線は傾向だけが読めるスパークラインとして添える */
export function KpiTrend({ value, label, delta, unit, trend, color }: Props) {
  const points = trend.filter((entry) => Number.isFinite(entry))
  const heights = points.length >= 2 ? ratios(points) : []
  const formatted = typeof value === 'number' ? formatValue(value, unit) : value === undefined ? '' : `${value}${unit ?? ''}`

  return (
    <div className={styles.kpi} data-testid="chart-kpi">
      {label && <span className={styles.kpiLabel}>{label}</span>}
      {formatted !== '' && (
        <span className={styles.kpiValue} style={{ color }}>
          {formatted}
        </span>
      )}
      {delta && (
        <span className={styles.kpiDelta} style={{ color }}>
          {delta}
        </span>
      )}

      {heights.length >= 2 && (
        <div className={styles.kpiTrend}>
          <svg className={styles.lineLayer} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <polyline
              points={heights.map((ratio, index) => `${round2((index / (heights.length - 1)) * 100)},${round2((1 - ratio) * 100)}`).join(' ')}
              fill="none"
              stroke={color}
              strokeLinecap="round"
              strokeLinejoin="round"
              vectorEffect="non-scaling-stroke"
              style={{ strokeWidth: 'calc(var(--theme-border-width) * 3)' }}
            />
          </svg>
          <span className={styles.point} style={{ left: '100%', bottom: `${heights[heights.length - 1] * 100}%`, background: color }} />
        </div>
      )}
    </div>
  )
}
