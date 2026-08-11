import type { LineEndShape } from '../diagram'

/**
 * 構成図（#205）が共通で使うノード/エッジのデータ構造。
 *
 * 階層構成図・サーバ/クラウド構成図・組織図・UMLクラス図のいずれも同じ形を使う（種別ごとに
 * 独自DSLを作らない・schema/slide-content-schema.json の structureNode/structureEdge と対応）。
 * #206（プロセス図群）・#207（分析図群）もこの形に乗る想定なので、フィールドを増やす場合は
 * ここと schema の両方に足す。
 *
 * フィールドの一部は特定の種別専用（row/col は UMLクラス図・parent は組織図・attributes/methods は
 * UMLクラス図）。未使用の種別ではそのフィールドを無視する。
 */
export type StructureNode = {
  id: string
  label?: string
  description?: string
  color?: string
  variant?: 'outline' | 'filled' | 'plain'
  /** 明示的な行位置（0始まり）。UMLクラス図でのみ使用。省略時は決定的な自動グリッド配置 */
  row?: number
  /** 明示的な列位置（0始まり）。UMLクラス図でのみ使用。省略時は決定的な自動グリッド配置 */
  col?: number
  /** 親ノードのid。組織図でのみ使用（ツリーの階層・配置をここから導出する） */
  parent?: string
  /** UMLクラス図でのみ使用 */
  attributes?: string[]
  /** UMLクラス図でのみ使用 */
  methods?: string[]
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

/** JSON 由来の値は配列でない可能性があるため、描画前に配列だけを通す（不正なデッキでデッキ全体を落とさない）。
 * 4つの構成図コンポーネントすべてが使う共通ヘルパー（Diagram.tsx/Flow.tsx と同じ考え方） */
export function asArray<T>(value: T[] | undefined): T[] {
  return Array.isArray(value) ? value : []
}
