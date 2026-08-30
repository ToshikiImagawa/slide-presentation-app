import type { CSSProperties } from 'react'
import { resolveColorToken } from '../../applyTheme'
import { ChartLineLayer, ChartPolyline } from './ChartPolyline'
import { formatValue } from './chartScale'
import type { KpiDirection } from './types'
import styles from './Chart.module.css'

/** 推移線を描く縦方向の使用範囲（上下に余白を残し、最大値・最小値の点が切れないようにする） */
const TREND_PADDING = 0.12

/** 増減の方向記号。良し悪しの判定はしない（色は deltaStatus が別に決める・#196） */
const DIRECTION_MARK: Record<KpiDirection, string> = { up: '▲', down: '▼', flat: '–' }

type Props = {
  value?: string | number
  label?: string
  delta?: string
  /** 増減注記の方向記号。省略時は記号なし */
  deltaDirection?: KpiDirection
  /** 増減注記の色トークン名。省略時は value/trend と同じ color を使う */
  deltaStatus?: string
  unit?: string
  trend: number[]
  /** CSS の色指定（seriesColor が返す var(--theme-series-N)） */
  color: string
  /** 表示順のインデックス。KpiRow で複数個並べるときに段階的な出現演出の delay を決める（省略時0） */
  index?: number
}

/** 推移線のY位置（0=下端, 1=上端）。実績の変化が読めるよう 0 基準ではなくデータ範囲に合わせる */
function ratios(values: number[]): number[] {
  const min = Math.min(...values)
  const span = Math.max(...values) - min || 1
  return values.map((value) => TREND_PADDING + ((value - min) / span) * (1 - TREND_PADDING * 2))
}

/** 大数値の表示形式。数値は formatValue（桁区切り＋単位）、文字列はそのまま単位を添える */
function formatKpiValue(value: string | number | undefined, unit?: string): string {
  if (typeof value === 'number') return formatValue(value, unit)
  if (value === undefined) return ''
  return `${value}${unit ?? ''}`
}

/** 大数値＋推移（KPI）。主役は数値なので、推移線は傾向だけが読めるスパークラインとして添える */
export function KpiTrend({ value, label, delta, deltaDirection, deltaStatus, unit, trend, color, index }: Props) {
  const values = trend.filter((entry) => Number.isFinite(entry))
  const heights = values.length >= 2 ? ratios(values) : []
  const formatted = formatKpiValue(value, unit)
  const deltaColor = deltaStatus ? `var(${resolveColorToken(deltaStatus)})` : color

  return (
    <div className={`${styles.kpi} stagger-item`} data-testid="chart-kpi" style={{ '--stagger-index': index ?? 0 } as CSSProperties}>
      {label && <span className={styles.kpiLabel}>{label}</span>}
      {formatted !== '' && (
        <span className={styles.kpiValue} style={{ color }}>
          {formatted}
        </span>
      )}
      {delta && (
        <span className={styles.kpiDelta} style={{ color: deltaColor }}>
          {deltaDirection && <span className={styles.kpiDeltaMark}>{DIRECTION_MARK[deltaDirection]}</span>}
          {delta}
        </span>
      )}

      {heights.length > 0 && (
        <div className={styles.kpiTrend}>
          <ChartLineLayer>
            <ChartPolyline points={heights.map((ratio, i) => ({ x: (i / (heights.length - 1)) * 100, y: (1 - ratio) * 100 }))} color={color} />
          </ChartLineLayer>
          <span className={styles.point} style={{ left: '100%', bottom: `${heights[heights.length - 1] * 100}%`, background: color, '--point-progress': 1 } as CSSProperties} />
        </div>
      )}
    </div>
  )
}
