import type { ReactNode } from 'react'
import { formatValue, pickLabelIndices, ratioOf, type AxisScale } from './chartScale'
import styles from './Chart.module.css'

/** 横軸に並べられる項目名の上限。これを超えると等間隔に間引く（#204 の間引き規則） */
export const MAX_AXIS_LABELS = 12

type Props = {
  scale: AxisScale
  categories: string[]
  unit?: string
  /** 目盛りラベルと格子線を描くか */
  axis: boolean
  /** プロット領域に載せるマーク（棒・折れ線） */
  children: ReactNode
}

/**
 * 縦軸の目盛り・格子線・横軸の項目名からなる軸枠（縦棒・折れ線が共有する）。
 * マークは `children` としてプロット領域（position: relative）に載せ、比率（%）で配置する。
 */
export function AxisFrame({ scale, categories, unit, axis, children }: Props) {
  const visibleLabels = pickLabelIndices(categories.length, MAX_AXIS_LABELS)

  return (
    <div className={styles.plotGrid}>
      {axis && (
        <div className={styles.yAxis}>
          {[...scale.ticks].reverse().map((tick, index) => (
            <span key={index}>{formatValue(tick, unit)}</span>
          ))}
        </div>
      )}
      <div className={styles.plot} data-testid="chart-plot">
        {axis && scale.ticks.map((tick, index) => <div key={index} className={styles.gridline} style={{ bottom: `${ratioOf(tick, scale) * 100}%` }} />)}
        {scale.min < 0 && <div className={styles.baseline} style={{ bottom: `${scale.zeroRatio * 100}%` }} />}
        {children}
      </div>
      <div className={styles.xAxis}>
        {categories.map((category, index) => (
          <span key={index} className={styles.xLabel}>
            {visibleLabels.has(index) ? category : ''}
          </span>
        ))}
      </div>
    </div>
  )
}
