import { asArray } from '../../data/loader'
import { DiagramCanvas, DiagramCard, Path, type LineEndShape } from '../diagram'
import { defaultSeriesColor } from '../structureDiagram/colors'
import { getAxisSlot, packAxis } from '../structureDiagram/packAxis'
import type { SequenceDiagramSpec } from './types'

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

      {messageList.map((message, i) => {
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
          />
        )
      })}

      {lifelineList.map((lifeline, i) => (
        <DiagramCard key={lifeline.id} rect={{ x: colSlots[i].offset, y: 0, w: colSlots[i].size, h: HEADER_HEIGHT }} title={lifeline.label ?? lifeline.id} color={lifelineColor(i)} />
      ))}
    </DiagramCanvas>
  )
}
