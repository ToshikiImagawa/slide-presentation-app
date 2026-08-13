import { asArray } from '../../data/loader'
import type { GanttTask } from './Gantt'
import type { SwimlaneLane } from './Swimlane'

/**
 * axisの見出し数・tasksのstartCol+spanの最大値から列数を導出する（純関数）。Gantt本体と #279 の範囲外警告
 * （applyTheme.ts の getDiagramWarnings）が行数・列数の導出式を複製せずに済むよう共有する単一の真実源。
 *
 * Gantt.tsx/Swimlane.tsx から分離しているのは、両ファイルが Diagram を値としてimportしており
 * （Diagram → DiagramCard/DiagramBadge/DiagramLine が直接 resolveColorToken を applyTheme.ts から値import）、
 * applyTheme.ts から Gantt.tsx/Swimlane.tsx を値importすると循環importになるため
 * （このファイル冒頭のimportはGanttTask/SwimlaneLaneの型のみで、型importは実行時に消去されるため循環しない。
 * validateChart.ts が Chart.tsx/chart/index.ts から分離されているのと同じ理由）。
 *
 * 戻り値は必ず整数にする（Math.floor）。startColが非整数だとMax計算の結果も非整数になり得るが、
 * packAxisはArray.from({ length: count }) で count を暗黙に整数化する（ToLengthがfloorする）。
 * その整数化をこの関数1箇所で保証し、clampAxisIndex・packAxis側に書き写さない（#279）。
 */
export function computeGanttColCount(axisList: string[], taskList: GanttTask[]): number {
  return Math.floor(Math.max(axisList.length, ...taskList.map((task) => task.startCol + Math.max(1, task.span ?? 1)), 1))
}

/** phasesの見出し数・各レーンのノード数の最大値から列数を導出する（純関数）。分離している理由はcomputeGanttColCountと同じ */
export function computeSwimlaneColCount(phaseList: string[], laneList: SwimlaneLane[]): number {
  return Math.max(phaseList.length, ...laneList.map((lane) => asArray(lane.nodes).length), 1)
}
