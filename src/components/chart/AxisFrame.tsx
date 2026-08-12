import type { CSSProperties, ReactNode } from 'react'
import { formatValue, pickLabelIndices, ratioOf, type AxisScale } from './chartScale'
import styles from './Chart.module.css'

/** 横軸（縦棒・折れ線）に並べられる項目名の上限。これを超えると等間隔に間引く（#204 の間引き規則）。
 * 横棒は各項目が1行を占めるため間引きの対象にしない（HBarChart の DENSE_ROW_THRESHOLD 参照） */
const MAX_AXIS_LABELS = 12

type Props = {
  /** 'vertical': 縦棒・折れ線（側の列に目盛り値、下の行に項目名）。'horizontal': 横棒（側の列に項目名、下の行に目盛り値） */
  orientation: 'vertical' | 'horizontal'
  scale: AxisScale
  categories: string[]
  unit?: string
  /** 目盛りラベルと格子線を描くか */
  axis: boolean
  /** horizontal 専用。項目が多いとき行の余白と文字を詰める（横棒は間引きができないため） */
  dense?: boolean
  /** プロット領域に載せるマーク（棒・折れ線） */
  children: ReactNode
}

/**
 * 軸枠（縦棒・折れ線・横棒が共有・#240）。側の列・プロット・下の行からなる3領域グリッドは共通だが、
 * どちらに目盛り値／項目名を置くかが向きで入れ替わる（縦棒・折れ線は側=目盛り値・下=項目名、横棒は逆）。
 * マークは `children` としてプロット領域（position: relative）に載せ、比率（%）で配置する。
 */
export function AxisFrame({ orientation, scale, categories, unit, axis, dense, children }: Props) {
  const isHorizontal = orientation === 'horizontal'
  // 横棒は各項目が1行を占めるため間引きの対象にしない（#204 の間引き規則は縦棒・折れ線の項目名にのみ適用する）。
  // 未使用のまま Set を作る無駄を避けるため、対象になるときだけ計算する
  const visibleLabels = isHorizontal ? undefined : pickLabelIndices(categories.length, MAX_AXIS_LABELS)
  // 主軸の位置指定（横棒は left、縦棒・折れ線は bottom）。目盛り・基準線のスタイルが1箇所で決まる
  const positionStyle = (ratio: number): CSSProperties => (isHorizontal ? { left: `${ratio * 100}%` } : { bottom: `${ratio * 100}%` })
  const gridlineClass = isHorizontal ? styles.gridlineVertical : styles.gridline
  const baselineClass = isHorizontal ? styles.baselineVertical : styles.baseline

  // 項目名（categories）は axis の指定に関わらず常に描く。目盛り値（scale.ticks）は axis: false で消える側
  // （縦棒・折れ線は側の列、横棒は下の行）。向き（isHorizontal）は関数内で直接参照し、呼び出し側では渡さない
  const tickLabels = () => (isHorizontal ? scale.ticks : [...scale.ticks].reverse()).map((tick, index) => <span key={index}>{formatValue(tick, unit)}</span>)
  const categoryLabels = () =>
    categories.map((category, index) =>
      isHorizontal ? (
        <span key={index} className={styles.hbarLabel}>
          {category}
        </span>
      ) : (
        <span key={index} className={styles.xLabel}>
          {visibleLabels?.has(index) ? category : ''}
        </span>
      ),
    )

  return (
    <div className={isHorizontal ? styles.hbarGrid : styles.plotGrid} data-dense={isHorizontal ? dense : undefined} data-testid={isHorizontal ? 'chart-hbar' : undefined}>
      {isHorizontal ? <div className={styles.hbarLabels}>{categoryLabels()}</div> : axis && <div className={styles.yAxis}>{tickLabels()}</div>}

      <div className={styles.plot} data-testid="chart-plot">
        {axis && scale.ticks.map((tick, index) => <div key={index} className={gridlineClass} style={positionStyle(ratioOf(tick, scale))} />)}
        {scale.min < 0 && <div className={baselineClass} style={positionStyle(scale.zeroRatio)} />}
        {children}
      </div>

      {isHorizontal ? axis && <div className={styles.hbarAxis}>{tickLabels()}</div> : <div className={styles.xAxis}>{categoryLabels()}</div>}
    </div>
  )
}
