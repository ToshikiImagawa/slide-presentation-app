import { DiagramLine, type DiagramLineStyleProps } from './DiagramLine'
import { useDiagramSize } from './DiagramCanvas'
import { orthogonalPath, type ConnectorRouting, type NormRect } from './geometry'

type Props = DiagramLineStyleProps & {
  /** 始点側の要素の矩形（正規化座標） */
  from: NormRect
  /** 終点側の要素の矩形（正規化座標） */
  to: NormRect
  /** 経路方向。省略時は 'auto'（矩形の隙間と中心距離から決める） */
  routing?: ConnectorRouting
}

/**
 * 2 つの要素を直交経路で結ぶコネクタ（#202）。
 * 経路の両端は必ず各矩形の辺の上に載るため、境界から離れたり食い込んだりしない（orthogonalPath 参照）。
 */
export function Connector({ from, to, routing, ...lineProps }: Props) {
  const size = useDiagramSize()
  return <DiagramLine points={orthogonalPath(from, to, size, routing)} {...lineProps} />
}
