/**
 * UMLシーケンス図（#269）のデータ構造。
 *
 * 構成図（#205）の structureNode/structureEdge とは意図的に共有しない別のデータ構造にした
 * （#269 で判断済み）。ライフラインは列（横位置）で固定され、メッセージは時系列（縦位置=行）で
 * 順序を持つ「列×時間のグリッド上の有向イベント列」であり、箱同士を任意の位置で結ぶノード/エッジの
 * モデルには乗らない。lifelines/messages はいずれも配列順がそのまま配置の明示指定になる
 * （row/col のような明示位置フィールドは持たない。乱数・力学モデルは使わない）。
 */
export type SequenceLifeline = {
  id: string
  label?: string
  /** 省略時はライフラインの並び順にseries1〜series6を巡回して割り当てる */
  color?: string
}

/** メッセージの矢先種別。sync=塗り三角（既定）/ async=開いた矢羽根。
 * どちらも DiagramLine の既存の head 形状（'triangle'/'arrow'）で表現できるため、
 * LineEndShape の拡張は不要と判断した（#269。DiagramLine.tsx の MARKER_SHAPES 参照） */
export type SequenceMessageType = 'sync' | 'async'

export type SequenceMessage = {
  /** 送信元ライフラインのid */
  from: string
  /** 送信先ライフラインのid。fromと同じ値を指定すると自己メッセージとして描画する */
  to: string
  label?: string
  /** 省略時はsync（塗り三角） */
  type?: SequenceMessageType
}

/** 活性区間（ライフライン上の処理中を示す帯）。from/toはmessages配列の添字（0始まり・inclusive） */
export type SequenceActivation = {
  lifeline: string
  from: number
  to: number
}

export type SequenceDiagramSpec = {
  lifelines?: SequenceLifeline[]
  messages?: SequenceMessage[]
  activations?: SequenceActivation[]
}
