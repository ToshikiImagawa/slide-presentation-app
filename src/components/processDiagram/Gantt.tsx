import { Diagram } from '../diagram'
import { defaultSeriesColor } from '../structureDiagram/colors'
import { packAxis } from '../structureDiagram/packAxis'
import { asArray } from '../structureDiagram/types'
import { axisHeaderNodes } from './axisHeaderNodes'

const LABEL_WIDTH = 0.2
const LABEL_GAP = 0.02
const HEADER_HEIGHT = 0.12
const MARGIN = 0.02
const ROW_GAP = 0.03
const COL_GAP = 0.01
/** バーは行の高さいっぱいではなく中央に細く見せる（期間バーらしい見た目にする） */
const BAR_HEIGHT_RATIO = 0.56

export type GanttTask = {
  label?: string
  /** 開始列（0始まり） */
  startCol: number
  /** 期間（列数）。省略時は1 */
  span?: number
  color?: string
}

export type GanttSpec = {
  /**
   * 時間軸の列見出し（例: ["1月", "2月", "3月"]）。列数を決める指定元でもある。
   *
   * 実カレンダー日付は扱わない設計判断（#206）: 発表内容ごとに工程の時間粒度（日/週/月/スプリント）が
   * 違い、日付演算（月末・タイムゾーン等）を正しく扱う複雑さに対して得られる恩恵が小さいため、
   * 「列 = 期間の単位」という離散スケールに決めた。この形は packAxis（構成図と共通の1軸パッキング）を
   * そのまま使えるため、独自のスケール計算も持たない。
   *
   * 省略時は見出しなしで、tasksの startCol + span の最大値から列数を導出する
   */
  axis?: string[]
  tasks?: GanttTask[]
}

/**
 * スライド JSON の `content.gantt` を描画するガント（工程の期間バー・#206）。
 *
 * 行=工程、列=時間軸の単位（axis）の表形式。行・列とも packAxis（構成図と共通の1軸パッキング）で
 * 等分配置するため、バーの位置・幅は常に同じ入力から同じ結果になる。ラベル・軸見出しは
 * DiagramCard（'plain'）に文字を収める（overflow: hidden があるため文言が長くてもキャンバス外へ
 * はみ出さない。DiagramBadge は中心基準で幅が伸びるため軸ラベル用途では使わない）。
 */
export function Gantt({ axis, tasks }: GanttSpec) {
  const taskList = asArray(tasks).filter((task) => typeof task.startCol === 'number')
  if (taskList.length === 0) return null

  const axisList = asArray(axis)
  const hasHeader = axisList.length > 0
  const headerHeight = hasHeader ? HEADER_HEIGHT : 0
  const colCount = Math.max(axisList.length, ...taskList.map((task) => task.startCol + Math.max(1, task.span ?? 1)), 1)

  const rowSlots = packAxis(taskList.length, headerHeight, 1 - headerHeight, ROW_GAP)
  const colSlots = packAxis(colCount, LABEL_WIDTH, 1 - LABEL_WIDTH - MARGIN, COL_GAP)

  const axisNodes = hasHeader ? axisHeaderNodes(axisList, colSlots, headerHeight, 'axis') : []

  const labelNodes = taskList.map((task, i) => ({
    id: `label-${i}`,
    rect: { x: 0, y: rowSlots[i].offset, w: LABEL_WIDTH - LABEL_GAP, h: rowSlots[i].size },
    title: task.label,
    variant: 'plain' as const,
  }))

  // colCount は全タスクの startCol + span を含めて導出している（上記）ため、
  // start/endCol は常に colSlots の範囲内になる（クランプ不要）
  const barNodes = taskList.map((task, i) => {
    const row = rowSlots[i]
    const start = colSlots[task.startCol]
    const endCol = task.startCol + Math.max(1, task.span ?? 1) - 1
    const end = colSlots[endCol]
    const barHeight = row.size * BAR_HEIGHT_RATIO
    return {
      id: `bar-${i}`,
      rect: { x: start.offset, y: row.offset + (row.size - barHeight) / 2, w: end.offset + end.size - start.offset, h: barHeight },
      color: task.color ?? defaultSeriesColor(i),
      variant: 'filled' as const,
    }
  })

  return <Diagram nodes={[...axisNodes, ...labelNodes, ...barNodes]} />
}
