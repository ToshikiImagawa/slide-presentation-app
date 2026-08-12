import type { LineEndShape } from '../diagram'

/**
 * 構成図（#205）・プロセス図（#206）が共通で使うノード/エッジのデータ構造。
 *
 * 階層構成図・サーバ/クラウド構成図・組織図・UMLクラス図・フローチャート・スイムレーンのいずれも
 * 同じ形を使う（種別ごとに独自DSLを作らない・schema/slide-content-schema.json の
 * structureNode/structureEdge と対応）。#207（分析図群）もこの形に乗る想定なので、フィールドを
 * 増やす場合はここと schema の両方に足す。
 *
 * フィールドの一部は特定の種別専用（row/col は UMLクラス図・フローチャート、col はスイムレーンの
 * フェーズ列位置としても使う・parent は組織図・attributes/methods は UMLクラス図・shape は
 * フローチャート）。未使用の種別ではそのフィールドを無視する。
 */
export type StructureNode = {
  id: string
  label?: string
  description?: string
  color?: string
  variant?: 'outline' | 'filled' | 'plain'
  /** 明示的な行位置（0始まり）。UMLクラス図・フローチャートでのみ使用。省略時は決定的な自動グリッド配置 */
  row?: number
  /** 明示的な列位置（0始まり）。UMLクラス図・フローチャートでは自動グリッド配置の列（省略時は決定的な
   * 自動配置）。スイムレーンでは「フェーズ（工程）列」の位置（省略時はレーン内の配列順） */
  col?: number
  /** 親ノードのid。組織図でのみ使用（ツリーの階層・配置をここから導出する） */
  parent?: string
  /** UMLクラス図でのみ使用 */
  attributes?: string[]
  /** UMLクラス図でのみ使用 */
  methods?: string[]
  /** フローチャート（#206）のノード種別（開始/処理/判断/終了）でのみ使用。省略時はprocess相当（矩形）。
   * variant（面の塗り方）とは独立した軸にした: variantは構成図・プロセス図すべてで共通の塗り方の
   * 意味を持つが、ノード形状（矩形/ピル/ひし形）はフローチャート固有の意味なので混ぜない */
  shape?: 'start' | 'process' | 'decision' | 'end'
}

/** UMLクラス図の関係種別。head/dashed の既定値を決める（#205） */
export type StructureEdgeType = 'association' | 'inheritance' | 'implements' | 'dependency'

/**
 * 構成図が共通で使うエッジ定義。#202 の Connector（DiagramLineStyleProps + from/to のid参照）と
 * 同じ形にしているため、Diagram の connectors props へそのまま渡せる（再実装しない）。
 */
export type StructureEdge = {
  from: string
  to: string
  label?: string
  color?: string
  dashed?: boolean
  head?: LineEndShape
  tail?: LineEndShape
  thickness?: number
  routing?: 'auto' | 'horizontal' | 'vertical'
  /** UMLクラス図のrelationsでのみ使用。head/dashed省略時の既定値を決める */
  type?: StructureEdgeType
}
