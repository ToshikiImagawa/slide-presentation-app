import { AxisFrame } from './AxisFrame'
import { formatValue, ratioOf, round2, type AxisScale } from './chartScale'
import type { ResolvedSeries } from './types'
import styles from './Chart.module.css'

/** これより上端に近い値ラベルは点の下へ回す（プロット外にはみ出して切れるのを防ぐ） */
const VALUE_INSIDE_THRESHOLD = 0.92

type Props = {
  categories: string[]
  series: ResolvedSeries[]
  scale: AxisScale
  unit?: string
  axis: boolean
  valueLabels: boolean
}

/** 項目の中心のX位置（%）。縦棒・横軸ラベルと同じ割り方なので、点が項目名の真上に来る */
function xOf(index: number, count: number): number {
  return ((index + 0.5) / Math.max(count, 1)) * 100
}

/**
 * 折れ線グラフ。線だけを SVG で描き、点・値ラベルは HTML 要素で載せる。
 * SVG は preserveAspectRatio:none でプロット全体へ引き伸ばすため、線幅が縦横比で歪まないよう
 * vector-effect:non-scaling-stroke を使う（点を HTML にしているのも同じ理由で、円が楕円に潰れない）。
 */
export function LineChart({ categories, series, scale, unit, axis, valueLabels }: Props) {
  const count = categories.length

  return (
    <AxisFrame scale={scale} categories={categories} unit={unit} axis={axis}>
      <svg className={styles.lineLayer} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        {series.map((entry, seriesIndex) => {
          const points = entry.values
            .map((value, index) => ({ value, index }))
            .filter(({ value }) => Number.isFinite(value))
            .map(({ value, index }) => `${round2(xOf(index, count))},${round2((1 - ratioOf(value, scale)) * 100)}`)
            .join(' ')
          if (points === '') return null
          return <polyline key={seriesIndex} points={points} fill="none" stroke={entry.color} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 'calc(var(--theme-border-width) * 3)' }} />
        })}
      </svg>

      {series.map((entry, seriesIndex) =>
        entry.values.map((value, index) => {
          if (!Number.isFinite(value)) return null
          const ratio = ratioOf(value, scale)
          return (
            <span key={`${seriesIndex}-${index}`}>
              <span className={styles.point} style={{ left: `${xOf(index, count)}%`, bottom: `${ratio * 100}%`, background: entry.color }} />
              {valueLabels && (
                <span className={`${styles.value} ${styles.valueAbove}`} data-inside={ratio > VALUE_INSIDE_THRESHOLD} style={{ left: `${xOf(index, count)}%`, bottom: `${ratio * 100}%` }}>
                  {formatValue(value, unit)}
                </span>
              )}
            </span>
          )
        }),
      )}
    </AxisFrame>
  )
}
