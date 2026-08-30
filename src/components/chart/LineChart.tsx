import { Fragment, type CSSProperties } from 'react'
import { AxisFrame } from './AxisFrame'
import { ChartLineLayer, ChartPolyline } from './ChartPolyline'
import { formatValue, ratioOf, VALUE_INSIDE_THRESHOLD_VERTICAL, type AxisChartProps } from './chartScale'
import styles from './Chart.module.css'

type Props = AxisChartProps

/** 項目の中心のX位置（%）。縦棒・横軸ラベルと同じ割り方なので、点が項目名の真上に来る */
function xOf(index: number, count: number): number {
  return ((index + 0.5) / Math.max(count, 1)) * 100
}

/**
 * 折れ線グラフ。線だけを SVG で描き、点・値ラベルは HTML 要素で載せる。
 * 点を HTML にしているのは、SVG の preserveAspectRatio:none 引き伸ばしでも円が楕円に潰れないようにするため。
 */
export function LineChart({ categories, series, scale, unit, axis, valueLabels }: Props) {
  const count = categories.length

  return (
    <AxisFrame orientation="vertical" scale={scale} categories={categories} unit={unit} axis={axis}>
      <ChartLineLayer>
        {series.map((entry, seriesIndex) => {
          const points = entry.values
            .map((value, index) => ({ value, index }))
            .filter(({ value }) => Number.isFinite(value))
            .map(({ value, index }) => ({ x: xOf(index, count), y: (1 - ratioOf(value, scale)) * 100 }))
          return <ChartPolyline key={seriesIndex} points={points} color={entry.color} />
        })}
      </ChartLineLayer>

      {series.map((entry, seriesIndex) =>
        entry.values.map((value, index) => {
          if (!Number.isFinite(value)) return null
          const ratio = ratioOf(value, scale)
          return (
            <Fragment key={`${seriesIndex}-${index}`}>
              <span className={styles.point} style={{ left: `${xOf(index, count)}%`, bottom: `${ratio * 100}%`, background: entry.color, '--point-progress': xOf(index, count) / 100 } as CSSProperties} />
              {valueLabels && (
                <span className={`${styles.value} ${styles.valueAbove}`} data-inside={ratio > VALUE_INSIDE_THRESHOLD_VERTICAL} style={{ left: `${xOf(index, count)}%`, bottom: `${ratio * 100}%` }}>
                  {formatValue(value, unit)}
                </span>
              )}
            </Fragment>
          )
        }),
      )}
    </AxisFrame>
  )
}
