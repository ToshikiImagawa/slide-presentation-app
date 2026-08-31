import { useEffect, useState } from 'react'
import { asArray } from '../../data/loader'
import { DiagramCanvas, DiagramCard, Path, type LineEndShape } from '../diagram'
import { useDiagramVisible } from '../diagram/DiagramCanvas'
import { defaultSeriesColor } from '../structureDiagram/colors'
import { getAxisSlot, packAxis, type AxisSlot } from '../structureDiagram/packAxis'
import type { SequenceDiagramSpec, SequenceMessage } from './types'

const MARGIN = 0.02
const COL_GAP = 0.04
const HEADER_HEIGHT = 0.12
const ROW_GAP = 0.02
/** 活性区間の帯の幅（列幅に対する比率）。列幅いっぱいにすると隣接列と接してしまうため細くする */
const ACTIVATION_WIDTH_RATIO = 0.3
/** 自己メッセージの「コの字」経路が右へ張り出す幅（列幅に対する比率）。0.5未満なら列の中心軸から
 * 隣接列の中心軸まで届かないため、列数が増えても隣のライフラインと重ならない */
const SELF_LOOP_RATIO = 0.45

/**
 * スライド JSON の `content.sequenceDiagram` を描画する UML シーケンス図（#269）。
 *
 * ライフライン（列）は配列順で左から右へ、メッセージ（行）は配列順で上から下へ配置する
 * （packAxis による決定的な等分配置。乱数・力学モデルは使わない）。3つの設計判断:
 *
 * 1. **同期/非同期メッセージの矢先**: DiagramLine が既に持つ head 形状のうち、'triangle'（塗り）を
 *    同期、'arrow'（開いた矢羽根）を非同期に割り当てた。LineEndShape の拡張は不要（DiagramLine.tsx参照）。
 * 2. **自己メッセージの経路**: Path（Arrow・Connectorに次ぐ3つ目の経路方式。任意の点列を結ぶ・#269で
 *    diagram/へ追加）で「コの字」の点列を組む。Connector の拡張は不要。
 * 3. **活性区間**: DiagramCard（NormRect + variant="filled"）をライフラインの列軸上に細く重ねるだけで
 *    表現できるため、専用の描画コンポーネントは追加しない。
 */
export function SequenceDiagram({ lifelines, messages, activations }: SequenceDiagramSpec) {
  const lifelineList = asArray(lifelines).filter((lifeline) => lifeline.id)
  if (lifelineList.length === 0) return null

  const messageList = asArray(messages).filter((message) => typeof message.from === 'string' && typeof message.to === 'string')
  const activationList = asArray(activations).filter((activation) => typeof activation.lifeline === 'string')

  const lifelineIndex = new Map(lifelineList.map((lifeline, i) => [lifeline.id, i]))
  const colSlots = packAxis(lifelineList.length, MARGIN, 1 - MARGIN * 2, COL_GAP)
  const colX = (i: number) => colSlots[i].offset + colSlots[i].size / 2
  const lifelineColor = (i: number) => lifelineList[i].color ?? defaultSeriesColor(i)

  const rowSlots = packAxis(messageList.length, HEADER_HEIGHT, 1 - HEADER_HEIGHT - MARGIN, ROW_GAP)
  // packAxisの最終スロットのoffset+sizeは常にstart+extent（= 1 - MARGIN）になる（size*count+gap*(count-1)=extentの定義通り）ため、
  // メッセージ0件かどうかで分岐する必要はない
  const spineBottom = 1 - MARGIN

  return (
    <DiagramCanvas>
      {lifelineList.map((_, i) => (
        <Path
          key={`spine-${i}`}
          points={[
            { x: colX(i), y: HEADER_HEIGHT },
            { x: colX(i), y: spineBottom },
          ]}
          dashed
          head="none"
          tail="none"
          thickness={1}
          color="neutral"
        />
      ))}

      {activationList.map((activation, i) => {
        const colIndex = lifelineIndex.get(activation.lifeline)
        if (colIndex === undefined || messageList.length === 0) return null
        // getAxisSlotで範囲外・非整数のfrom/toをガードする（#276と同じクランプ規則をclampAxisIndex経由で共有）
        const startRow = getAxisSlot(rowSlots, Math.min(activation.from, activation.to))
        const endRow = getAxisSlot(rowSlots, Math.max(activation.from, activation.to))
        const width = colSlots[colIndex].size * ACTIVATION_WIDTH_RATIO
        return <DiagramCard key={`activation-${i}`} rect={{ x: colX(colIndex) - width / 2, y: startRow.offset, w: width, h: endRow.offset + endRow.size - startRow.offset }} color={lifelineColor(colIndex)} variant="filled" />
      })}

      <SequenceMessages messageList={messageList} lifelineIndex={lifelineIndex} colX={colX} colSlots={colSlots} rowSlots={rowSlots} />

      {lifelineList.map((lifeline, i) => (
        <DiagramCard key={lifeline.id} rect={{ x: colSlots[i].offset, y: 0, w: colSlots[i].size, h: HEADER_HEIGHT }} title={lifeline.label ?? lifeline.id} color={lifelineColor(i)} />
      ))}
    </DiagramCanvas>
  )
}

