import { DiagramLine, type DiagramLineStyleProps } from './DiagramLine'
import { useDiagramSize } from './DiagramCanvas'
import { toPx, type NormPoint } from './geometry'

type Props = DiagramLineStyleProps & {
  /** 始点（正規化座標） */
  from: NormPoint
  /** 終点（正規化座標） */
  to: NormPoint
}

/**
 * 2 点を結ぶ直線の矢印（#202）。水平・垂直・斜めのいずれも from / to の指定だけで表せる。
 * 先端形状・線幅・色・破線は DiagramLine と共通のオプションで指定する。
 */
export function Arrow({ from, to, ...lineProps }: Props) {
  const size = useDiagramSize()
  return <DiagramLine points={[toPx(from, size), toPx(to, size)]} {...lineProps} />
}
