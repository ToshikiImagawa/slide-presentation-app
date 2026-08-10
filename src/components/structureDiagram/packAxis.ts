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
