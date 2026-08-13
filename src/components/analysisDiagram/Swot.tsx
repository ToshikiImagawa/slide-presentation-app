import { asArray } from '../../data/loader'
import { Diagram } from '../diagram'
import { defaultSeriesColor } from '../structureDiagram/colors'
import { packAxis } from '../structureDiagram/packAxis'

export type SwotPane = {
  /** 各行の見出し（1行ごとに1項目）。改行は自動で加わるため文字列単位で渡す */
  items?: string[]
}

export type SwotSpec = {
  strengths?: SwotPane
  weaknesses?: SwotPane
  opportunities?: SwotPane
  threats?: SwotPane
  /** 4ペインの表題ラベル（省略時は Strengths / Weaknesses / Opportunities / Threats） */
  labels?: { strengths?: string; weaknesses?: string; opportunities?: string; threats?: string }
}

const MARGIN = 0.02
const GAP = 0.02
/** SWOT の慣習配置: S=左上 / W=右上 / O=左下 / T=右下（内部要因を上・外部要因を下） */
const PANE_ORDER: Array<'strengths' | 'weaknesses' | 'opportunities' | 'threats'> = ['strengths', 'weaknesses', 'opportunities', 'threats']
const DEFAULT_LABELS: Record<(typeof PANE_ORDER)[number], string> = {
  strengths: 'Strengths',
  weaknesses: 'Weaknesses',
  opportunities: 'Opportunities',
  threats: 'Threats',
}

/**
 * スライド JSON の `content.swot` を描画する SWOT マトリクス（4ペイン・#207）。
 *
 * SWOT の慣習に従い S=左上 / W=右上 / O=左下 / T=右下 に固定する（S/W は内部要因、O/T は外部要因）。
 * 4ペインの色は `defaultSeriesColor` を巡回し、単一のアクセント色に意味を持たせすぎない
 * （受け入れ基準）。項目は改行区切りで DiagramCard の body に載せ、専用のリスト装飾は持たない
 * （箇条書きの装飾を独自に付けると DiagramCard の text-overflow 制御と衝突するため）。
 */
export function Swot({ strengths, weaknesses, opportunities, threats, labels }: SwotSpec) {
  const panes = { strengths, weaknesses, opportunities, threats }
  const hasAny = PANE_ORDER.some((key) => asArray(panes[key]?.items).length > 0)
  if (!hasAny) return null

  const rowSlots = packAxis(2, MARGIN, 1 - MARGIN * 2, GAP)
  const colSlots = packAxis(2, MARGIN, 1 - MARGIN * 2, GAP)

  const nodes = PANE_ORDER.map((key, i) => {
    const row = rowSlots[Math.floor(i / 2)]
    const col = colSlots[i % 2]
    const items = asArray(panes[key]?.items)
    return {
      id: `pane-${key}`,
      rect: { x: col.offset, y: row.offset, w: col.size, h: row.size },
      title: labels?.[key] ?? DEFAULT_LABELS[key],
      body: items.join('\n'),
      color: defaultSeriesColor(i),
      variant: 'outline' as const,
    }
  })

  return <Diagram nodes={nodes} />
}
