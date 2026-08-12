import { asArray } from '../../data/loader'
import { Connector, DiagramBadge, DiagramCanvas, DiagramCard, type NormRect } from '../diagram'
import type { FlowStep } from './types'

/** カード間の隙間（正規化幅） */
const GAP = 0.035

/** 工程数に応じたカードの正規化幅とフォント縮小率を決める（3〜5工程を想定・#200）。
 * 工程が増えるほど1枚あたりの幅が狭くなるため、タイトル・説明文のフォントも合わせて縮める */
function resolveMetrics(count: number): { width: number; fontScale: number } {
  const width = (1 - GAP * (count - 1)) / count
  const fontScale = count <= 3 ? 1 : count === 4 ? 0.9 : 0.8
  return { width, fontScale }
}

function cardRect(index: number, width: number): NormRect {
  return { x: index * (width + GAP), y: 0.28, w: width, h: 0.44 }
}

/**
 * スライド JSON の `content.flow` を描画する横フロー（工程カード＋工程間の矢印・#200）。
 * カードは #202 の DiagramCard / DiagramBadge、矢印は Connector を再利用する（Connector は矢印の両端を
 * 必ずカード境界に載せるため、境界から離れたり食い込んだりしない）。カード幅・文字サイズは工程数から自動決定する。
 */
export function Flow({ steps }: { steps?: FlowStep[] }) {
  const list = asArray(steps)
  if (list.length === 0) return null

  const { width, fontScale } = resolveMetrics(list.length)
  const rects = list.map((_, i) => cardRect(i, width))

  return (
    <DiagramCanvas>
      {rects.map((rect, i) => i > 0 && <Connector key={`arrow-${i}`} from={rects[i - 1]} to={rect} />)}
      {list.map((step, i) => (
        <DiagramCard key={i} rect={rects[i]} scale={fontScale} badge={<DiagramBadge>{i + 1}</DiagramBadge>} title={step.title}>
          {step.description}
        </DiagramCard>
      ))}
    </DiagramCanvas>
  )
}
