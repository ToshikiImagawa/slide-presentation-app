/**
 * 構成図（#205）の各種レイアウトが共有する1軸パッキング（Flow.tsx の等分配置と同じ考え方を汎用化）。
 *
 * count個の要素を [start, start + extent] の区間へ、隙間 gap を挟んで等分配置する。
 * 入力（count・start・extent・gap）だけで決まる純関数なので、同じ入力からは常に同じ配置になる
 * （乱数・力学モデルを使わない・#205 の受け入れ基準）。
 */
export type AxisSlot = { offset: number; size: number }

export function packAxis(count: number, start: number, extent: number, gap: number): AxisSlot[] {
  if (count <= 0) return []
  const size = (extent - gap * (count - 1)) / count
  return Array.from({ length: count }, (_, i) => ({ offset: start + i * (size + gap), size }))
}

/**
 * packAxis の戻り値を安全に添字アクセスする（#276）。row/col/startCol はスキーマ上 number のため、
 * 範囲外（負値・過大値）や非整数の指定が描画コードにそのまま渡ってくることがある。最も近い整数へ丸め、
 * 有効な添字範囲へクランプすることで、1スライドの不正値でアプリ全体が白画面になることを防ぐ
 * （computeGridLayout・Gantt・Swimlaneが共有し、クランプ処理を複製しない）。
 */
export function getAxisSlot(slots: AxisSlot[], index: number): AxisSlot {
  if (slots.length === 0) return { offset: 0, size: 0 }
  const clamped = Math.min(Math.max(Math.round(index), 0), slots.length - 1)
  return slots[clamped]
}
