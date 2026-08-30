import type { ReactNode } from 'react'
import { polylinePoints, type PxPoint } from '../diagram/geometry'
import styles from './Chart.module.css'

/**
 * 折れ線用の SVG レイヤー。preserveAspectRatio:none で 0〜100 の正規化座標をプロット全体へ引き伸ばす
 * ため、width/height は inset:0 に頼らず明示する（LineChart・KpiTrend が共有・#240）。
 */
export function ChartLineLayer({ children }: { children: ReactNode }) {
  return (
    <svg className={styles.lineLayer} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      {children}
    </svg>
  )
}

type Props = {
  /** viewBox（0〜100）上の点列。2点未満は線にならないため描画しない */
  points: PxPoint[]
  /** CSS の色指定（seriesColor が返す var(--theme-series-N)） */
  color: string
}

/**
 * 折れ線の polyline。線幅が縦横比で歪まないよう vector-effect:non-scaling-stroke を使う
 * （LineChart・KpiTrend が共有・#240）。
 *
 * ドローイン演出（pathLength=1 + stroke-dasharray/dashoffset）は撤回している: vector-effect:
 * non-scaling-stroke と pathLength による正規化を同時に指定すると、WebKit で stroke-dasharray の
 * 計算が経路全体ではなく極小単位に基づいて行われ、線が点線状に途切れて表示される不具合を実測で
 * 確認した（DiagramLine の矢印線は vector-effect を使わないため同じ問題を起こさない）。見た目の
 * 破綻を避けるため、折れ線は静的描画のままにする。
 */
export function ChartPolyline({ points, color }: Props) {
  if (points.length < 2) return null
  return <polyline points={polylinePoints(points)} fill="none" stroke={color} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" style={{ strokeWidth: 'calc(var(--theme-border-width) * 3)' }} />
}