type SequenceMessagesProps = {
  messageList: SequenceMessage[]
  lifelineIndex: Map<string, number>
  colX: (i: number) => number
  colSlots: AxisSlot[]
  rowSlots: AxisSlot[]
}

/**
 * メッセージ矢印を1本ずつ出現させる。DiagramCanvas の子として置く必要がある
 * （useDiagramVisible は DiagramCanvas が提供する Context を読むため）。
 *
 * 次の矢印は固定時間（setInterval）ではなく、**直前の矢印の描画アニメーション（.draw の
 * diagramLineDraw）が完了した時点**（polyline の onAnimationEnd）でマウントする。固定時間で試したところ、
 * 1本分の描画（delay 0.25s + draw 0.5s ≈ 0.75s）より短い間隔（0.55s）で次をマウントすると、前の矢印が
 * まだアニメーション中のうちに次のアニメーションがスケジュールされることになり、WebKit が「複数の
 * アニメーションが同時に進行中だと、片方の描画更新を継続的に反映せずまとめて完了状態へ飛ばす」不具合
 * （実機・Playwright動画録画で確認）を再発させた（実機報告「API→APIの折り返し矢印だけ変」。自己メッセージは
 * 経路が長く3辺+マーカーで構成されるため、この飛び跳ねが最も視認しやすかった）。完了イベント駆動にすることで、
 * 前の矢印が終わるまで次のアニメーションを一切スケジュールしないことを構造的に保証できる
 * （--theme-motion-scale でテーマ側の速度が変わっても追従する。固定時間の推測値は使わない）。
 *
 * 完了検知は「アニメーション名」ではなく「target が polyline かどうか」で判定する（CSS Modules は
 * @keyframes 名もローカルスコープ化してハッシュ付きの名前に変える。ビルドツールの実装詳細に依存する
 * 文字列一致は避ける）。矢印先端（marker）の .markerReveal フェードイン完了ではなく polyline 自身の
 * diagramLineDraw 完了を見ているのは、marker は <defs> 内の要素で animationend が確実に届くか保証しにくい
 * ため（polyline は実際にレンダリングされる要素で確実に届く）。矢印先端の 0.15s のフェードは次の矢印の
 * delay（0.25s）中に収まる程度の差でしかなく、視認上の破綻は生じない。dashed なスパインは無限
 * ループ（diagramLineFlow・animation-iteration-count:infinite）で animationend が発火しないため
 * 誤検知しない。全コンポーネント中唯一のJSタイマー駆動の演出（既存の TerminalAnimation と同じ位置づけ）で、
 * reference-deck 撮影時の finishSettlingAnimations では確定できない既知の残差として扱う */
function SequenceMessages({ messageList, lifelineIndex, colX, colSlots, rowSlots }: SequenceMessagesProps) {
  const visible = useDiagramVisible()
  const [revealCount, setRevealCount] = useState(0)

  useEffect(() => {
    setRevealCount(visible && messageList.length > 0 ? 1 : 0)
  }, [visible, messageList.length])

  // 存在しないライフラインidを参照するメッセージは描画されない（下のmapでnullを返す）ため
  // アニメーションが一切発生せず、onAnimationEnd が永遠に来ない。そのまま待つと以降のメッセージが
  // 出現しなくなるため、現在の番の内容が無効だとわかった時点で待たずに次へ進める
  useEffect(() => {
    if (revealCount === 0 || revealCount > messageList.length) return
    const current = messageList[revealCount - 1]
    if (!lifelineIndex.has(current.from) || !lifelineIndex.has(current.to)) {
      setRevealCount((count) => Math.min(count + 1, messageList.length))
    }
  }, [revealCount, messageList, lifelineIndex])

  return (
    // display:contents で自身はレイアウトに影響させず（子の Path は DiagramCanvas 基準の
    // position:absolute のまま）、onAnimationEnd だけをこの階層で束ねて拾う
    <div
      data-testid="sequence-messages"
      style={{ display: 'contents' }}
      onAnimationEnd={(event) => {
        if (!(event.target instanceof Element) || event.target.tagName !== 'polyline') return
        setRevealCount((count) => Math.min(count + 1, messageList.length))
      }}
    >
      {messageList.slice(0, revealCount).map((message, i) => {
        const fromIdx = lifelineIndex.get(message.from)
        const toIdx = lifelineIndex.get(message.to)
        if (fromIdx === undefined || toIdx === undefined) return null

        const row = rowSlots[i]
        const head: LineEndShape = message.type === 'async' ? 'arrow' : 'triangle'

        if (fromIdx === toIdx) {
          const x0 = colX(fromIdx)
          const dx = colSlots[fromIdx].size * SELF_LOOP_RATIO
          const y1 = row.offset + row.size * 0.28
          const y2 = row.offset + row.size * 0.72
          return (
            <Path
              key={`message-${i}`}
              points={[
                { x: x0, y: y1 },
                { x: x0 + dx, y: y1 },
                { x: x0 + dx, y: y2 },
                { x: x0, y: y2 },
              ]}
              head={head}
              label={message.label}
              staggerIndex={0}
            />
          )
        }

        const y = row.offset + row.size / 2
        return (
          <Path
            key={`message-${i}`}
            points={[
              { x: colX(fromIdx), y },
              { x: colX(toIdx), y },
            ]}
            head={head}
            label={message.label}
            staggerIndex={0}
          />
        )
      })}
    </div>
  )
}
