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
type NodeSpec = Pick<ComponentProps<typeof DiagramCard>, 'rect' | 'color' | 'variant' | 'shape' | 'staggerIndex' | 'staggerCount'> & {
  /** connectors から参照するための識別子 */
  id?: string
  title?: string
  body?: string
  /** 左上に重ねる番号・記号バッジ */
  badge?: string | number
  /**
   * 'background' を指定すると、ゾーン/レーンの背景枠のように connectors/arrows より先（背後）に描く
   * （ServerDiagram/Swimlane が使う。省略時は既定の描画順「線→カード」でカードが線の上に乗る）。
   * 背景枠は連結線・矢印が上を通過しても隠さない
   */
  layer?: 'background'
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
 * 描画順は「背景枠 → 線 → カード → バッジ → 引出線」。背景枠（layer:'background'）は線より先に描くため
 * 線を隠さない。カードは線の端を覆い、注釈（引出線）が最前面に来る。
 */
export function Diagram({ nodes, connectors, arrows, badges, callouts }: DiagramProps) {
  const nodeList = asArray(nodes).filter((node) => node.rect)
  const rects = new Map(nodeList.filter((node) => node.id !== undefined).map((node) => [node.id as string, node.rect]))
  const backgroundNodes = nodeList.filter((node) => node.layer === 'background')
  const foregroundNodes = nodeList.filter((node) => node.layer !== 'background')

  // staggerCount は出現delayのステップ圧縮に使う総数。node.staggerCount が明示されていればそれを使う
  // （Gantt/Swimlane のように、見出し・ラベル・本体が同じ配列に同居していても各グループ自身の件数を
  // 使わせたい場合に必須。foreground/background の配列長をそのまま使うと無関係なグループの件数が
  // 混ざって圧縮量を誤る）。未指定時は配列長にフォールバックする（Flowchart 等の単純な図解はこれで足りる）
  const renderCards = (list: NodeSpec[]) =>
    list.map((node, i) => (
      <DiagramCard
        key={node.id ?? `node-${i}`}
        rect={node.rect}
        title={node.title}
        color={node.color}
        variant={node.variant}
        shape={node.shape}
        badge={node.badge === undefined ? undefined : <DiagramBadge color={node.color}>{node.badge}</DiagramBadge>}
        staggerIndex={node.staggerIndex ?? i}
        staggerCount={node.staggerCount ?? list.length}
      >
        {node.body}
      </DiagramCard>
    ))

  const connectorList = asArray(connectors)

  return (
    <DiagramCanvas>
      {renderCards(backgroundNodes)}

      {connectorList.map((connector, i) => {
        const from = rects.get(connector.from)
        const to = rects.get(connector.to)
        if (!from || !to) {
          return null
        }
        // from/to はスプレッド後に上書きする（id 文字列 → 矩形。後勝ちなので型も NormRect になる）
        return <Connector key={`connector-${i}`} {...connector} from={from} to={to} staggerIndex={i} staggerCount={connectorList.length} />
      })}

      {asArray(arrows).map((arrow, i) => (
        <Arrow key={`arrow-${i}`} {...arrow} />
      ))}

      {renderCards(foregroundNodes)}

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
