import type { ComponentProps } from 'react'
import { asArray } from '../../data/loader'
import { Arrow } from './Arrow'
import { Callout } from './Callout'
import { Connector } from './Connector'
import { DiagramBadge } from './DiagramBadge'
import { DiagramCanvas } from './DiagramCanvas'
import { DiagramCard } from './DiagramCard'
import type { DiagramLineStyleProps } from './DiagramLine'
import type { ConnectorRouting, NormPoint } from './geometry'

/** 線の見た目（矢印・コネクタ共通）。ラベルだけ JSON で書ける string に狭め、他はプリミティブの契約をそのまま使う */
type LineSpec = Omit<DiagramLineStyleProps, 'label'> & { label?: string }

/** カードの見た目はプリミティブの props から導出し、union リテラルを二重管理しない */
type NodeSpec = Pick<ComponentProps<typeof DiagramCard>, 'rect' | 'color' | 'variant'> & {
  /** connectors から参照するための識別子 */
  id?: string
  title?: string
  body?: string
  /** 左上に重ねる番号・記号バッジ */
  badge?: string | number
}

/** nodes の id 同士を直交経路で結ぶ */
type ConnectorSpec = LineSpec & { from: string; to: string; routing?: ConnectorRouting }

type ArrowSpec = LineSpec & { from: NormPoint; to: NormPoint }

type BadgeSpec = Pick<ComponentProps<typeof DiagramBadge>, 'color' | 'shape'> & { at: NormPoint; text: string | number }

type CalloutSpec = Omit<ComponentProps<typeof Callout>, 'label'> & { label: string }

export type DiagramProps = {
  nodes?: NodeSpec[]
  connectors?: ConnectorSpec[]
  arrows?: ArrowSpec[]
  badges?: BadgeSpec[]
  callouts?: CalloutSpec[]
}

/**
 * 図解プリミティブを JSON から組み立てるコンポーネント（#202）。ComponentRegistry に `Diagram` として登録する。
 *
 * 座標はすべてキャンバス相対の正規化座標（0〜1）で指定するため、キャンバスサイズを変えても
 * 相対配置が保たれる。色・線幅・角丸は各プリミティブがテーマトークンから引く。
 *
 * 描画順は「線 → カード → バッジ → 引出線」。カードが線の端を覆い、注釈（引出線）が最前面に来る。
 */
export function Diagram({ nodes, connectors, arrows, badges, callouts }: DiagramProps) {
  const nodeList = asArray(nodes).filter((node) => node.rect)
  const rects = new Map(nodeList.filter((node) => node.id !== undefined).map((node) => [node.id as string, node.rect]))

  return (
    <DiagramCanvas>
      {asArray(connectors).map((connector, i) => {
        const from = rects.get(connector.from)
        const to = rects.get(connector.to)
        if (!from || !to) {
          console.warn(`[Diagram] コネクタが参照するノードが見つかりません: "${connector.from}" -> "${connector.to}"`)
          return null
        }
        // from/to はスプレッド後に上書きする（id 文字列 → 矩形。後勝ちなので型も NormRect になる）
        return <Connector key={`connector-${i}`} {...connector} from={from} to={to} />
      })}

      {asArray(arrows).map((arrow, i) => (
        <Arrow key={`arrow-${i}`} {...arrow} />
      ))}

      {nodeList.map((node, i) => (
        <DiagramCard key={node.id ?? `node-${i}`} rect={node.rect} title={node.title} color={node.color} variant={node.variant} badge={node.badge === undefined ? undefined : <DiagramBadge color={node.color}>{node.badge}</DiagramBadge>}>
          {node.body}
        </DiagramCard>
      ))}

      {asArray(badges).map((badge, i) => (
        <DiagramBadge key={`badge-${i}`} at={badge.at} color={badge.color} shape={badge.shape}>
          {badge.text}
        </DiagramBadge>
      ))}

      {asArray(callouts).map((callout, i) => (
        <Callout key={`callout-${i}`} {...callout} />
      ))}
    </DiagramCanvas>
  )
}
