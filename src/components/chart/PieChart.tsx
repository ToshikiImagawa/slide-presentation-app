import type { CSSProperties } from 'react'
import { arcPath, pieSlices, polarPoint } from './chartScale'
import styles from './Chart.module.css'

/** viewBox（0 0 100 100）内での円の半径。扇形の境界線がキャンバス端で切れない分だけ余白を残す */
const RADIUS = 47

/** 扇形上に構成比ラベルを置く半径の割合 */
const LABEL_RADIUS_RATIO = 0.66

/** これ未満の構成比はラベルが隣と重なるため扇形上に書かない（凡例側で値を読ませる） */
const LABEL_MIN_SHARE = 0.07

type Props = {
  values: number[]
  /** categories と同じ順序の色。CSS の色指定（var(--theme-series-N)） */
  colors: string[]
  valueLabels: boolean
}

/** 円グラフ（構成比）。扇形上には百分率だけを置き、項目名と実数値は凡例側で読ませる */
export function PieChart({ values, colors, valueLabels }: Props) {
  const slices = pieSlices(values)
  if (slices.length === 0) return null

  // 単一項目は始点と終点が一致して扇形パスが描けないため、円としてそのまま塗る
  const single = slices.length === 1

  return (
    <div className={styles.pieArea}>
      <div className={styles.pieBox} data-testid="chart-pie">
        <svg className={styles.pieSvg} viewBox="0 0 100 100" aria-hidden="true">
          {single ? (
            <circle cx={50} cy={50} r={RADIUS} fill={colors[slices[0].index]} className={styles.pieSlice} />
          ) : (
            slices.map((slice) => (
              <path
                key={slice.index}
                d={arcPath(50, 50, RADIUS, slice.startAngle, slice.endAngle)}
                fill={colors[slice.index]}
                stroke="var(--theme-background)"
                strokeWidth={0.5}
                className={styles.pieSlice}
                style={{ '--stagger-index': slice.index } as CSSProperties}
              />
            ))
          )}
        </svg>

        {valueLabels &&
          slices
            .filter((slice) => slice.share >= LABEL_MIN_SHARE)
            .map((slice) => {
              const at = polarPoint(50, 50, RADIUS * LABEL_RADIUS_RATIO, slice.midAngle)
              return (
                <span key={slice.index} className={styles.pieLabel} style={{ left: `${at.x}%`, top: `${at.y}%`, '--stagger-index': slice.index } as CSSProperties}>
                  {Math.round(slice.share * 100)}%
                </span>
              )
            })}
      </div>
    </div>
  )
}
