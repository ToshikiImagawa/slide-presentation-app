import type { ReactNode } from 'react'
import { DiagramLine, type LineEndShape } from './DiagramLine'
import { useDiagramSize } from './DiagramCanvas'
import { toPx, type NormPoint } from './geometry'
import styles from './Callout.module.css'

type Props = {
  /** 指し示す点（正規化座標）。画像上のコールアウトならその箇所 */
  at: NormPoint
  /** ラベルを置く点（正規化座標）。ラベルはこの点から at の反対側へ伸びる */
  to: NormPoint
  label: ReactNode
  /** カラーパレットキー名（例: 'series2'）。省略時は 'neutral' */
  color?: string
  /** 線幅。--theme-border-width に掛ける倍率 */
  thickness?: number
  /** at 側の端点形状。省略時は 'dot' */
  head?: LineEndShape
}

/**
 * 引出線 + ラベル（#202）。画像や図の一点を指してラベルを添えるコールアウトに使う。
 *
 * ラベルは to を基準に at の反対側へ伸ばすので、ラベルの実寸を測らなくても引出線に重ならない。
 */
export function Callout({ at, to, label, color, thickness, head = 'dot' }: Props) {
  const size = useDiagramSize()
  // to が at より右にあるなら、ラベルはさらに右（= 図の外側）へ伸ばす
  const anchorClass = to.x >= at.x ? styles.anchorLeft : styles.anchorRight

  return (
    <>
      <DiagramLine points={[toPx(to, size), toPx(at, size)]} color={color} thickness={thickness} head={head} />
      <span className={`${styles.label} ${anchorClass}`} style={{ left: `${to.x * 100}%`, top: `${to.y * 100}%` }}>
        {label}
      </span>
    </>
  )
}
