import { DiagramLine, type DiagramLineStyleProps } from './DiagramLine'
import { useDiagramSize } from './DiagramCanvas'
import { toPx, type NormPoint } from './geometry'

type Props = DiagramLineStyleProps & {
  /** 経路の点列（正規化座標）。2点なら直線、3点以上なら折れ線になる */
  points: NormPoint[]
}

/**
 * 任意の点列を結ぶ折れ線（#269）。Arrow（2点固定）・Connector（2つの矩形間の orthogonalPath）に次ぐ
 * 3つ目の経路方式で、Arrow/Connector と同じ変換（useDiagramSize + toPx）を DiagramLine に橋渡しする。
 * UMLシーケンス図の自己メッセージ（同一ライフライン上に戻る「コの字」経路）のように、2点に収まらない
 * 経路が必要な場面で使う（Connector は2つの異なる矩形を結ぶ前提のため使えない）。
 */
export function Path({ points, ...lineProps }: Props) {
  const size = useDiagramSize()
  return <DiagramLine points={points.map((point) => toPx(point, size))} {...lineProps} />
}
